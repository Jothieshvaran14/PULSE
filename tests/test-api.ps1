# =============================================================================
# PULSE API - Curl Test Script (Windows PowerShell)
# =============================================================================
# Usage: .\tests\test-api.ps1
# Requires: curl (built into Windows 10+)
# =============================================================================

$BASE = "http://localhost:3001"
$PASS = 0
$FAIL = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$ExpectedStatus,
        [scriptblock]$CurlCommand
    )
    
    Write-Host "`n--- $Name ---" -ForegroundColor Cyan
    
    try {
        $result = & $CurlCommand 2>&1
        $statusCode = $result.StatusCode
        
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "  PASS (HTTP $statusCode)" -ForegroundColor Green
            $script:PASS++
        } else {
            Write-Host "  FAIL (Expected HTTP $ExpectedStatus, got HTTP $statusCode)" -ForegroundColor Red
            $script:FAIL++
        }
        
        # Show response body
        if ($result.Content) {
            Write-Host "  Response:" -ForegroundColor DarkGray
            $result.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5 | Write-Host -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  ERROR: $_" -ForegroundColor Red
        $script:FAIL++
    }
}

Write-Host "=============================================" -ForegroundColor Yellow
Write-Host " PULSE API - Milestone 1 Test Suite" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow
Write-Host ""

# =============================================================================
# 1. HEALTH CHECK
# =============================================================================
Write-Host "`n[1/8] HEALTH CHECK" -ForegroundColor Magenta

$health = curl.exe -s -w "%{http_code}" -o "$env:TEMP\pulse_health.json" "$BASE/api/v1/health"
$healthBody = Get-Content "$env:TEMP\pulse_health.json" -Raw | ConvertFrom-Json
Write-Host "  Status: $health"
Write-Host "  Docker: $($healthBody.data.docker)"
Write-Host "  Database: $($healthBody.data.database)"

if ($health -eq "200") { $PASS++ } else { $FAIL++ }

# =============================================================================
# 2. AUTH - INITIATE LOGIN
# =============================================================================
Write-Host "`n[2/8] AUTH - Initiate GitHub Login" -ForegroundColor Magenta

$authInit = curl.exe -s -w "%{http_code}" -o "$env:TEMP\pulse_auth_init.json" "$BASE/api/v1/auth/github"
$authInitBody = Get-Content "$env:TEMP\pulse_auth_init.json" -Raw | ConvertFrom-Json
Write-Host "  Status: $authInit"
Write-Host "  Authorization URL: $($authInitBody.data.authorizationUrl)"
Write-Host "  State: $($authInitBody.data.state)"

if ($authInit -eq "200") { $PASS++ } else { $FAIL++ }

# Store state for later
$oauthState = $authInitBody.data.state

# =============================================================================
# 3. AUTH - CALLBACK WITH MISSING PARAMS
# =============================================================================
Write-Host "`n[3/8] AUTH - Callback (Missing Params)" -ForegroundColor Magenta

$callbackMissing = curl.exe -s -w "%{http_code}" -o "$env:TEMP\pulse_callback_missing.json" `
    -X POST "$BASE/api/v1/auth/github/callback" `
    -H "Content-Type: application/json" `
    -d "{}"
$callbackMissingBody = Get-Content "$env:TEMP\pulse_callback_missing.json" -Raw | ConvertFrom-Json
Write-Host "  Status: $callbackMissing"
Write-Host "  Error: $($callbackMissingBody.error.code)"

if ($callbackMissing -eq "400") { $PASS++ } else { $FAIL++ }

# =============================================================================
# 4. AUTH - CALLBACK WITH INVALID STATE
# =============================================================================
Write-Host "`n[4/8] AUTH - Callback (Invalid State)" -ForegroundColor Magenta

# NOTE: body passed via @file because Windows PowerShell 5.1 strips embedded
# double quotes when passing native-command arguments, which corrupted the JSON.
$callbackInvalidBodyFile = "$env:TEMP\pulse_callback_invalid_body.json"
Set-Content -Path $callbackInvalidBodyFile -Value '{"code": "fake_code", "state": "fake_state"}' -Encoding ascii -NoNewline
$callbackInvalid = curl.exe -s -w "%{http_code}" -o "$env:TEMP\pulse_callback_invalid.json" `
    -X POST "$BASE/api/v1/auth/github/callback" `
    -H "Content-Type: application/json" `
    -d "@$callbackInvalidBodyFile"
$callbackInvalidBody = Get-Content "$env:TEMP\pulse_callback_invalid.json" -Raw | ConvertFrom-Json
Write-Host "  Status: $callbackInvalid"
Write-Host "  Error: $($callbackInvalidBody.error.code)"

if ($callbackInvalid -eq "403") { $PASS++ } else { $FAIL++ }

# =============================================================================
# 5. AUTH - GET ME WITHOUT TOKEN
# =============================================================================
Write-Host "`n[5/8] AUTH - Get Me (No Token)" -ForegroundColor Magenta

$meNoToken = curl.exe -s -w "%{http_code}" -o "$env:TEMP\pulse_me_notoken.json" `
    "$BASE/api/v1/auth/me"
$meNoTokenBody = Get-Content "$env:TEMP\pulse_me_notoken.json" -Raw | ConvertFrom-Json
Write-Host "  Status: $meNoToken"
Write-Host "  Error: $($meNoTokenBody.error.code)"

if ($meNoToken -eq "401") { $PASS++ } else { $FAIL++ }

# =============================================================================
# 6. AUTH - GET ME WITH INVALID TOKEN
# =============================================================================
Write-Host "`n[6/8] AUTH - Get Me (Invalid Token)" -ForegroundColor Magenta

$meBadToken = curl.exe -s -w "%{http_code}" -o "$env:TEMP\pulse_me_badtoken.json" `
    -H "Authorization: Bearer invalid_token_abc123" `
    "$BASE/api/v1/auth/me"
$meBadTokenBody = Get-Content "$env:TEMP\pulse_me_badtoken.json" -Raw | ConvertFrom-Json
Write-Host "  Status: $meBadToken"
Write-Host "  Error: $($meBadTokenBody.error.code)"

if ($meBadToken -eq "401") { $PASS++ } else { $FAIL++ }

# =============================================================================
# 7. PROJECTS - WITHOUT TOKEN
# =============================================================================
Write-Host "`n[7/8] PROJECTS - List (No Token)" -ForegroundColor Magenta

$projNoToken = curl.exe -s -w "%{http_code}" -o "$env:TEMP\pulse_proj_notoken.json" `
    "$BASE/api/v1/projects?page=1&limit=10"
$projNoTokenBody = Get-Content "$env:TEMP\pulse_proj_notoken.json" -Raw | ConvertFrom-Json
Write-Host "  Status: $projNoToken"
Write-Host "  Error: $($projNoTokenBody.error.code)"

if ($projNoToken -eq "401") { $PASS++ } else { $FAIL++ }

# =============================================================================
# 8. UNKNOWN ROUTE
# =============================================================================
Write-Host "`n[8/8] UNKNOWN ROUTE - 404" -ForegroundColor Magenta

$notFound = curl.exe -s -w "%{http_code}" -o "$env:TEMP\pulse_notfound.json" `
    "$BASE/api/v1/nonexistent"
$notFoundBody = Get-Content "$env:TEMP\pulse_notfound.json" -Raw | ConvertFrom-Json
Write-Host "  Status: $notFound"
Write-Host "  Error: $($notFoundBody.error.code)"

if ($notFound -eq "404") { $PASS++ } else { $FAIL++ }

# =============================================================================
# SUMMARY
# =============================================================================
Write-Host "`n=============================================" -ForegroundColor Yellow
Write-Host " RESULTS" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow
Write-Host "  Passed: $PASS" -ForegroundColor Green
Write-Host "  Failed: $FAIL" -ForegroundColor $(if ($FAIL -gt 0) { "Red" } else { "Green" })
Write-Host "  Total:  $($PASS + $FAIL)" -ForegroundColor White

if ($FAIL -eq 0) {
    Write-Host "`n  ALL TESTS PASSED" -ForegroundColor Green
} else {
    Write-Host "`n  SOME TESTS FAILED" -ForegroundColor Red
}

# =============================================================================
# MANUAL TEST: OAuth Flow (requires real GitHub credentials)
# =============================================================================
Write-Host "`n=============================================" -ForegroundColor Yellow
Write-Host " MANUAL TEST: Full OAuth Flow" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "To test the full OAuth flow, run these commands:" -ForegroundColor White
Write-Host ""
Write-Host "  # 1. Generate test tokens (paste this into Node.js):" -ForegroundColor Cyan
Write-Host '  node -e "const jwt=require(`"jsonwebtoken`");const token=jwt.sign({sub:`"test-user-id`",githubId:12345,githubLogin:`"testuser`"},process.env.JWT_SECRET||`"dev-secret-32-chars-long-enough!!`",{expiresIn:`"24h`"});console.log(token)"' -ForegroundColor DarkGray
Write-Host ""
Write-Host "  # 2. Use the token to test protected routes:" -ForegroundColor Cyan
Write-Host '  curl -H "Authorization: Bearer <YOUR_TOKEN>" http://localhost:3001/api/v1/auth/me' -ForegroundColor DarkGray
Write-Host ""

# Cleanup temp files
Remove-Item "$env:TEMP\pulse_*.json" -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\pulse_callback_invalid_body.json" -ErrorAction SilentlyContinue

# Non-zero exit on failure so CI/gates can rely on this script
if ($FAIL -gt 0) { exit 1 } else { exit 0 }
