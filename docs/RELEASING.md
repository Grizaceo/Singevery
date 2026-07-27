# Releasing Singevery

## Prerequisites

- Version bumped in `apps/desktop/package.json` (and `package-lock.json` if you changed deps).
- SMTC sidecar builds cleanly **self-contained**: `dotnet publish native/smtc/EspejoSmtc.csproj -c Release -r win-x64 --self-contained true -o native/smtc/dist` (or just `npm run build:smtc`).
  `--self-contained true` is not optional for public builds: without it the sidecar needs .NET 8 installed on the user's machine and dies silently when it isn't, losing instant pause/seek.
- CI green on `main` (lint, tests, build).

## Cut a release

1. **Bump version** — set `"version"` in `apps/desktop/package.json` to `X.Y.Z`.
2. **Commit and push** to `main`:
   ```bash
   git add apps/desktop/package.json apps/desktop/package-lock.json
   git commit -m "chore: release vX.Y.Z"
   git push origin main
   ```
3. **Tag and push** the tag (triggers the release workflow):
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
4. **GitHub Actions** (`release.yml`) builds on `windows-latest`:
   - `npm ci` in `apps/desktop`
   - `npm run lint` + `npm test` (quality gate — no red tests reach users)
   - `npm run package:full` → self-contained SMTC sidecar + NSIS installer
   - verifies `native/smtc/dist/espejo-smtc.exe` exists before publishing
   - Uploads `Singevery-Setup-X.Y.Z.exe` plus `docs/demo-readme.mp4` and `docs/demo.mp4` to [GitHub Releases](https://github.com/Grizaceo/Singevery/releases) (linked from the README; the inline demo is the GIF in `docs/demo.gif`).

The README embeds **`docs/demo.gif`** inline (GitHub does not play MP4 from release URLs without downloading). For a native MP4 player in the README, edit it once on github.com and drag `docs/demo-readme.mp4` into the editor — GitHub uploads it to `user-attachments` and inserts a playable URL.

If you add or replace demo videos on an **existing** release without cutting a new tag, run the **Upload demo assets** workflow (`Actions → Upload demo assets → Run workflow`) or push a change under `docs/demo-readme.mp4`.

## Local builds

### Windows (native)

```powershell
cd apps\desktop
npm ci
npm run package:full
```

Installer: `apps/desktop/release/Singevery-Setup-<version>.exe`.

`package:full` = sidecar autocontenido + build + avisos de terceros + instalador.
Usa `npm run package` (sin `:full`) solo si ya compilaste el sidecar y no cambió;
para cualquier build que salga de tu equipo, usa siempre `package:full`.

### Docker (reproducible, Linux/macOS host)

```powershell
.\scripts\docker-build.ps1
```

Uses `electronuserland/builder:wine` + .NET 8 SDK. Same output path: `apps/desktop/release/`.

## Notes

- The installer is **unsigned**. Windows SmartScreen may warn on first run; choose **More info → Run anyway**.
- AudD is optional (`AUDD_API_TOKEN` in `.env`); Shazam works without API keys. `.env` is excluded from the packaged app.
