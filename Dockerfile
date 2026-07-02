# Reproducible Windows installer build (NSIS via Wine + .NET SMTC sidecar).
# Run via scripts/docker-build.ps1 — output lands in apps/desktop/release/.
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

COPY native/smtc/ native/smtc/
RUN dotnet publish native/smtc/EspejoSmtc.csproj -c Release -r win-x64 --self-contained false -o native/smtc/dist

COPY apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/
WORKDIR /project/apps/desktop
RUN npm ci

COPY apps/desktop/ ./

CMD ["sh", "-c", "npm run build && npx electron-builder --config electron-builder.yml --win nsis"]
