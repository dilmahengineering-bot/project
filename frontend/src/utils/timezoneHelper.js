/**
 * Timezone Helper Utility
 * Handles all time conversions for Sri Lanka Standard Time (SLST - UTC+5:30)
 */

const TIMEZONE = 'Asia/Colombo'; // Sri Lanka Standard Time
const SLST_OFFSET = 5.5 * 60 * 60 * 1000; // UTC+5:30 in milliseconds

/**
 * Get current date/time in Sri Lanka time
 * @returns {Date} - Current date in SLST
 */
export function getNowInSLST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utc + SLST_OFFSET);
}

/**
 * Convert a given date to Sri Lanka time
 * @param {Date|string|number} date - Date to convert
 * @returns {Date} - Date in SLST
 */
export function convertToSLST(date) {
  const d = new Date(date);
  const utc = d.getTime() + d.getTimezoneOffset() * 60 * 1000;
  return new Date(utc + SLST_OFFSET);
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
 * Get timezone info
 * @returns {object} - Timezone details
 */
export function getTimezoneInfo() {
  return {
    name: 'Sri Lanka Standard Time (SLST)',
    abbreviation: 'SLST',
    offset: 'UTC+5:30',
    offsetMs: SLST_OFFSET,
    timezone: TIMEZONE,
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

export default {
  getNowInSLST,
  convertToSLST,
  getCurrentHourInSLST,
  getTodayInSLST,
  formatDateInSLST,
  formatTimeInSLST,
  getTimezoneInfo,
  isBusinessHours,
};
