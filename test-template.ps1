# Test Whapi.Cloud message endpoint
$loginUri = 'http://localhost:5000/api/auth/login'
$testUri = 'http://localhost:5000/api/whatsapp/test-message'
$phoneUri = 'http://localhost:5000/api/whatsapp/phone'

# Login first
$loginBody = @{
    email = 'admin@taskflow.com'
    password = 'Admin@123'
} | ConvertTo-Json

Write-Host "Step 1: Logging in with Whapi.Cloud..."
try {
    $loginResp = Invoke-WebRequest -Uri $loginUri -Method POST -Body $loginBody -ContentType 'application/json' -ErrorAction Stop
    $token = ($loginResp.Content | ConvertFrom-Json).token
    Write-Host "✅ Logged in - Token: $($token.Substring(0, 20))..."
} catch {
    Write-Host "❌ Login failed"
    Write-Host "Error: $($_.Exception.Message)"
    exit 1
}

if ($token) {
    $headers = @{ 'Authorization' = "Bearer $token" }
    
    # Step 2: Set phone number if needed
    Write-Host "`nStep 2: Setting phone number to +94772452955..."
    $phoneBody = @{ phone_number = '+94772452955' } | ConvertTo-Json
    Invoke-WebRequest -Uri $phoneUri -Method POST -Headers $headers -Body $phoneBody -ContentType 'application/json' -ErrorAction SilentlyContinue | Out-Null
    Write-Host "✅ Phone number set"
    
    # Step 3: Send test message via Whapi.Cloud
    Write-Host "`nStep 3: Sending test message via Whapi.Cloud..."
    $result = Invoke-WebRequest -Uri $testUri -Method POST -Headers $headers -ContentType 'application/json' -ErrorAction SilentlyContinue
    $response = $result.Content | ConvertFrom-Json
    
    if ($response.success) {
        Write-Host "✅ MESSAGE SENT VIA WHAPI.CLOUD!"
        Write-Host "   Message ID: $($response.sid)"
        Write-Host "   Provider: $($response.provider)"
        Write-Host "   Status: Check your WhatsApp on +94772452955"
    } else {
        Write-Host "❌ Failed: $($response.reason)"
    }
} else {
    Write-Host "❌ No token received"
}
