Add-Type -AssemblyName System.Drawing

$targetDir = 'C:\Users\dogud\Downloads\Taksi\google_play_assets'
if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

# 1. 512x512 Icon
$srcPath = 'C:\Users\dogud\Downloads\Taksi\public\images\icon.png'
$src = [System.Drawing.Image]::FromFile($srcPath)
$iconBmp = New-Object System.Drawing.Bitmap 512, 512
$g1 = [System.Drawing.Graphics]::FromImage($iconBmp)
$g1.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g1.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g1.DrawImage($src, 0, 0, 512, 512)
$iconBmp.Save("$targetDir\icon_512x512.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g1.Dispose()
$iconBmp.Dispose()
$src.Dispose()
Write-Output "✓ 512x512 Icon created"

# 2. 1024x500 Feature Graphic
$featBmp = New-Object System.Drawing.Bitmap 1024, 500
$g2 = [System.Drawing.Graphics]::FromImage($featBmp)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

$rect = New-Object System.Drawing.Rectangle 0, 0, 1024, 500
$c1 = [System.Drawing.ColorTranslator]::FromHtml("#1e1b4b")
$c2 = [System.Drawing.ColorTranslator]::FromHtml("#312e81")
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 45.0
$g2.FillRectangle($brush, $rect)

$logoPath = 'C:\Users\dogud\Downloads\Taksi\public\images\logo.png'
$logo = [System.Drawing.Image]::FromFile($logoPath)
$logoW = 460
$logoH = [int]($logo.Height * ($logoW / $logo.Width))
$logoX = [int]((1024 - $logoW) / 2)
$logoY = [int]((500 - $logoH) / 2 - 30)
$g2.DrawImage($logo, $logoX, $logoY, $logoW, $logoH)

$font = New-Object System.Drawing.Font "Arial", 18, [System.Drawing.FontStyle]::Bold
$textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#fbbf24"))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$textRect = New-Object System.Drawing.RectangleF 0, ($logoY + $logoH + 20), 1024, 50
$g2.DrawString("Akilli Taksi Durak ve POS Terminali", $font, $textBrush, $textRect, $format)

$featBmp.Save("$targetDir\feature_graphic_1024x500.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g2.Dispose()
$featBmp.Dispose()
$logo.Dispose()
Write-Output "✓ 1024x500 Feature Graphic created"

# 3. Copy Real 1080x1920 Screenshots
Copy-Item 'C:\Users\dogud\.gemini\antigravity\brain\c175204a-35f2-44b8-9f3f-51ef48d3b91d\phone_after_permission.png' "$targetDir\screenshot_1_giris.png" -Force
Copy-Item 'C:\Users\dogud\.gemini\antigravity\brain\c175204a-35f2-44b8-9f3f-51ef48d3b91d\phone_after_login.png' "$targetDir\screenshot_2_sira_ve_pos.png" -Force
Copy-Item 'C:\Users\dogud\.gemini\antigravity\brain\c175204a-35f2-44b8-9f3f-51ef48d3b91d\phone_with_incoming_call.png' "$targetDir\screenshot_3_cagri_ve_navigasyon.png" -Force

Write-Output "SUCCESS: 1080x1920 Screenshots copied"
