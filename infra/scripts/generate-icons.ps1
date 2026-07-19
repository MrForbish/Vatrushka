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
$background = [System.Drawing.Color]::FromArgb(7, 11, 26)
$graphics.Clear($background)
$markBounds = New-Object System.Drawing.Rectangle 26, 25, 204, 210
$mark = New-Object System.Drawing.Drawing2D.LinearGradientBrush $markBounds, ([System.Drawing.Color]::FromArgb(154, 92, 255)), ([System.Drawing.Color]::FromArgb(88, 53, 221)), 45
$cutout = New-Object System.Drawing.SolidBrush $background
$cyanBounds = New-Object System.Drawing.Rectangle 118, 105, 20, 52
$cyan = New-Object System.Drawing.Drawing2D.LinearGradientBrush $cyanBounds, ([System.Drawing.Color]::FromArgb(72, 232, 246)), ([System.Drawing.Color]::FromArgb(37, 207, 232)), 90

# Segmented rounded mark from the Vatrushka identity.
$graphics.FillPie($mark, 30, 25, 196, 196, 205, 130)
$graphics.FillPie($mark, 30, 25, 196, 196, 25, 130)
$graphics.FillRectangle($mark, 77, 32, 102, 48)
$graphics.FillRectangle($mark, 29, 88, 47, 51)
$graphics.FillRectangle($mark, 82, 88, 45, 51)
$graphics.FillRectangle($mark, 133, 88, 41, 51)
$graphics.FillRectangle($mark, 180, 88, 47, 51)
$graphics.FillRectangle($mark, 31, 147, 45, 47)
$graphics.FillRectangle($mark, 82, 147, 31, 47)
$graphics.FillRectangle($mark, 143, 147, 31, 47)
$graphics.FillRectangle($mark, 180, 147, 45, 47)
$graphics.FillPie($mark, 43, 159, 170, 78, 0, 180)

# Cut the central headset silhouette and add the cyan microphone capsule.
$graphics.FillEllipse($cutout, 88, 99, 80, 128)
$graphics.FillRectangle($cutout, 88, 99, 80, 62)
$graphics.FillRectangle($cyan, 118, 107, 20, 50)
$graphics.FillEllipse($cyan, 118, 99, 20, 18)
$graphics.FillEllipse($cyan, 118, 147, 20, 18)

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
  $cyan.Dispose(); $cutout.Dispose(); $mark.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

Write-Host "Generated $icoPath and $pngPath"
