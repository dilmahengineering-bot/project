# Timezone and Settings Configuration Guide

## Overview

The TaskFlow system now includes configurable timezone and settings management. This guide explains how to configure and use these features.

## Features

### 1. Dynamic Timezone Configuration
- Support for 14+ common timezones worldwide
- Automatic timezone-aware date/time conversions
- Real-time timezone updates across the application

### 2. Business Hours Configuration
- Customize business hours for your organization
- Used for scheduling and availability tracking
- 24-hour format (0-24)

### 3. Date & Time Format Settings
- Multiple date format options (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
- 24-hour and 12-hour time format support
- Consistent formatting across the application

## Accessing Admin Settings

### Navigate to Admin Settings
1. Log in with an administrator account
2. Open the **Sidebar** (top-left menu)
3. Scroll to the **Admin** section
4. Click **Settings** (⚙️ icon)

Or directly visit: `/admin/settings`

## Configuring Settings

### Timezone Configuration

**Step 1:** Go to Admin Settings page

**Step 2:** Find the **Timezone Configuration** section

**Step 3:** Select your timezone from the dropdown:
- Asia/Colombo (Sri Lanka) - UTC+5:30
- Asia/Bangkok (Thailand) - UTC+7
- Asia/Tokyo (Japan) - UTC+9
- Europe/London (UK) - UTC+0/1
- America/New_York (US East) - UTC-5/-4
- America/Los_Angeles (US West) - UTC-8/-7
- And 8+ more options

**Step 4:** Click **Save Settings**

### Business Hours Configuration

**Step 1:** Locate **Business Hours** section

**Step 2:** Set start time (hour):
- Example: Enter `7` for 7:00 AM

**Step 3:** Set end time (hour):
- Example: Enter `19` for 7:00 PM

**Step 4:** The display shows: "Current business hours: 07:00 - 19:00"

**Step 5:** Click **Save Settings**

### Date & Time Formats

**Step 1:** Expand **Date & Time Formats** section

**Step 2:** Choose date format:
- DD/MM/YYYY (e.g., 21/12/2024)
- MM/DD/YYYY (e.g., 12/21/2024)
- YYYY-MM-DD (e.g., 2024-12-21)

**Step 3:** Choose time format:
- 24-Hour (HH:mm) - Factory standard
- 12-Hour (hh:mm AM/PM)

**Step 4:** Click **Save Settings**

## Backend API Integration

### Environment Variables

Configure timezone on the server side (optional):

```bash
# .env
TIMEZONE=Asia/Colombo
BUSINESS_HOURS_START=7
BUSINESS_HOURS_END=19
```

### Database Updates (if needed)

If you're storing timezone settings in the database, create a settings table:

```sql
CREATE TABLE settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  key VARCHAR(100) UNIQUE NOT NULL,
  value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO settings (key, value) VALUES ('timezone', 'Asia/Colombo');
INSERT INTO settings (key, value) VALUES ('businessHoursStart', '7');
INSERT INTO settings (key, value) VALUES ('businessHoursEnd', '19');
```

### Express Route Example

```javascript
// routes/settings.js
const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');

router.get('/settings', getSettings);
router.put('/settings', updateSettings);

module.exports = router;
```

## Using Timezone in Components

### Import Timezone Helper

```javascript
import { 
  getNowInSLST, 
  convertToSLST, 
  formatDateInSLST,
  getTimezoneInfo 
} from '../../utils/timezoneHelper';
```

### Get Current Time in Configured Timezone

```javascript
const now = getNowInSLST();
console.log(`Current time: ${formatDateInSLST(now, 'DD/MM/YYYY HH:mm:ss')}`);
```

### Convert UTC Date to Local Timezone

```javascript
const utcDate = new Date('2024-12-21T12:00:00Z');
const localTime = convertToSLST(utcDate);
console.log(formatDateInSLST(localTime, 'DD/MM/YYYY HH:mm'));
```

### Check Business Hours

```javascript
import { isBusinessHours } from '../../utils/timezoneHelper';

if (isBusinessHours()) {
  console.log('Currently within business hours');
}
```

### Get Timezone Information

```javascript
const tzInfo = getTimezoneInfo();
console.log(`Timezone: ${tzInfo.name}`);
console.log(`Current Time: ${tzInfo.displayTime}`);
```

## Settings Service API

### Available Functions

#### `getSettings()`
Returns all current settings with defaults

```javascript
const allSettings = getSettings();
// Returns: { timezone, dateFormat, timeFormat, businessHoursStart, businessHoursEnd }
```

#### `getSetting(key, defaultValue)`
Get a specific setting

```javascript
const timezone = getSetting('timezone', 'Asia/Colombo');
```

#### `updateSettings(updates)`
Update multiple settings at once

```javascript
updateSettings({
  timezone: 'America/New_York',
  businessHoursStart: 9,
  businessHoursEnd: 17
});
```

#### `setTimezone(timezone)`
Convenience function to set timezone

```javascript
setTimezone('Europe/London');
```

#### `getBusinessHours()`
Get business hours configuration

```javascript
const hours = getBusinessHours();
console.log(`Hours: ${hours.start}:00 - ${hours.end}:00`);
```

#### `setBusinessHours(start, end)`
Convenience function to set business hours

```javascript
setBusinessHours(8, 18); // 8 AM to 6 PM
```

#### `resetSettings()`
Reset all settings to defaults

```javascript
resetSettings();
```

## Event Listener

Components can listen for settings changes:

```javascript
useEffect(() => {
  const handleSettingsChanged = (event) => {
    console.log('Settings changed:', event.detail);
    // Update component state if needed
  };

  window.addEventListener('settingsChanged', handleSettingsChanged);
  return () => window.removeEventListener('settingsChanged', handleSettingsChanged);
}, []);
```

## localStorage Structure

Settings are stored in browser localStorage under the key `taskflow_settings`:

```json
{
  "timezone": "Asia/Colombo",
  "dateFormat": "DD/MM/YYYY",
  "timeFormat": "24h",
  "businessHoursStart": 7,
  "businessHoursEnd": 19
}
```

## Troubleshooting

### Settings Not Saving
- Check browser console for errors
- Verify localStorage is enabled
- Ensure admin user has proper permissions

### Timezone Not Changing
- Clear browser cache
- Refresh the page
- Check if timezone IANA code is valid

### Business Hours Not Applied
- Verify hours value is between 0-24
- Ensure start hour < end hour
- Check that system using isBusinessHours() function

## Common Timezone Codes

| Region | Timezone Code | UTC Offset |
|--------|---------------|-----------|
| Sri Lanka | Asia/Colombo | UTC+5:30 |
| India | Asia/Kolkata | UTC+5:30 |
| Thailand | Asia/Bangkok | UTC+7 |
| Singapore | Asia/Singapore | UTC+8 |
| Japan | Asia/Tokyo | UTC+9 |
| Sydney | Australia/Sydney | UTC+10/11 |
| London | Europe/London | UTC+0/1 |
| Paris | Europe/Paris | UTC+1/2 |
| New York | America/New_York | UTC-5/-4 |
| Los Angeles | America/Los_Angeles | UTC-8/-7 |
| Chicago | America/Chicago | UTC-6/-5 |
| Auckland | Pacific/Auckland | UTC+12/13 |
| Dubai | Asia/Dubai | UTC+4 |
| Hong Kong | Asia/Hong_Kong | UTC+8 |

## Default Settings

```javascript
{
  timezone: 'Asia/Colombo',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  businessHoursStart: 7,
  businessHoursEnd: 19
}
```

## Summary

With the new settings system, you can:
✅ Configure timezone globally for the organization
✅ Set custom business hours
✅ Choose preferred date/time formats
✅ Use timezone-aware time conversions throughout the application
✅ Persist settings in browser localStorage
✅ Listen to settings changes in real-time

For more information or issues, contact your system administrator.
