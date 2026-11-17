# Checklist de prueba — Singevery 0.2.1-beta.2 (candidato Windows)

Para devolverme los resultados de la prueba end-to-end en tu notebook Windows.

- **Paquete:** `Singevery-Setup-0.2.1-beta.2.exe`
- **SHA-256:** `fdab88b484acc6554bf3f37654d47209f46f8eb9692b0ca3ca5dead0d5be4123`
- **Commit origen:** `8a25e9c4c1c5c8c5237503a81dd768fdebe340eb` (rama `linux-wayland`)
- **Tamaño:** 147.496.780 bytes
- **Descarga:** `https://omarchy-1.tail7b473b.ts.net/Singevery-Setup-0.2.1-beta.2.exe`
  (sólo dentro de tu tailnet; no es una URL pública)

Marca cada línea con **OK** / **FALLA** / **NO PROBADO** y anota qué pasó. No
incluyas claves, tokens ni datos personales en las notas: pega sólo
descripciones del síntoma.

---

## 0. Verificar el archivo antes de instalar

1. Descarga el `.exe` y el `.sha256.txt` del mismo origen.
2. En **PowerShell**:
   ```powershell
   Get-FileHash .\Singevery-Setup-0.2.1-beta.2.exe -Algorithm SHA256
   ```
3. Compara con `fdab88b484acc6554bf3f37654d47209f46f8eb9692b0ca3ca5dead0d5be4123`.
   - **Debe coincidir exactamente.** Si no, borra el archivo y vuelve a
     descargar. No lo instales.

## 1. Instalación

4. Doble clic en el instalador.
5. Si Windows SmartScreen lo marca como «aplicación no reconocida»: es
   esperado — el instalador **no está firmado con un certificado de
   Microsoft**, sólo lleva metadatos de versión. Haz clic en
   **«Más información» → «Ejecutar de todas formas»**. No desactives
   SmartScreen, Defender ni el Firewall: no hace falta y sólo bajarías tu
   seguridad.
6. Elige carpeta (por defecto en tu perfil), deja las casillas de accesos
   directos como están, pulsa **Instalar**.
7. Al terminar se abre la app automáticamente (`runAfterFinish`).
   - **Resultado:** ______

> Nota: **no hace falta instalar .NET 8** — el runtime va dentro del paquete.
> Si Windows pide instalar algo aparte, para y anótalo: sería un defecto.

## 2. Primer arranque

8. ¿Aparece la ventana transparente con «Esperando música…»?
   - **Resultado:** ______
9. ¿Aparece la pantalla de bienvenida beta? **Resultado:** ______
10. ¿Hay errores visibles? **Resultado:** ______

## 3. Permisos

11. Si pulsas **«Audio sistema»**, Windows muestra un aviso de
    «compartir pantalla». **Acéptalo** (es el permiso `display-capture`).
    - **Resultado:** ______
12. Si pulsas **«Micrófono»**, acepta el permiso. En Opciones → Audio
    debería verse el medidor de nivel.
    - **Resultado:** ______

## 4. Reconocimiento con música real (lo más importante)

13. Reproduce una canción conocida en **Spotify** (o YouTube en el
    navegador). Pon el volumen de Windows al 50-70 %.
    - **Resultado:** ______
14. ¿La app identifica la canción sola? ¿En cuántos segundos?
    - **Resultado:** ______
15. ¿Aparece la letra? **Resultado:** ______
16. Si **no** identifica: usa **🔍 Buscar** y escribe título + artista a mano.
    - **Resultado:** ______
17. Si usaste AudD: ¿configuraste tú `AUDD_API_TOKEN` en el `.env` de tu
    notebook? (el instalador **no** trae ninguno)
    - **Resultado:** ______

## 5. Sincronización

18. Con la letra cargada, **pausa** la canción. ¿La letra se detiene?
    - **Resultado:** ______
19. **Reanuda**. ¿Sigue el ritmo? **Resultado:** ______
20. Haz **seek** (arrastra la canción al medio, o salta con las flechas).
    ¿La letra salta a la posición correcta?
    - **Resultado:** ______
21. Cambia a **otra canción**. ¿La letra cambia rápido o se queda pegada a la
    anterior?
    - **Resultado:** ______
22. Si va lento, anótalo como «demora» y di cuánto (en segundos) a ojo.

## 6. Overlay, espejo y click-through

23. ¿El fondo se ve transparente sobre lo que hay detrás?
    - **Resultado:** ______
24. Activa **modo espejo** (texto invertido). ¿Se lee reflejado en un espejo
    físico o pantalla?
    - **Resultado:** ______
25. Activa **click-through / ghost**: ¿puedes hacer clic a través de la
    ventana hacia lo que está detrás?
    - **Resultado:** ______
26. ¿La ventana se puede **arrastrar** y **redimensionar**?
    - **Resultado:** ______
27. Prueba sobre un **juego en pantalla completa**. ¿La letra se ve encima
    sin cortar el juego?
    - **Resultado:** ______

## 7. Modos de lectura

28. Cyclea por los modos (original, furigana, romaji, kana, IPA…) con los
    controles de lectura. ¿Cambian sin romper el layout?
    - **Resultado:** ______
29. Si usas canción japonesa: ¿el furigana aparece sobre el kanji?
    - **Resultado:** ______
30. ¿El IPA se ve bien? **Resultado:** ______

## 8. Letra propia (LRC) y traducción

31. Importa una letra propia desde disco (**↥**). ¿Carga y sincroniza?
    - **Resultado:** ______
32. Activa **T** (traducción). El proveedor por defecto es `mymemory`
    (sin clave).
    - **Resultado:** ______
33. Si la traducción falla o tarda mucho: **anótalo** — puede ser cuota de
    MyMemory, no un defecto de la app.

## 9. Práctica vocal (opcional)

34. Pulsa **♪** con música sonando. ¿Captura la melodía de referencia?
    - **Resultado:** ______
35. La **segunda** vez con la misma canción, ¿funciona al instante
    (referencia guardada en disco)?
    - **Resultado:** ______

## 10. Cierre y procesos residuales

36. Cierra la app con la **X**. ¿Cierra de verdad o queda colgada?
    - **Resultado:** ______
37. Cierra con música reproduciéndose y luego **sin** música. ¿Algún
    proceso queda vivo?
    - **Resultado:** ______
38. En **PowerShell**, comprueba que no quedaron procesos de Singevery:
    ```powershell
    Get-Process | Where-Object { $_.ProcessName -match 'Singevery|espejo-smtc' }
    ```
    - **Resultado:** ______
39. ¿El PC sigue rápido tras cerrar (sin consumo de CPU/CPU fan)?
    - **Resultado:** ______

---

## Bloqueos conocidos de este candidato (léelo antes de reportar)

Estas funciones **no** funcionan en este paquete por diseño, no son bugs:

- **AudD**: sin token configurado. Se usa Shazam (gratis) como motor.
- **Traducción con DeepL o Google**: requieren clave; no se configuró ninguna.
- **Traducción IA local**: el runtime embebido (llama.cpp) no está
  compilado en este paquete, así que no aparece como opción.
- **Wake word**: no configurado (opt-in).

## Cómo reportar fallos sin filtrar datos

- Describe el **síntoma** y **en qué paso** ocurrió.
- No pegues el contenido de tu `.env`, ni tokens, ni letras con derechos.
- Para bugs del reconocimiento, sirve: qué canción (artista/título, sin
  letra), qué reproductor, y el mensaje exacto de error.
- Si la app dejó un log, puedes pegar **sólo** las líneas del error. Revisa que
  no contengan rutas con tu nombre de usuario ni claves.

## Después

Con tus resultados decido si hay que corregir algo antes de preparar la
publicación en GitHub Releases y la landing con Cloudflare (hoy bloqueadas
por falta de credenciales en esta máquina).
