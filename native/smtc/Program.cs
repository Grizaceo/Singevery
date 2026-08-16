// ============================================================================
// Espejo SMTC sidecar — lee la sesión de medios de Windows y emite JSON por
// stdout (una línea por evento) para que el proceso main de Electron lo consuma.
//
// Protocolo (ver electron/services/smtc/smtcReader.ts):
//   {"type":"track","title":...,"artist":...,"album":...,"durationMs":...,"positionMs":...,"playing":true}
//   {"type":"position","positionMs":...,"playing":true}
//   {"type":"playback","playing":false}
//
// Notas de robustez (bug YouTube vs Spotify):
//   - La Position de SMTC es un SNAPSHOT tomado en LastUpdatedTime. Spotify lo
//     refresca seguido, pero los navegadores (YouTube en Chrome/Edge) solo lo
//     actualizan en play/pausa/seek: sin proyectar el tiempo transcurrido, el
//     tick de 1s re-emitía una posición congelada y la letra se re-sincronizaba
//     hacia atrás en loop. ProjectedPositionMs() proyecta el snapshot a "ahora".
//   - Los navegadores disparan MediaPropertiesChanged varias veces por pista
//     (título, luego artista, luego carátula) y CurrentSessionChanged al mover
//     el foco de audio. Antes cada Hook() apilaba OTRO juego de handlers sobre
//     la sesión (fuga) → eventos duplicados en cascada. Ahora se des-suscribe
//     la sesión anterior y se dedupea el 'track' por título/artista/álbum.
//
// Build (requiere .NET 8 SDK en Windows):
//   dotnet publish -c Release -r win-x64 --self-contained false -o dist
// Luego apunta la app al exe con la variable de entorno SMTC_SIDECAR.
// ============================================================================

using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Media.Control;

class Program
{
    static GlobalSystemMediaTransportControlsSessionManager? _mgr;
    static readonly object _lock = new();
    static readonly object _hookLock = new();

    static GlobalSystemMediaTransportControlsSession? _current;
    static TypedEventHandler<GlobalSystemMediaTransportControlsSession, MediaPropertiesChangedEventArgs>? _onProps;
    static TypedEventHandler<GlobalSystemMediaTransportControlsSession, PlaybackInfoChangedEventArgs>? _onPlayback;
    static TypedEventHandler<GlobalSystemMediaTransportControlsSession, TimelinePropertiesChangedEventArgs>? _onTimeline;

    /// Firma del último 'track' emitido: dedupe de MediaPropertiesChanged
    /// repetidos para la misma pista (los navegadores lo disparan varias veces).
    static string _lastTrackSig = "";

    /// Momento (UTC) en que se detectó el último cambio de pista.
    ///
    /// Los navegadores disparan MediaPropertiesChanged ANTES que
    /// TimelinePropertiesChanged: justo tras cambiar de vídeo, el timeline que
    /// se lee todavía es el del vídeo ANTERIOR. Emitir su Position —y peor, su
    /// proyección— manda la posición de otra canción, y del lado de Electron eso
    /// se traduce en un salto duro hacia adelante (computeDrift → snap).
    static DateTimeOffset _trackChangedAt = DateTimeOffset.MinValue;

    /// Techo de la proyección del snapshot.
    ///
    /// El snapshot de un navegador puede quedarse quieto minutos. Proyectar todo
    /// ese hueco asume que el vídeo estuvo reproduciendo sin anuncios, sin
    /// buffering y sin pausas; el error se acumula ENTERO hacia adelante y la
    /// letra corre de más. Pasado este techo el snapshot ya no es información
    /// fresca: mejor una posición acotada que una inventada.
    const double MAX_PROJECTION_MS = 30_000;

    /// Cuánto se desconfía del timeline tras un cambio de pista. Pasado el
    /// plazo se vuelve a aceptar aunque su marca sea vieja: hay reproductores
    /// que no refrescan el timeline nunca, y quedarse sin posición para siempre
    /// sería peor que una posición acotada.
    const double STALE_GRACE_MS = 5000;

    // ==========================================================================
    // Detección de padre muerto (anti-zombie).
    // Electron spawna este exe con stdio pipe. Si el proceso main muere (crash,
    // force-kill en Task Manager, cierre forzado), en Windows el hijo queda
    // HUÉRFANO: nadie lo mata, y como el heartbeat se emite SIEMPRE, la pipe
    // rota provoca IOException en la primera escritura → Environment.Exit.
    // El watcher (cada 2 s) es la red de seguridad para el caso sin medios:
    // aunque el heartbeat se emita siempre, verifica activamente que el padre
    // siga vivo. Sin esto, el exe quedaba vivo para siempre con su
    // Task.Delay(Infinite) y un Timer de 1 s (ver docs/DIAGNOSTICO_ZOMBIES_2026-08-03.md).
    // ==========================================================================
    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_BASIC_INFORMATION
    {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        public IntPtr Reserved2_0;
        public IntPtr Reserved2_1;
        public IntPtr UniqueProcessId;
        public IntPtr InheritedFromUniqueProcessId;
    }

    [DllImport("ntdll.dll")]
    static extern int NtQueryInformationProcess(
        IntPtr processHandle,
        int processInformationClass,
        ref PROCESS_BASIC_INFORMATION processInformation,
        int processInformationLength,
        out int returnLength);

    static int GetParentProcessId(Process p)
    {
        var pbi = new PROCESS_BASIC_INFORMATION();
        int ret = NtQueryInformationProcess(p.Handle, 0, ref pbi, Marshal.SizeOf(pbi), out _);
        return ret == 0 ? (int)pbi.InheritedFromUniqueProcessId : -1;
    }

    static void StartParentWatcher(int parentPid)
    {
        if (parentPid <= 0) return; // no se pudo determinar el padre: sin watcher
        var timer = new Timer(_ =>
        {
            try
            {
                // Process.GetProcessById lanza ArgumentException si no existe.
                _ = Process.GetProcessById(parentPid);
            }
            catch (ArgumentException)
            {
                // El padre murió: el heartbeat ya fallará (pipe rota), pero
                // terminamos de forma explícita y limpia.
                Environment.Exit(0);
            }
        }, null, 2000, 2000);
        GC.KeepAlive(timer);
    }

    static async Task Main()
    {
        _mgr = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        _mgr.CurrentSessionChanged += (_, __) => Hook(_mgr.GetCurrentSession());
        Hook(_mgr.GetCurrentSession());

        // Emitir posición periódicamente. Con ProjectedPositionMs el tick avanza
        // aunque la fuente (navegador) actualice su snapshot con poca frecuencia.
        var timer = new Timer(_ => EmitPosition(_mgr?.GetCurrentSession()), null, 1000, 1000);

        // Heartbeat incondicional: sin sesión de medios el sidecar no escribe
        // nada; si el padre murió, esta escritura rompe por la pipe rota y el
        // proceso termina (anti-zombie, ver docs/DIAGNOSTICO_ZOMBIES_2026-08-03.md).
        var hb = new Timer(_ => Write(new { type = "heartbeat" }), null, 5000, 5000);

        // Watcher de padre muerto (red de seguridad, 2 s).
        StartParentWatcher(GetParentProcessId(Process.GetCurrentProcess()));

        // Mantener vivo el proceso.
        await Task.Delay(Timeout.Infinite);
        GC.KeepAlive(timer);
        GC.KeepAlive(hb);
    }

    static void Hook(GlobalSystemMediaTransportControlsSession? session)
    {
        lock (_hookLock)
        {
            // Des-suscribir la sesión anterior: sin esto, cada cambio de sesión
            // apilaba handlers duplicados (y de sesiones muertas) para siempre.
            if (_current != null)
            {
                try
                {
                    if (_onProps != null) _current.MediaPropertiesChanged -= _onProps;
                    if (_onPlayback != null) _current.PlaybackInfoChanged -= _onPlayback;
                    if (_onTimeline != null) _current.TimelinePropertiesChanged -= _onTimeline;
                }
                catch { /* sesión ya liberada por el SO */ }
            }

            _current = session;
            // Sesión nueva: re-emitir el 'track' aunque la firma coincida (p. ej.
            // volver a la misma pestaña de YouTube tras pasar por Spotify).
            _lastTrackSig = "";
            if (session == null) return;

            _onProps = async (s, _) => await EmitTrack(s);
            _onPlayback = (s, _) => EmitPlayback(s);
            _onTimeline = (s, _) => EmitPosition(s);
            session.MediaPropertiesChanged += _onProps;
            session.PlaybackInfoChanged += _onPlayback;
            session.TimelinePropertiesChanged += _onTimeline;

            _ = EmitTrack(session);
            EmitPosition(session);
        }
    }

    static bool IsPlaying(GlobalSystemMediaTransportControlsSession? s)
    {
        var status = s?.GetPlaybackInfo()?.PlaybackStatus;
        return status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
    }

    /// ¿El timeline que estamos leyendo es todavía el de la pista ANTERIOR?
    ///
    /// Solo se puede saber comparando su marca con el instante del cambio de
    /// pista. Si la sesión no reporta marca fiable (LastUpdatedTime = 1601) no
    /// hay nada que comparar y se confía: negarse siempre dejaría sin posición a
    /// reproductores que hoy funcionan.
    static bool TimelineIsStale(GlobalSystemMediaTransportControlsSessionTimelineProperties tl)
    {
        if (_trackChangedAt == DateTimeOffset.MinValue) return false;
        // Pasado el plazo de gracia se acepta igual (ver STALE_GRACE_MS).
        if ((DateTimeOffset.UtcNow - _trackChangedAt).TotalMilliseconds > STALE_GRACE_MS) return false;
        var updated = tl.LastUpdatedTime;
        if (updated.Year <= 2000) return false;
        return updated.ToUniversalTime() < _trackChangedAt;
    }

    /// Posición real "ahora": snapshot + tiempo transcurrido desde que el
    /// reproductor lo reportó (si está sonando). Clave para navegadores, cuyo
    /// snapshot puede quedarse quieto varios segundos (o minutos) en YouTube.
    ///
    /// La proyección va ACOTADA por dos lados. Sin esos topes, un snapshot viejo
    /// de YouTube (que solo se refresca en play/pausa/seek) sumaba minutos
    /// enteros y la letra se disparaba hacia adelante:
    ///   - por tiempo: MAX_PROJECTION_MS, porque proyectar un hueco largo asume
    ///     reproducción continua (sin anuncios, buffering ni pausas);
    ///   - por duración: una posición mayor que la canción es imposible, y
    ///     delata justo una proyección desbocada o un snapshot de otra pista.
    static long ProjectedPositionMs(GlobalSystemMediaTransportControlsSessionTimelineProperties tl, bool playing)
    {
        var pos = tl.Position.TotalMilliseconds;
        if (playing)
        {
            var updated = tl.LastUpdatedTime;
            // Algunas sesiones reportan LastUpdatedTime = 0 (año 1601): no proyectar.
            if (updated.Year > 2000)
            {
                var elapsed = (DateTimeOffset.UtcNow - updated.ToUniversalTime()).TotalMilliseconds;
                if (elapsed > 0) pos += Math.Min(elapsed, MAX_PROJECTION_MS);
            }
        }
        if (pos < 0) pos = 0;
        var end = tl.EndTime.TotalMilliseconds;
        if (end > 0 && pos > end) pos = end;
        return (long)pos;
    }

    static async Task EmitTrack(GlobalSystemMediaTransportControlsSession? s)
    {
        if (s == null) return;
        try
        {
            var props = await s.TryGetMediaPropertiesAsync();
            var title = props.Title ?? "";
            var artist = props.Artist ?? "";
            var album = string.IsNullOrEmpty(props.AlbumTitle) ? null : props.AlbumTitle;

            // Dedupe: los navegadores disparan MediaPropertiesChanged en ráfaga
            // para la MISMA pista (metadata parcial, luego carátula). Emitir
            // solo cuando la identidad cambia; la posición fluye por su canal.
            var sig = $"{title}\u0001{artist}\u0001{album}";
            lock (_hookLock)
            {
                if (sig == _lastTrackSig) return;
                _lastTrackSig = sig;
                _trackChangedAt = DateTimeOffset.UtcNow;
            }

            // Pista sin identidad útil (metadata aún no cargada): no emitir.
            if (title.Length == 0 && artist.Length == 0) return;

            var playing = IsPlaying(s);
            var tl = s.GetTimelineProperties();
            // Timeline aún sin refrescar para esta pista: su Position y su
            // EndTime son los de la canción ANTERIOR. Una canción que acaba de
            // empezar está en 0, y el canal 'position' corrige en ≤1s ya con el
            // timeline fresco. Mandar la posición vieja PROYECTADA era el salto
            // hacia adelante al cambiar de canción en YouTube.
            var stale = TimelineIsStale(tl);
            Write(new
            {
                type = "track",
                title,
                artist,
                album,
                durationMs = stale ? (long?)null : (long)tl.EndTime.TotalMilliseconds,
                positionMs = stale ? 0 : ProjectedPositionMs(tl, playing),
                playing,
            });
        }
        catch { /* sesión cambiando: ignorar */ }
    }

    static void EmitPosition(GlobalSystemMediaTransportControlsSession? s)
    {
        if (s == null) return;
        try
        {
            var playing = IsPlaying(s);
            var tl = s.GetTimelineProperties();
            // Timeline de la pista anterior: callar. El tick de 1s vuelve a
            // preguntar, y TimelinePropertiesChanged dispara en cuanto llega el
            // primero de la pista nueva. Emitir aquí sería mandar la posición de
            // otra canción justo cuando la letra nueva se está anclando.
            if (TimelineIsStale(tl)) return;
            Write(new
            {
                type = "position",
                positionMs = ProjectedPositionMs(tl, playing),
                playing,
            });
        }
        catch { }
    }

    static void EmitPlayback(GlobalSystemMediaTransportControlsSession? s)
    {
        if (s == null) return;
        Write(new { type = "playback", playing = IsPlaying(s) });
    }

    static void Write(object o)
    {
        lock (_lock)
        {
            try
            {
                Console.WriteLine(JsonSerializer.Serialize(o));
                Console.Out.Flush();
            }
            catch (IOException)
            {
                // Pipe rota: el padre ya no lee (murió o se cerró). Si no
                // salimos aquí, este exe queda vivo como zombie con su timer
                // de 1 s. Anti-zombie: terminar.
                Environment.Exit(1);
            }
        }
    }
}
