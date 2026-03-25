# Test with different phone numbers
$loginUri = 'http://localhost:5000/api/auth/login'
$phoneUri = 'http://localhost:5000/api/whatsapp/phone'
$testUri = 'http://localhost:5000/api/whatsapp/test-message'

$testNumbers = @('+94760868732', '+13613206874', '+13185923091')

# Login
$loginBody = @{ email = 'admin@taskflow.com'; password = 'Admin@123' } | ConvertTo-Json
$loginResp = Invoke-WebRequest -Uri $loginUri -Method POST -Body $loginBody -ContentType 'application/json' -ErrorAction SilentlyContinue
$token = ($loginResp.Content | ConvertFrom-Json).token
$headers = @{ 'Authorization' = "Bearer $token" }

Write-Host "Testing different phone numbers...`n"

foreach ($number in $testNumbers) {
    Write-Host "Testing $number..."
    
    # Set phone number
    $phoneBody = @{ phone_number = $number } | ConvertTo-Json
    Invoke-WebRequest -Uri $phoneUri -Method POST -Headers $headers -Body $phoneBody -ContentType 'application/json' -ErrorAction SilentlyContinue | Out-Null
    
    # Send test message
    $result = Invoke-WebRequest -Uri $testUri -Method POST -Headers $headers -ContentType 'application/json' -ErrorAction SilentlyContinue
    $response = $result.Content | ConvertFrom-Json
    
    if ($response.success) {
        Write-Host "  ✅ Sent - SID: $($response.sid)`n"
    } else {
        Write-Host "  ❌ Failed: $($response.reason)`n"
    }
    Start-Sleep -Seconds 1
}

Write-Host "Check each number and confirm which one receives the message."
