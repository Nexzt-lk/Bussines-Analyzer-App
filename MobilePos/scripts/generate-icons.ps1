Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\sadee\.gemini\antigravity-ide\brain\0ce880c0-a2c2-4e57-bd9a-aafbcacbfa1b\.user_uploaded\media_1791237967439.jpg"
$imagesDir = "d:\Pos App\Bussines-Analyzer-App\MobilePos\assets\images"

Write-Host "Loading source image from: $srcPath"
$img = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Source image loaded: $($img.Width)x$($img.Height)"

# 1. Save high-res bizznet-logo.png
$bizznetLogoPath = Join-Path $imagesDir "bizznet-logo.png"
$img.Save($bizznetLogoPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved: $bizznetLogoPath"

# Function to resize and save
function Resize-And-Save($sourceImg, $targetPath, $width, $height, $bgTransparent = $false) {
    $bmp = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    
    $graphics.DrawImage($sourceImg, 0, 0, $width, $height)
    $graphics.Dispose()
    
    $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Saved: $targetPath ($($width)x$($height))"
}

# Function to create adaptive foreground (standard Android adaptive icon needs logo centered with padding)
function Create-Adaptive-Foreground($sourceImg, $targetPath, $canvasSize, $contentSize) {
    $bmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    
    $offset = [int](($canvasSize - $contentSize) / 2)
    $graphics.DrawImage($sourceImg, $offset, $offset, $contentSize, $contentSize)
    $graphics.Dispose()
    
    $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Saved adaptive foreground: $targetPath ($canvasSize x $canvasSize with content $contentSize)"
}

# 2. Save icon.png (1024x1024)
Resize-And-Save $img (Join-Path $imagesDir "icon.png") 1024 1024

# 3. Save splash-icon.png (512x512)
Resize-And-Save $img (Join-Path $imagesDir "splash-icon.png") 512 512

# 4. Save loading-logo.png (512x512)
Resize-And-Save $img (Join-Path $imagesDir "loading-logo.png") 512 512

# 5. Save favicon.png (48x48)
Resize-And-Save $img (Join-Path $imagesDir "favicon.png") 48 48

# 6. Save android-icon-foreground.png (432x432 with 288x288 content centered)
Create-Adaptive-Foreground $img (Join-Path $imagesDir "android-icon-foreground.png") 432 288

$img.Dispose()
Write-Host "All icons generated successfully!"
