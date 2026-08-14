$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$outputPath = Join-Path $PSScriptRoot "..\resources\portable-splash.bmp"
$width = 480
$height = 260
$bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$graphics.Clear([System.Drawing.Color]::FromArgb(248, 249, 251))

$blue = [System.Drawing.Color]::FromArgb(47, 145, 246)
$ink = [System.Drawing.Color]::FromArgb(28, 31, 37)
$muted = [System.Drawing.Color]::FromArgb(112, 119, 130)
$border = [System.Drawing.Color]::FromArgb(222, 226, 231)

$graphics.DrawRectangle((New-Object System.Drawing.Pen($border, 1)), 0, 0, $width - 1, $height - 1)
$graphics.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(226, 239, 255))), 337, -78, 210, 210)

$iconRect = New-Object System.Drawing.RectangleF(42, 42, 58, 58)
$graphics.FillRectangle((New-Object System.Drawing.SolidBrush($blue)), $iconRect)
$iconFont = New-Object System.Drawing.Font("Segoe UI", 28, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$iconFormat = New-Object System.Drawing.StringFormat
$iconFormat.Alignment = [System.Drawing.StringAlignment]::Center
$iconFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString("C", $iconFont, [System.Drawing.Brushes]::White, $iconRect, $iconFormat)

$brandFont = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$titleFont = New-Object System.Drawing.Font("Microsoft YaHei UI", 27, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = New-Object System.Drawing.Font("Microsoft YaHei UI", 14, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$startupText = -join ([char[]](0x6B63, 0x5728, 0x542F, 0x52A8))
$waitText = (-join ([char[]](0x6B63, 0x5728, 0x89E3, 0x538B, 0x8FD0, 0x884C, 0x7EC4, 0x4EF6, 0xFF0C, 0x8BF7, 0x7A0D, 0x5019))) + "..."
$graphics.DrawString("CODEX USAGE COMPANION 1.0", $brandFont, (New-Object System.Drawing.SolidBrush($blue)), 42, 120)
$graphics.DrawString($startupText, $titleFont, (New-Object System.Drawing.SolidBrush($ink)), 42, 150)
$graphics.DrawString($waitText, $bodyFont, (New-Object System.Drawing.SolidBrush($muted)), 42, 198)

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$iconFormat.Dispose()
$iconFont.Dispose()
$brandFont.Dispose()
$titleFont.Dispose()
$bodyFont.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Generated $outputPath"
