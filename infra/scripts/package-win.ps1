$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$desktopRoot = Join-Path $repoRoot 'apps\desktop'
$electronPackage = Get-Content -Raw (Join-Path $repoRoot 'node_modules\electron\package.json') | ConvertFrom-Json
$electronVersion = [string]$electronPackage.version
$toolchain = Get-Content -Raw (Join-Path $repoRoot 'infra\windows-toolchain-lock.json') | ConvertFrom-Json
if ($electronVersion -ne [string]$toolchain.electron.version) {
  throw "Electron dependency $electronVersion does not match the locked Windows toolchain version $($toolchain.electron.version)"
}
$electronFile = [string]$toolchain.electron.file
$electronSha256 = [string]$toolchain.electron.sha256
$electronReleaseUrl = "https://github.com/electron/electron/releases/download/v$electronVersion"
$electronCache = Join-Path $repoRoot '.cache\electron-dist'
$toolchainMirror = if ($env:WINDOWS_TOOLCHAIN_MIRROR) { $env:WINDOWS_TOOLCHAIN_MIRROR.TrimEnd('/') } else { $null }

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

  $curlArguments = @('--fail', '--location', '--retry', '5', '--retry-all-errors', '--connect-timeout', '20')
  if ($toolchainMirror -and $Url.StartsWith("$toolchainMirror/", [StringComparison]::OrdinalIgnoreCase)) {
    if (-not $env:CI_JOB_TOKEN) { throw 'CI_JOB_TOKEN is required to download the private Windows toolchain mirror' }
    $curlArguments += @('--header', "JOB-TOKEN: $env:CI_JOB_TOKEN")
  }
  $curlArguments += @('--output', $temporary, $Url)
  & curl.exe @curlArguments
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
$electronZip = Join-Path $electronCache $electronFile
Invoke-ReliableDownload `
  -Url $(if ($toolchainMirror) { "$toolchainMirror/$electronFile" } else { "$electronReleaseUrl/$electronFile" }) `
  -Destination $electronZip `
  -ExpectedSha256 $electronSha256

foreach ($artifact in $toolchain.builderArtifacts) {
  $fallbackUrl = "https://github.com/electron-userland/electron-builder-binaries/releases/download/$($artifact.release)/$($artifact.file)"
  $artifactUrl = if ($toolchainMirror) { "$toolchainMirror/$($artifact.file)" } else { $fallbackUrl }
  $artifactPath = Join-Path $builderCache "$($artifact.release)\$($artifact.file)"
  Invoke-ReliableDownload -Url $artifactUrl -Destination $artifactPath -ExpectedSha256 ([string]$artifact.sha256)
}

Push-Location $desktopRoot
try {
  $delivery = & node (Join-Path $desktopRoot 'scripts\desktop-delivery-config.mjs') | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) {
    throw "Desktop delivery configuration validation failed with exit code $LASTEXITCODE"
  }
  $env:VATRUSHKA_UPDATES_ENABLED = if ($delivery.updatesEnabled) { 'true' } else { 'false' }
  & npm run build:production
  if ($LASTEXITCODE -ne 0) {
    throw "Desktop production build failed with exit code $LASTEXITCODE"
  }

  $builder = Join-Path $repoRoot 'node_modules\.bin\electron-builder.cmd'
  & $builder --win nsis portable --x64 "--config.electronDist=$electronZip" "--config.publish.provider=generic" "--config.publish.url=$($delivery.updateFeed)" "--config.publish.channel=latest" "--config.extraMetadata.version=$($delivery.version)"
  if ($LASTEXITCODE -ne 0) {
    throw "electron-builder failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
