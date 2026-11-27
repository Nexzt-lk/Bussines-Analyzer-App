Add-Type -AssemblyName System.Drawing

$src = "C:\Users\sadee\.gemini\antigravity-ide\brain\0ce880c0-a2c2-4e57-bd9a-aafbcacbfa1b\.user_uploaded\media_1791240076302.jpg"
$dir = "d:\Pos App\Bussines-Analyzer-App\MobilePos\assets\images"

Write-Host "Loading image from $src"
$img = [System.Drawing.Image]::FromFile($src)
Write-Host "Source resolution: $($img.Width) x $($img.Height)"

# 1. Save bizznet-loading-logo.png
$dest1 = Join-Path $dir "bizznet-loading-logo.png"
$img.Save($dest1, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved $dest1"

# 2. Save loading-logo.png
$dest2 = Join-Path $dir "loading-logo.png"
$img.Save($dest2, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved $dest2"

# 3. Save splash-icon.png
$dest3 = Join-Path $dir "splash-icon.png"
$img.Save($dest3, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved $dest3"

$img.Dispose()
Write-Host "Finished converting loading logo!"
