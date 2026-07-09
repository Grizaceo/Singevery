# Crea accesos directos de Singevery en el Escritorio.
# Uso (PowerShell): ./scripts/create-shortcuts.ps1

$ErrorActionPreference = 'Stop'

$appDir = Split-Path -Parent $PSScriptRoot   # apps/desktop
$desktop = [Environment]::GetFolderPath('Desktop')
$electronExe = Join-Path $appDir 'node_modules\electron\dist\electron.exe'
$icon = if (Test-Path $electronExe) { $electronExe } else { "$env:SystemRoot\System32\shell32.dll,167" }

$shell = New-Object -ComObject WScript.Shell

function New-Shortcut([string]$name, [string]$targetScript, [string]$description) {
    $lnk = $shell.CreateShortcut((Join-Path $desktop "$name.lnk"))
    $lnk.TargetPath = Join-Path $appDir "scripts\$targetScript"
    $lnk.WorkingDirectory = $appDir
    $lnk.IconLocation = $icon
    $lnk.Description = $description
    $lnk.Save()
    Write-Host "[ok] $desktop\$name.lnk -> scripts\$targetScript"
}

New-Shortcut 'Singevery' 'launch.cmd' 'Compila y abre Singevery'
New-Shortcut 'Singevery (dev)' 'launch-dev.cmd' 'Abre Singevery en modo desarrollo (hot-reload)'
