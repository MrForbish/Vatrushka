$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeIcon {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool DestroyIcon(IntPtr handle);
}
'@

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$build = Join-Path $root 'apps\desktop\build'
New-Item -ItemType Directory -Force -Path $build | Out-Null

$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(18, 13, 11))
$rectangle = New-Object System.Drawing.Rectangle 22, 22, 212, 212
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rectangle, ([System.Drawing.Color]::FromArgb(245, 187, 112)), ([System.Drawing.Color]::FromArgb(166, 80, 59)), 45
$graphics.FillEllipse($brush, $rectangle)
$filling = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 228, 184))
$graphics.FillEllipse($filling, 55, 55, 146, 146)
$berry = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(211, 94, 120))
$graphics.FillEllipse($berry, 76, 76, 104, 104)
$highlight = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(128, 255, 255, 255))
$graphics.FillEllipse($highlight, 96, 88, 28, 15)

$pngPath = Join-Path $build 'icon.png'
$icoPath = Join-Path $build 'icon.ico'
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$handle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Create($icoPath)
try { $icon.Save($stream) } finally {
  $stream.Dispose()
  $icon.Dispose()
  [NativeIcon]::DestroyIcon($handle) | Out-Null
  $highlight.Dispose(); $berry.Dispose(); $filling.Dispose(); $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

Write-Host "Generated $icoPath and $pngPath"
