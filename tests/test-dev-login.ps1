# PULSE Dev Login Test Script
# ========================
# This script tests the development-only GitHub token authentication.

$BASE_URL = "http://localhost:3001/api/v1"

Write-Host "PULSE Dev Login Tests" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`n1. Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/health" -Method Get
    Write-Host "   ✓ Server is running" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Server is not running. Start with: pnpm dev" -ForegroundColor Red
    exit 1
}

# Test 2: Dev Login (without GITHUB_TOKEN configured)
Write-Host "`n2. Dev Login (expect 503 if GITHUB_TOKEN not set)" -ForegroundColor Yellow
try {
    $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/dev/login" -Method Post
    Write-Host "   ✓ Login successful" -ForegroundColor Green
    Write-Host "   Token: $($loginResponse.data.token.Substring(0, 20))..." -ForegroundColor Gray
    $token = $loginResponse.data.token
} catch {
    $errorResponse = $_.Exception.Response
    if ($errorResponse.StatusCode -eq 503) {
        Write-Host "   ✓ GITHUB_TOKEN not configured (expected in dev)" -ForegroundColor Yellow
        Write-Host "   Set GITHUB_TOKEN in .env and restart server" -ForegroundColor Gray
        exit 0
    } else {
        Write-Host "   ✗ Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Test 3: Get User Profile
Write-Host "`n3. Get User Profile" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $token" }
    $user = Invoke-RestMethod -Uri "$BASE_URL/auth/me" -Method Get -Headers $headers
    Write-Host "   ✓ User: $($user.data.githubLogin) ($($user.data.name))" -ForegroundColor Green
    Write-Host "   ID: $($user.data.id)" -ForegroundColor Gray
    Write-Host "   GitHub ID: $($user.data.githubId)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Failed to get user profile" -ForegroundColor Red
}

# Test 4: Get Repositories
Write-Host "`n4. Get Repositories" -ForegroundColor Yellow
try {
    $repos = Invoke-RestMethod -Uri "$BASE_URL/github/repos?per_page=5" -Method Get -Headers $headers
    Write-Host "   ✓ Found $($repos.data.Count) repositories" -ForegroundColor Green
    foreach ($repo in $repos.data | Select-Object -First 5) {
        $privacy = if ($repo.private) { "🔒" } else { "🌐" }
        Write-Host "   $privacy $($repo.fullName) ($($repo.language ?? 'N/A'))" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ✗ Failed to get repositories" -ForegroundColor Red
}

# Test 5: Get Repositories (with filters)
Write-Host "`n5. Get Repositories (owner only, sorted by name)" -ForegroundColor Yellow
try {
    $repos = Invoke-RestMethod -Uri "$BASE_URL/github/repos?type=owner&sort=full_name&direction=asc&per_page=3" -Method Get -Headers $headers
    Write-Host "   ✓ Found $($repos.data.Count) repositories" -ForegroundColor Green
    foreach ($repo in $repos.data) {
        Write-Host "   📁 $($repo.fullName)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ✗ Failed to get filtered repositories" -ForegroundColor Red
}

# Test 6: Unauthorized Access
Write-Host "`n6. Unauthorized Access (no token)" -ForegroundColor Yellow
try {
    $repos = Invoke-RestMethod -Uri "$BASE_URL/github/repos" -Method Get
    Write-Host "   ✗ Should have returned 401" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "   ✓ Correctly returned 401 Unauthorized" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n==================" -ForegroundColor Cyan
Write-Host "All tests completed!" -ForegroundColor Cyan
