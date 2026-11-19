# Releasing Singevery

## Prerequisites

- **Node 22.12+** (Electron 43 declares it in `engines`; `npm ci` fails on Node 20).
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
   - verifies `apps/desktop/build/smtc-dist/espejo-smtc.exe` exists and smoke-tests the packaged app before publishing
   - Uploads `Singevery-Setup-X.Y.Z.exe` to [GitHub Releases](https://github.com/Grizaceo/Singevery/releases).
5. **Linux and the demo video** are added to the same release from a Linux machine:
   ```bash
   cd apps/desktop && npm run install:linux   # builds, verifies and installs; artifacts stay in release/
   gh release upload vX.Y.Z \
     release/Singevery-X.Y.Z-x86_64.AppImage \
     release/Singevery-X.Y.Z-x86_64.AppImage.sha256.txt \
     release/Singevery-X.Y.Z-x64.tar.gz \
     path/to/singevery-trailer.mp4
   ```

The README embeds **`docs/demo.gif`** inline (GitHub does not play MP4 from release URLs without downloading) and links to the full trailer attached to the release. Videos are never committed: anything over a few MB lives as a release asset. Older demos stay attached to the release they shipped with (the v0.1.0 videos are on [v0.1.0](https://github.com/Grizaceo/Singevery/releases/tag/v0.1.0)); the old GIF is in `docs/archive/`.

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

## Smoke test — mandatory before publishing

Vitest cannot see anything that breaks **because of packaging**: files read with
`fs` from inside the `.asar`, native/WASM binaries, sidecar paths. Those are
exactly the things that fail in a build and work in dev. Run this on Windows,
ideally on a machine **without** Node or the .NET SDK installed:

- [ ] Installer opens, shows the license, installs; desktop and Start Menu shortcuts work.
- [ ] App launches; icon and name look right.
- [ ] Recognises a song via **system audio**, then via **microphone**.
- [ ] SMTC reacts to pause/seek → proves the self-contained sidecar shipped.
- [ ] A **Japanese** song shows furigana and romaji → proves `asarUnpack` of the
      kuromoji dictionary (`node_modules/kuromoji/dict/**`) worked.
- [ ] Recognition works at all → proves the shazamio-core `.wasm` was unpacked.
- [ ] Translate with MyMemory, and with a local runtime (Ollama) if available.
- [ ] Close and reopen: settings, per-track offsets and lyrics cache persist.
- [ ] Uninstall leaves nothing running.

Any red line here is a **stop**: do not publish the tag.

## Rollback

There is no server to roll back. For a desktop app, rolling back means:

1. Mark the bad release as **pre-release** (or delete it) on GitHub, so
   `releases/latest` serves the previous installer again — the landing page and
   the README badge follow `latest` automatically.
2. Open an issue describing the symptom so people who already installed it know.
3. Fix forward with a patch tag (`vX.Y.Z+1`); never re-tag an existing version.

Roll back if, on a clean machine: the app does not start, it recognises nothing,
lyrics never appear, or the installer is flagged as malware by a mainstream AV.

## Notes

- The installer is **unsigned**. Windows SmartScreen may warn on first run; choose **More info → Run anyway**.
  Publish the installer's **SHA-256** in the release notes so wary users can verify it:
  `Get-FileHash apps\desktop\release\Singevery-Setup-<version>.exe -Algorithm SHA256`
- AudD is optional (`AUDD_API_TOKEN` in `.env`); Shazam works without API keys. `.env` is excluded from the packaged app.
