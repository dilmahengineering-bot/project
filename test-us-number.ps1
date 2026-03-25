# Test with US number
$loginUri = 'http://localhost:5000/api/auth/login'
$phoneUri = 'http://localhost:5000/api/whatsapp/phone'
$testUri = 'http://localhost:5000/api/whatsapp/test-message'

# Login
$loginBody = @{ email = 'admin@taskflow.com'; password = 'Admin@123' } | ConvertTo-Json
$loginResp = Invoke-WebRequest -Uri $loginUri -Method POST -Body $loginBody -ContentType 'application/json' -ErrorAction SilentlyContinue
$token = ($loginResp.Content | ConvertFrom-Json).token
$headers = @{ 'Authorization' = "Bearer $token" }

Write-Host "Testing with US number +13613206874..."

# Set to US number
$phoneBody = @{ phone_number = '+13613206874' } | ConvertTo-Json
Invoke-WebRequest -Uri $phoneUri -Method POST -Headers $headers -Body $phoneBody -ContentType 'application/json' -ErrorAction SilentlyContinue | Out-Null

# Send test message
$result = Invoke-WebRequest -Uri $testUri -Method POST -Headers $headers -ContentType 'application/json' -ErrorAction SilentlyContinue
$response = $result.Content | ConvertFrom-Json

if ($response.success) {
    Write-Host "✅ Sent to +13613206874"
    Write-Host "   SID: $($response.sid)"
    Write-Host "   Check your WhatsApp app on that number"
} else {
    Write-Host "❌ Error: $($response.reason)"
}
