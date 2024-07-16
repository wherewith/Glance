param (
    [string[]]$params,
    [string]$b1,
    [string]$b2
)

if (-not $b1 -or -not $b2) {
    Write-Host "Error: Branch names not provided. Use -b1 [branch1] -b2 [branch2]"
    exit 1
}

# Combine all params into a single string
$commitParams = $params -join " "

# Checkout b1
git checkout $b1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to checkout $b1"
    exit 1
}

# Add changes
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to add changes"
    exit 1
}

# Commit changes
Invoke-Expression "git commit $commitParams"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to commit changes"
    exit 1
}

# Push changes
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to push changes"
    exit 1
}

# Checkout b2
git checkout $b2
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to checkout $b2"
    exit 1
}

# Cherry-pick changes from b1
git cherry-pick $b1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to cherry-pick changes from $b1"
    exit 1
}

# Push changes
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to push changes"
    exit 1
}

git checkout $b1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to checkout $b1"
    exit 1
}