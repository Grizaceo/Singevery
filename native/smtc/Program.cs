// ============================================================================
// Espejo SMTC sidecar — lee la sesión de medios de Windows y emite JSON por
// stdout (una línea por evento) para que el proceso main de Electron lo consuma.
//
// Protocolo (ver electron/services/smtc/smtcReader.ts):
//   {"type":"track","title":...,"artist":...,"album":...,"durationMs":...,"positionMs":...,"playing":true}
//   {"type":"position","positionMs":...,"playing":true}
//   {"type":"playback","playing":false}
//
// Build (requiere .NET 8 SDK en Windows):
//   dotnet publish -c Release -r win-x64 --self-contained false -o dist
// Luego apunta la app al exe con la variable de entorno SMTC_SIDECAR.
// ============================================================================

using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Windows.Media.Control;

class Program
{
    static GlobalSystemMediaTransportControlsSessionManager? _mgr;
    static readonly object _lock = new();

    static async Task Main()
    {
        _mgr = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        _mgr.CurrentSessionChanged += (_, __) => Hook(_mgr.GetCurrentSession());
        Hook(_mgr.GetCurrentSession());

        // Emitir posición periódicamente (la posición de SMTC es un snapshot;
        // un tick de 1s mantiene la sincronización fina sin depender solo de eventos).
        var timer = new Timer(_ => EmitPosition(_mgr?.GetCurrentSession()), null, 1000, 1000);

        // Mantener vivo el proceso.
        await Task.Delay(Timeout.Infinite);
        GC.KeepAlive(timer);
    }

    static GlobalSystemMediaTransportControlsSession? _current;

    static void Hook(GlobalSystemMediaTransportControlsSession? session)
    {
        if (session == null) return;
        _current = session;
        session.MediaPropertiesChanged += async (s, _) => await EmitTrack(s);
        session.PlaybackInfoChanged += (s, _) => EmitPlayback(s);
        session.TimelinePropertiesChanged += (s, _) => EmitPosition(s);
        _ = EmitTrack(session);
        EmitPosition(session);
    }

    static bool IsPlaying(GlobalSystemMediaTransportControlsSession? s)
    {
        var status = s?.GetPlaybackInfo()?.PlaybackStatus;
        return status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
    }

    static async Task EmitTrack(GlobalSystemMediaTransportControlsSession? s)
    {
        if (s == null) return;
        try
        {
            var props = await s.TryGetMediaPropertiesAsync();
            var tl = s.GetTimelineProperties();
            Write(new
            {
                type = "track",
                title = props.Title ?? "",
                artist = props.Artist ?? "",
                album = string.IsNullOrEmpty(props.AlbumTitle) ? null : props.AlbumTitle,
                durationMs = (long)tl.EndTime.TotalMilliseconds,
                positionMs = (long)tl.Position.TotalMilliseconds,
                playing = IsPlaying(s),
            });
        }
        catch { /* sesión cambiando: ignorar */ }
    }

    static void EmitPosition(GlobalSystemMediaTransportControlsSession? s)
    {
        if (s == null) return;
        try
        {
            var tl = s.GetTimelineProperties();
            Write(new
            {
                type = "position",
                positionMs = (long)tl.Position.TotalMilliseconds,
                playing = IsPlaying(s),
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
            Console.WriteLine(JsonSerializer.Serialize(o));
            Console.Out.Flush();
        }
    }
}
