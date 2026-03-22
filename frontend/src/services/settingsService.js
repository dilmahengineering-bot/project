/**
 * Settings Service
 * Manages application settings stored in localStorage
 */

const SETTINGS_KEY = 'taskflow_settings';

// Common timezones
export const COMMON_TIMEZONES = [
  { name: 'Asia/Colombo', label: 'Sri Lanka (UTC+5:30)', offset: 'UTC+5:30' },
  { name: 'Asia/Kolkata', label: 'India (UTC+5:30)', offset: 'UTC+5:30' },
  { name: 'Asia/Bangkok', label: 'Thailand (UTC+7)', offset: 'UTC+7' },
  { name: 'Asia/Singapore', label: 'Singapore (UTC+8)', offset: 'UTC+8' },
  { name: 'Asia/Tokyo', label: 'Japan (UTC+9)', offset: 'UTC+9' },
  { name: 'Australia/Sydney', label: 'Sydney (UTC+10/11)', offset: 'UTC+10/11' },
  { name: 'Europe/London', label: 'London (UTC+0/1)', offset: 'UTC+0/1' },
  { name: 'Europe/Paris', label: 'Paris (UTC+1/2)', offset: 'UTC+1/2' },
  { name: 'America/New_York', label: 'New York (UTC-5/-4)', offset: 'UTC-5/-4' },
  { name: 'America/Los_Angeles', label: 'Los Angeles (UTC-8/-7)', offset: 'UTC-8/-7' },
  { name: 'America/Chicago', label: 'Chicago (UTC-6/-5)', offset: 'UTC-6/-5' },
  { name: 'Australia/Melbourne', label: 'Melbourne (UTC+10/11)', offset: 'UTC+10/11' },
  { name: 'Pacific/Auckland', label: 'Auckland (UTC+12/13)', offset: 'UTC+12/13' },
  { name: 'Asia/Dubai', label: 'Dubai (UTC+4)', offset: 'UTC+4' },
  { name: 'Asia/Hong_Kong', label: 'Hong Kong (UTC+8)', offset: 'UTC+8' },
];

// Default settings
const DEFAULT_SETTINGS = {
  timezone: 'Asia/Colombo',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  businessHoursStart: 7,
  businessHoursEnd: 19,
};

/**
 * Get all settings
 * @returns {Object} - All settings with defaults
 */
export function getSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) {
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch (error) {
    console.error('Error retrieving settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Get a specific setting
 * @param {string} key - Setting key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} - Setting value
 */
export function getSetting(key, defaultValue = null) {
  const settings = getSettings();
  return settings[key] !== undefined ? settings[key] : defaultValue;
}

/**
 * Update settings
 * @param {Object} updates - Settings to update
 * @returns {Object} - Updated settings
 */
export function updateSettings(updates) {
  try {
    const current = getSettings();
    const merged = { ...current, ...updates };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    
    // Dispatch event so other components can react to settings changes
    window.dispatchEvent(
      new CustomEvent('settingsChanged', {
        detail: { previous: current, current: merged, changed: Object.keys(updates) }
      })
    );
    
    return merged;
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
}

/**
 * Reset settings to defaults
 * @returns {Object} - Default settings
 */
export function resetSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    window.dispatchEvent(
      new CustomEvent('settingsChanged', {
        detail: { reset: true, current: DEFAULT_SETTINGS }
      })
    );
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error resetting settings:', error);
    throw error;
  }
}

/**
 * Update timezone
 * @param {string} timezone - IANA timezone string
 * @returns {Object} - Updated settings
 */
export function setTimezone(timezone) {
  return updateSettings({ timezone });
}

/**
 * Get configured timezone
 * @returns {string} - IANA timezone string
 */
export function getTimezone() {
  return getSetting('timezone', 'Asia/Colombo');
}

/**
 * Get business hours settings
 * @returns {Object} - Business hours start and end
 */
export function getBusinessHours() {
  const settings = getSettings();
  return {
    start: settings.businessHoursStart,
    end: settings.businessHoursEnd,
  };
}

/**
 * Update business hours
 * @param {number} start - Start hour (0-24)
 * @param {number} end - End hour (0-24)
 * @returns {Object} - Updated settings
 */
export function setBusinessHours(start, end) {
  if (start < 0 || start > 24 || end < 0 || end > 24) {
    throw new Error('Business hours must be between 0 and 24');
  }
  if (start >= end) {
    throw new Error('Start hour must be before end hour');
  }
  return updateSettings({ businessHoursStart: start, businessHoursEnd: end });
}

export default {
  getSettings,
  getSetting,
  updateSettings,
  resetSettings,
  setTimezone,
  getTimezone,
  getBusinessHours,
  setBusinessHours,
  COMMON_TIMEZONES,
  DEFAULT_SETTINGS,
};
