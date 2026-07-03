# Releasing Singevery

## Prerequisites

- Version bumped in `apps/desktop/package.json` (and `package-lock.json` if you changed deps).
- SMTC sidecar builds cleanly: `dotnet publish native/smtc/EspejoSmtc.csproj -c Release -r win-x64 -o native/smtc/dist`.
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
   - `dotnet publish` for the SMTC sidecar
   - `npm run package` → NSIS installer
   - Uploads `Singevery-Setup-X.Y.Z.exe` plus `docs/demo-readme.mp4` and `docs/demo.mp4` to [GitHub Releases](https://github.com/Grizaceo/Singevery/releases) (the README embeds the short demo from the release CDN).

If you add or replace demo videos on an **existing** release without cutting a new tag, run the **Upload demo assets** workflow (`Actions → Upload demo assets → Run workflow`) or push a change under `docs/demo-readme.mp4`.

## Local builds

### Windows (native)

```powershell
.\native\smtc\build.ps1
cd apps\desktop
npm ci
npm run package
```

Installer: `apps/desktop/release/Singevery-Setup-<version>.exe`.

### Docker (reproducible, Linux/macOS host)

```powershell
.\scripts\docker-build.ps1
```

Uses `electronuserland/builder:wine` + .NET 8 SDK. Same output path: `apps/desktop/release/`.

## Notes

- The installer is **unsigned**. Windows SmartScreen may warn on first run; choose **More info → Run anyway**.
- AudD is optional (`AUDD_API_TOKEN` in `.env`); Shazam works without API keys. `.env` is excluded from the packaged app.
