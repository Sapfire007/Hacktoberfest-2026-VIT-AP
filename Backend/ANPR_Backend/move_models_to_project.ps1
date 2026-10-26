# Move ANPR models from user cache to project directory
# Run this script AFTER the models have been downloaded

$ProjectRoot = $PSScriptRoot
$WeightsDir = Join-Path $ProjectRoot ".anpr\weights"
$UserCache = "$env:USERPROFILE\.cache"

Write-Host "[ANPR] Moving models from user cache to project directory..." -ForegroundColor Cyan

# Create weights directory
New-Item -ItemType Directory -Force -Path $WeightsDir | Out-Null

# Move open-image-models
$OpenImageSrc = Join-Path $UserCache "open-image-models"
$OpenImageDest = Join-Path $WeightsDir "open-image-models"

if (Test-Path $OpenImageSrc) {
    Write-Host "Moving open-image-models..." -ForegroundColor Yellow
    
    if (Test-Path $OpenImageDest) {
        Remove-Item -Recurse -Force $OpenImageDest
    }
    
    Move-Item -Path $OpenImageSrc -Destination $OpenImageDest -Force
    
    # Create symbolic link so libraries can still find it
    New-Item -ItemType SymbolicLink -Path $OpenImageSrc -Target $OpenImageDest -Force | Out-Null
    
    Write-Host "✓ Moved open-image-models to: $OpenImageDest" -ForegroundColor Green
    Write-Host "✓ Created symlink at: $OpenImageSrc" -ForegroundColor Green
} else {
    Write-Host "⚠ open-image-models not found in user cache" -ForegroundColor Yellow
}

# Move fast-plate-ocr
$FastPlateSrc = Join-Path $UserCache "fast-plate-ocr"
$FastPlateDest = Join-Path $WeightsDir "fast-plate-ocr"

if (Test-Path $FastPlateSrc) {
    Write-Host "Moving fast-plate-ocr..." -ForegroundColor Yellow
    
    if (Test-Path $FastPlateDest) {
        Remove-Item -Recurse -Force $FastPlateDest
    }
    
    Move-Item -Path $FastPlateSrc -Destination $FastPlateDest -Force
    
    # Create symbolic link
    New-Item -ItemType SymbolicLink -Path $FastPlateSrc -Target $FastPlateDest -Force | Out-Null
    
    Write-Host "✓ Moved fast-plate-ocr to: $FastPlateDest" -ForegroundColor Green
    Write-Host "✓ Created symlink at: $FastPlateSrc" -ForegroundColor Green
} else {
    Write-Host "⚠ fast-plate-ocr not found in user cache" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Models are now stored in project directory:" -ForegroundColor Green
Write-Host "  $WeightsDir" -ForegroundColor White
Write-Host ""
Write-Host "Symbolic links created at:" -ForegroundColor Green
Write-Host "  $UserCache\open-image-models -> $OpenImageDest" -ForegroundColor White
Write-Host "  $UserCache\fast-plate-ocr -> $FastPlateDest" -ForegroundColor White
Write-Host ""
Write-Host "The libraries will continue to work normally," -ForegroundColor Yellow
Write-Host "but models are physically stored in the project." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
