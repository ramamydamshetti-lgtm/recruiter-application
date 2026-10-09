Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutDir = Join-Path (Split-Path -Parent $ScriptDir) 'mail-assets'
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$Size = 96

function New-Bitmap {
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    return @($bmp, $g)
}

function Fill-VioletGradientCircle($g) {
    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(99, 102, 241),
        [System.Drawing.Color]::FromArgb(219, 39, 119),
        135
    )
    $g.FillEllipse($brush, 0, 0, $Size, $Size)
    $brush.Dispose()
}

function Fill-SolidCircle($g, $color) {
    $brush = New-Object System.Drawing.SolidBrush($color)
    $g.FillEllipse($brush, 0, 0, $Size, $Size)
    $brush.Dispose()
}

function Fill-InstagramGradientCircle($g) {
    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(240, 148, 51),
        [System.Drawing.Color]::FromArgb(188, 24, 136),
        45
    )
    $g.FillEllipse($brush, 0, 0, $Size, $Size)
    $brush.Dispose()
}

function Save-Png($bmp, $g, $name) {
    $path = Join-Path $OutDir $name
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Wrote $path"
}

function Draw-Phone($g) {
    $whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 8)
    $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $whiteBrush = [System.Drawing.Brushes]::White

    $state = $g.Save()
    $g.TranslateTransform([single]($Size / 2), [single]($Size / 2))
    $g.RotateTransform(-30)

    $w = 50
    $h = 18
    $rect = New-Object System.Drawing.RectangleF(- ($w / 2), - ($h / 2), $w, $h)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = 9
    $path.AddArc(($rect.X), $rect.Y, $r * 2, $r * 2, 180, 90)
    $path.AddArc(($rect.Right - $r * 2), $rect.Y, $r * 2, $r * 2, 270, 90)
    $path.AddArc(($rect.Right - $r * 2), ($rect.Bottom - $r * 2), $r * 2, $r * 2, 0, 90)
    $path.AddArc($rect.X, ($rect.Bottom - $r * 2), $r * 2, $r * 2, 90, 90)
    $path.CloseFigure()
    $g.FillPath($whiteBrush, $path)
    $path.Dispose()

    $earBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 168, 85, 247))
    $g.FillEllipse($earBrush, [single]($w / 2 - 16), [single](- 6), [single]12, [single]12)
    $g.FillEllipse($earBrush, [single](-($w / 2) + 4), [single](- 6), [single]12, [single]12)
    $earBrush.Dispose()

    $g.Restore($state)
    $whitePen.Dispose()
}

function Draw-Email($g) {
    $whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 6)
    $whitePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $w = 56
    $h = 38
    $x = ($Size - $w) / 2
    $y = ($Size - $h) / 2
    $r = 4
    $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $h)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $r * 2, $r * 2, 180, 90)
    $path.AddArc(($x + $w - $r * 2), $y, $r * 2, $r * 2, 270, 90)
    $path.AddArc(($x + $w - $r * 2), ($y + $h - $r * 2), $r * 2, $r * 2, 0, 90)
    $path.AddArc($x, ($y + $h - $r * 2), $r * 2, $r * 2, 90, 90)
    $path.CloseFigure()
    $g.DrawPath($whitePen, $path)

    $p1x = [single]($x + 3)
    $p1y = [single]($y + 6)
    $p2x = [single]($x + $w / 2)
    $p2y = [single]($y + $h / 2 + 4)
    $p3x = [single]($x + $w - 3)
    $p3y = [single]($y + 6)
    $g.DrawLine($whitePen, $p1x, $p1y, $p2x, $p2y)
    $g.DrawLine($whitePen, $p2x, $p2y, $p3x, $p3y)

    $path.Dispose()
    $whitePen.Dispose()
}

function Draw-Globe($g) {
    $whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)
    $thinPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 4)

    $w = 54
    $x = ($Size - $w) / 2
    $y = ($Size - $w) / 2
    $g.DrawEllipse($whitePen, $x, $y, $w, $w)

    $g.DrawLine($whitePen, [single]($Size / 2), [single]$y, [single]($Size / 2), [single]($y + $w))
    $g.DrawLine($whitePen, [single]$x, [single]($Size / 2), [single]($x + $w), [single]($Size / 2))

    $arcW = 26
    $arcH = $w
    $g.DrawEllipse($thinPen, [single]($Size / 2 - $arcW / 2), [single]$y, [single]$arcW, [single]$arcH)

    $whitePen.Dispose()
    $thinPen.Dispose()
}

function Draw-Pin($g) {
    $whiteBrush = [System.Drawing.Brushes]::White
    $cx = $Size / 2
    $top = 18
    $r = 18

    $arcX = [single]($cx - $r)
    $arcY = [single]$top
    $arcW = [single]($r * 2)
    $arcH = [single]($r * 2)
    $rightX = [single]($cx + $r * 0.94)
    $rightY = [single]($top + $r * 1.34)
    $bottomX = [single]$cx
    $bottomY = [single]($Size - 14)
    $leftX = [single]($cx - $r * 0.94)
    $leftY = [single]($top + $r * 1.34)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($arcX, $arcY, $arcW, $arcH, 200, 140)
    $path.AddLine($rightX, $rightY, $bottomX, $bottomY)
    $path.AddLine($bottomX, $bottomY, $leftX, $leftY)
    $path.CloseFigure()
    $g.FillPath($whiteBrush, $path)
    $path.Dispose()

    $hole = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 168, 85, 247))
    $hr = 7
    $g.FillEllipse($hole, [single]($cx - $hr), [single]($top + $r - $hr), [single]($hr * 2), [single]($hr * 2))
    $hole.Dispose()
}

function Draw-Text($g, $text, $fontFamily, $fontSize, $bold) {
    $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $font = New-Object System.Drawing.Font($fontFamily, $fontSize, $style, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $g.DrawString($text, $font, [System.Drawing.Brushes]::White, $rect, $sf)
    $font.Dispose()
    $sf.Dispose()
}

function Draw-InstagramCamera($g) {
    $whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)

    $w = 54
    $x = ($Size - $w) / 2
    $y = ($Size - $w) / 2
    $r = 12
    $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $w)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $r, $r, 180, 90)
    $path.AddArc(($x + $w - $r), $y, $r, $r, 270, 90)
    $path.AddArc(($x + $w - $r), ($y + $w - $r), $r, $r, 0, 90)
    $path.AddArc($x, ($y + $w - $r), $r, $r, 90, 90)
    $path.CloseFigure()
    $g.DrawPath($whitePen, $path)
    $path.Dispose()

    $lensSize = 22
    $lx = ($Size - $lensSize) / 2
    $ly = ($Size - $lensSize) / 2
    $g.DrawEllipse($whitePen, [single]$lx, [single]$ly, [single]$lensSize, [single]$lensSize)

    $whiteBrush = [System.Drawing.Brushes]::White
    $g.FillEllipse($whiteBrush, [single]($x + $w - 17), [single]($y + 8), [single]6, [single]6)

    $whitePen.Dispose()
}

# ---------- Generate the contact icons (purple gradient circle + white glyph) ----------

$pair = New-Bitmap; Fill-VioletGradientCircle $pair[1]; Draw-Phone   $pair[1]; Save-Png $pair[0] $pair[1] 'metaforge-footer-icon-phone.png'
$pair = New-Bitmap; Fill-VioletGradientCircle $pair[1]; Draw-Email   $pair[1]; Save-Png $pair[0] $pair[1] 'metaforge-footer-icon-send.png'
$pair = New-Bitmap; Fill-VioletGradientCircle $pair[1]; Draw-Globe   $pair[1]; Save-Png $pair[0] $pair[1] 'metaforge-footer-icon-web.png'
$pair = New-Bitmap; Fill-VioletGradientCircle $pair[1]; Draw-Pin     $pair[1]; Save-Png $pair[0] $pair[1] 'metaforge-footer-icon-location.png'

# ---------- Generate the social icons ----------

$pair = New-Bitmap
Fill-SolidCircle $pair[1] ([System.Drawing.Color]::FromArgb(10, 102, 194))
Draw-Text $pair[1] 'in' 'Arial' 56 $true
Save-Png $pair[0] $pair[1] 'metaforge-social-linkedin.png'

$pair = New-Bitmap
Fill-InstagramGradientCircle $pair[1]
Draw-InstagramCamera $pair[1]
Save-Png $pair[0] $pair[1] 'metaforge-social-instagram.png'

$pair = New-Bitmap
Fill-SolidCircle $pair[1] ([System.Drawing.Color]::FromArgb(0, 0, 0))
Draw-Text $pair[1] 'X' 'Arial' 56 $true
Save-Png $pair[0] $pair[1] 'metaforge-social-x.png'

Write-Host "Done."
