$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$desktopRoot = Join-Path $repoRoot 'apps\desktop'
$electronPackage = Get-Content -Raw (Join-Path $repoRoot 'node_modules\electron\package.json') | ConvertFrom-Json
$electronVersion = [string]$electronPackage.version
$electronFile = "electron-v$electronVersion-win32-x64.zip"
$electronReleaseUrl = "https://github.com/electron/electron/releases/download/v$electronVersion"
$electronCache = Join-Path $repoRoot '.cache\electron-dist'

if ($env:ELECTRON_BUILDER_CACHE) {
  $builderCache = $env:ELECTRON_BUILDER_CACHE
} else {
  $builderCache = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache'
}

function Invoke-ReliableDownload {
  param(
    [Parameter(Mandatory)] [string] $Url,
    [Parameter(Mandatory)] [string] $Destination,
    [Parameter(Mandatory)] [string] $ExpectedSha256
  )

  if (Test-Path -LiteralPath $Destination) {
    $cachedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash.ToLowerInvariant()
    if ($cachedHash -eq $ExpectedSha256) {
      Write-Host "Verified cached artifact: $([IO.Path]::GetFileName($Destination))"
      return
    }
    Remove-Item -LiteralPath $Destination -Force
  }

  $directory = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $temporary = "$Destination.download"
  Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue

  & curl.exe --fail --location --retry 5 --retry-all-errors --connect-timeout 20 `
    --output $temporary $Url
  if ($LASTEXITCODE -ne 0) {
    throw "Download failed with curl exit code $LASTEXITCODE`: $Url"
  }

  $actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $temporary).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $ExpectedSha256) {
    Remove-Item -LiteralPath $temporary -Force
    throw "SHA-256 mismatch for $Url"
  }

  Move-Item -LiteralPath $temporary -Destination $Destination -Force
  Write-Host "Downloaded and verified: $([IO.Path]::GetFileName($Destination))"
}

New-Item -ItemType Directory -Force -Path $electronCache | Out-Null
$checksumsPath = Join-Path $electronCache "SHASUMS256-v$electronVersion.txt"
$checksumsTemporary = "$checksumsPath.download"

& curl.exe --fail --location --retry 5 --retry-all-errors --connect-timeout 20 `
  --output $checksumsTemporary "$electronReleaseUrl/SHASUMS256.txt"
if ($LASTEXITCODE -ne 0) {
  throw "Could not download Electron checksums (curl exit code $LASTEXITCODE)"
}
Move-Item -LiteralPath $checksumsTemporary -Destination $checksumsPath -Force

$electronLine = @(Get-Content -LiteralPath $checksumsPath | Where-Object {
  $_ -match "^[a-fA-F0-9]{64}\s+\*?$([regex]::Escape($electronFile))$"
})
if ($electronLine.Count -ne 1) {
  throw "Could not resolve a unique SHA-256 entry for $electronFile"
}
$electronSha256 = ($electronLine[0] -split '\s+')[0].ToLowerInvariant()
$electronZip = Join-Path $electronCache $electronFile
Invoke-ReliableDownload `
  -Url "$electronReleaseUrl/$electronFile" `
  -Destination $electronZip `
  -ExpectedSha256 $electronSha256

$builderArtifacts = @(
  @{
    Release = 'winCodeSign-2.6.0'
    File = 'winCodeSign-2.6.0.7z'
    Sha256 = 'cdaec7154dda7cc31f88d886e2489379a0625a737d610b5ae7f62a12f16743a4'
  },
  @{
    Release = 'nsis-3.0.4.1'
    File = 'nsis-3.0.4.1.7z'
    Sha256 = '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa'
  },
  @{
    Release = 'nsis-resources-3.4.1'
    File = 'nsis-resources-3.4.1.7z'
    Sha256 = '593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103'
  }
)

foreach ($artifact in $builderArtifacts) {
  $artifactUrl = "https://github.com/electron-userland/electron-builder-binaries/releases/download/$($artifact.Release)/$($artifact.File)"
  $artifactPath = Join-Path $builderCache "$($artifact.Release)\$($artifact.File)"
  Invoke-ReliableDownload -Url $artifactUrl -Destination $artifactPath -ExpectedSha256 $artifact.Sha256
}

Push-Location $desktopRoot
try {
  & npm run build:production
  if ($LASTEXITCODE -ne 0) {
    throw "Desktop production build failed with exit code $LASTEXITCODE"
  }

  $builder = Join-Path $repoRoot 'node_modules\.bin\electron-builder.cmd'
  & $builder --win nsis portable --x64 "--config.electronDist=$electronZip"
  if ($LASTEXITCODE -ne 0) {
    throw "electron-builder failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
