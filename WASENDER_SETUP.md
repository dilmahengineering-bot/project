# WaSender Setup Guide

## Step 1: Create WaSender Account
1. Go to https://wasender.com
2. Sign up for a free or paid account
3. Complete email verification

## Step 2: Get Your API Credentials
1. Log into WaSender dashboard
2. Go to **Settings** or **API** section
3. Find your:
   - **API Key** (authorization token)
   - **Device ID** (if required)
   - **API Base URL** (usually https://api.wasender.com)

## Step 3: Configure Environment Variables
Add these to your `.env` file in the backend folder:

```
# WaSender Configuration
WASENDER_API_KEY=your_api_key_here
WASENDER_DEVICE_ID=your_device_id_here
WASENDER_BASE_URL=https://api.wasender.com
```

## Step 4: Update Render Environment Variables
1. Go to https://render.com
2. Find your taskflow-backend service
3. Go to **Environment** tab
4. Add the same environment variables:
   - WASENDER_API_KEY
   - WASENDER_DEVICE_ID
   - WASENDER_BASE_URL

## Step 5: Test Connection
Once configured, run:
```bash
npm install  # If needed
node send-all-summaries.js  # Test sending to all users
```

## Features
- ✅ Personalized summaries for each user
- ✅ Overdue and due-soon alerts
- ✅ Automatic scheduled messaging (7 AM & 7 PM UTC)
- ✅ Manual send from admin panel
- ✅ Full delivery tracking

## Troubleshooting
- **402 Error**: Check API key and account balance
- **Invalid Phone**: Ensure numbers start with + and country code
- **No Messages Sent**: Verify API key in environment variables
