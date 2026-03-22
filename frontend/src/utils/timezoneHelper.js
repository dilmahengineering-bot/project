/**
 * Timezone Helper Utility
 * Handles all time conversions for Sri Lanka Standard Time (SLST - UTC+5:30)
 * Uses Intl API for reliable timezone conversion
 * 
 * IMPORTANT: Date objects are always stored in UTC. Conversion methods return
 * formatted strings or Date objects adjusted to SLST for calculations.
 */

const TIMEZONE = 'Asia/Colombo'; // Sri Lanka Standard Time (UTC+5:30)
const SLST_OFFSET = 5.5 * 60 * 60 * 1000; // UTC+5:30 in milliseconds

/**
 * Get current date/time in Sri Lanka time
 * Returns a pseudo-date object adjusted to SLST for time calculations
 * @returns {Date} - Current time adjusted to SLST
 */
export function getNowInSLST() {
  const now = new Date();
  
  // Use Intl API to properly format in SLST timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const partsMap = {};
  parts.forEach(part => {
    partsMap[part.type] = part.value;
  });
  
  // Create a Date adjusted to SLST (not UTC)
  // This is used for local calculations only
  const slstDate = new Date(
    parseInt(partsMap.year),
    parseInt(partsMap.month) - 1,
    parseInt(partsMap.day),
    parseInt(partsMap.hour),
    parseInt(partsMap.minute),
    parseInt(partsMap.second)
  );
  
  // Store the original UTC time as metadata for conversions
  slstDate._utcDate = now;
  return slstDate;
}

/**
 * Convert a given date to Sri Lanka time adjusted date
 * @param {Date|string|number} date - Date to convert
 * @returns {Date} - Date adjusted to SLST
 */
export function convertToSLST(date) {
  if (!date) return getNowInSLST();
  
  const d = new Date(date);
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(d);
  const partsMap = {};
  parts.forEach(part => {
    partsMap[part.type] = part.value;
  });
  
  const slstDate = new Date(
    parseInt(partsMap.year),
    parseInt(partsMap.month) - 1,
    parseInt(partsMap.day),
    parseInt(partsMap.hour),
    parseInt(partsMap.minute),
    parseInt(partsMap.second)
  );
  
  slstDate._utcDate = d;
  return slstDate;
}

/**
 * Get current hour in Sri Lanka time
 * @returns {number} - Hour (0-23)
 */
export function getCurrentHourInSLST() {
  return getNowInSLST().getHours();
}

/**
 * Get current date string in SLST (YYYY-MM-DD format)
 * @returns {string} - Date string
 */
export function getTodayInSLST() {
  const now = getNowInSLST();
  return now.toISOString().split('T')[0];
}

/**
 * Format date with SLST timezone
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string (e.g., 'YYYY-MM-DD HH:mm:ss')
 * @returns {string} - Formatted date
 */
export function formatDateInSLST(date, format = 'DD/MM/YYYY HH:mm') {
  const d = convertToSLST(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace(/YYYY/g, year)
    .replace(/MM/g, month)
    .replace(/DD/g, day)
    .replace(/HH/g, hours)
    .replace(/mm/g, minutes)
    .replace(/ss/g, seconds);
}

/**
 * Format time in SLST (HH:mm format)
 * @param {Date|string} date - Date to format
 * @returns {string} - Time string (HH:mm)
 */
export function formatTimeInSLST(date) {
  const d = convertToSLST(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Get timezone info with current time debug info
 * @returns {object} - Timezone details
 */
export function getTimezoneInfo() {
  const now = new Date();
  const slstNow = getNowInSLST();
  
  // Formatter for debugging
  const debugFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const debugStr = debugFormatter.format(now);
  
  return {
    name: 'Sri Lanka Standard Time (SLST)',
    abbreviation: 'SLST',
    offset: 'UTC+5:30',
    offsetMs: SLST_OFFSET,
    timezone: TIMEZONE,
    currentTime: slstNow,
    displayTime: formatDateInSLST(now, 'DD/MM/YYYY HH:mm:ss'),
    debugTime: debugStr,
    localTime: now.toLocaleString(),
    utcTime: now.toUTCString(),
  };
}

/**
 * Check if time is within business hours (7 AM - 7 PM SLST)
 * @param {Date} date - Date to check
 * @returns {boolean} - True if within business hours
 */
export function isBusinessHours(date) {
  const d = convertToSLST(date);
  const hour = d.getHours();
  return hour >= 7 && hour < 19; // 7 AM to 7 PM
}

/**
 * Check if a time range contains current time (SLST)
 * @param {Date|string} startTime - Start time
 * @param {Date|string} endTime - End time
 * @returns {boolean} - True if current time is within range
 */
export function isTimeInRange(startTime, endTime) {
  const now = getNowInSLST().getTime();
  const start = convertToSLST(startTime).getTime();
  const end = convertToSLST(endTime).getTime();
  return now >= start && now <= end;
}

export default {
  getNowInSLST,
  convertToSLST,
  getCurrentHourInSLST,
  getTodayInSLST,
  formatDateInSLST,
  formatTimeInSLST,
  getTimezoneInfo,
  isBusinessHours,
  isTimeInRange,
};
