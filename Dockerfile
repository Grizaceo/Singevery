# Reproducible Windows installer build (NSIS via Wine + .NET SMTC sidecar).
# Run via scripts/docker-build.ps1 — output lands in apps/desktop/release/.
#
# Alineado con el flujo canónico (package:full): el sidecar se publica
# AUTOCONTENIDO a apps/desktop/build/smtc-dist (lo que consume
# electron-builder.yml), se generan los avisos de terceros y se verifican
# entradas y salida. El .env local queda fuera por .dockerignore.
FROM electronuserland/builder:wine

ENV DEBIAN_FRONTEND=noninteractive

# .NET 8 SDK for cross-compiling the Windows SMTC sidecar from Linux.
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
  && wget -q https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh \
  && chmod +x /tmp/dotnet-install.sh \
  && /tmp/dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet \
  && ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
  && rm /tmp/dotnet-install.sh \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /project

# Documentos legales que electron-builder exige en extraFiles y el sidecar SMTC.
COPY LICENSE AVISO_LEGAL.md GUIA_DE_USO.md ./
COPY native/smtc/ native/smtc/

COPY apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/
WORKDIR /project/apps/desktop
RUN npm ci

COPY apps/desktop/ ./

# package:full = build:smtc (autocontenido → build/smtc-dist) + build + notices
# + verify:package-inputs + electron-builder + verify:package-output.
CMD ["sh", "-c", "npm run package:full"]
