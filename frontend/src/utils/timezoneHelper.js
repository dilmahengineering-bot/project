/**
 * Timezone Helper Utility
 * Handles all time conversions using configured timezone (Intl API)
 * Uses Intl API for reliable timezone conversion
 * 
 * IMPORTANT: Date objects are always stored in UTC. Conversion methods return
 * formatted strings or Date objects adjusted to the configured timezone for calculations.
 * 
 * Timezone is configurable via settingsService
 */

import { getTimezone, getBusinessHours } from '../services/settingsService.js';

// Helper to get current timezone - allows dynamic timezone configuration
function getConfiguredTimezone() {
  try {
    return getTimezone();
  } catch {
    return 'Asia/Colombo'; // Fallback to default
  }
}

// Legacy constant for backward compatibility - now uses dynamic timezone
const TIMEZONE = 'Asia/Colombo'; // Default timezone (can be overridden via settings)
const SLST_OFFSET = 5.5 * 60 * 60 * 1000; // UTC+5:30 in milliseconds (default)

/**
 * Get current date/time in configured timezone
 * Returns an object with timezone-specific time values extracted via Intl API
 * @returns {Object} - Object with year, month, day, hour, minute, second as strings
 */
export function getNowInSLST() {
  const now = new Date();
  const tz = getConfiguredTimezone();
  
  // Format the current time in configured timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
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
  
  // Create a Date-like object with SLST values
  const slstDate = {
    year: parseInt(partsMap.year),
    month: parseInt(partsMap.month),
    day: parseInt(partsMap.day),
    hour: parseInt(partsMap.hour),
    minute: parseInt(partsMap.minute),
    second: parseInt(partsMap.second),
    _isSLST: true,
    _originalUTC: now,
    // Date-like methods for compatibility
    getFullYear() { return this.year; },
    getMonth() { return this.month - 1; },
    getDate() { return this.day; },
    getHours() { return this.hour; },
    getMinutes() { return this.minute; },
    getSeconds() { return this.second; },
    getTime() { return this._originalUTC.getTime(); },
  };
  
  if (typeof window !== 'undefined' && window.__DEBUG_TZ) {
    console.log('getNowInSLST Debug:', {
      browserLocal: now.toLocaleString(),
      utcZulu: now.toUTCString(),
      slstExtracted: `${partsMap.year}-${partsMap.month}-${partsMap.day} ${partsMap.hour}:${partsMap.minute}:${partsMap.second}`,
    });
  }
  
  return slstDate;
}

/**
 * Convert a given date to configured timezone
 * @param {Date|string|number} date - Date to convert
 * @returns {Object} - Object with timezone values
 */
export function convertToSLST(date) {
  if (!date) return getNowInSLST();
  
  const d = new Date(date);
  const tz = getConfiguredTimezone();
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
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
  
  // Return object with SLST values - similar structure to getNowInSLST
  return {
    year: parseInt(partsMap.year),
    month: parseInt(partsMap.month),
    day: parseInt(partsMap.day),
    hour: parseInt(partsMap.hour),
    minute: parseInt(partsMap.minute),
    second: parseInt(partsMap.second),
    _isSLST: true,
    _originalUTC: d,
    getFullYear() { return this.year; },
    getMonth() { return this.month - 1; },
    getDate() { return this.day; },
    getHours() { return this.hour; },
    getMinutes() { return this.minute; },
    getSeconds() { return this.second; },
    getTime() { return this._originalUTC.getTime(); },
  };
}

/**
 * Get current hour in Sri Lanka time
 * @returns {number} - Hour (0-23)
 */
export function getCurrentHourInSLST() {
  const now = getNowInSLST();
  return now.hour;
}

/**
 * Get current date string in configured timezone (YYYY-MM-DD format)
 * @returns {string} - Date string in configured timezone
 */
export function getTodayInSLST() {
  const now = new Date();
  const tz = getConfiguredTimezone();
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(now);
  const partsMap = {};
  parts.forEach(part => {
    partsMap[part.type] = part.value;
  });
  
  return `${partsMap.year}-${partsMap.month}-${partsMap.day}`;
}

/**
 * Format date with SLST timezone
 * @param {Date|string|Object} date - Date to format (can be SLST object or regular Date)
 * @param {string} format - Format string (e.g., 'YYYY-MM-DD HH:mm:ss')
 * @returns {string} - Formatted date
 */
export function formatDateInSLST(date, format = 'DD/MM/YYYY HH:mm') {
  const d = date && date._isSLST ? date : convertToSLST(date);
  const year = String(d.year).padStart(4, '0');
  const month = String(d.month).padStart(2, '0');
  const day = String(d.day).padStart(2, '0');
  const hours = String(d.hour).padStart(2, '0');
  const minutes = String(d.minute).padStart(2, '0');
  const seconds = String(d.second).padStart(2, '0');

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
 * @param {Date|string|Object} date - Date to format (can be SLST object or regular Date)
 * @returns {string} - Time string (HH:mm)
 */
export function formatTimeInSLST(date) {
  const d = date && date._isSLST ? date : convertToSLST(date);
  return `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
}

/**
 * Get timezone info with current time debug info
 * @returns {object} - Timezone details
 */
export function getTimezoneInfo() {
  const now = new Date();
  const tz = getConfiguredTimezone();
  const slstNow = getNowInSLST();
  
  // Formatter for debugging
  const debugFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
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
    name: `Configured Timezone (${tz})`,
    timezone: tz,
    currentTime: slstNow,
    displayTime: formatDateInSLST(now, 'DD/MM/YYYY HH:mm:ss'),
    debugTime: debugStr,
    localTime: now.toLocaleString(),
    utcTime: now.toUTCString(),
  };
}

/**
 * Check if time is within business hours (configurable via settings)
 * @param {Date|Object} date - Date to check (can be SLST object or regular Date)
 * @returns {boolean} - True if within business hours
 */
export function isBusinessHours(date) {
  const d = date && date._isSLST ? date : convertToSLST(date);
  
  try {
    const { start, end } = getBusinessHours();
    return d.hour >= start && d.hour < end;
  } catch {
    // Fallback to default business hours if settings can't be loaded
    return d.hour >= 7 && d.hour < 19; // 7 AM to 7 PM
  }
}

/**
 * Check if a time range contains current time (SLST)
 * @param {Date|string} startTime - Start time
 * @param {Date|string} endTime - End time
 * @returns {boolean} - True if current time is within range
 */
export function isTimeInRange(startTime, endTime) {
  const now = getNowInSLST();
  const start = convertToSLST(startTime);
  const end = convertToSLST(endTime);
  
  // Compare using timestamps for accuracy
  const nowTime = now.getTime();
  const startTime_ms = start.getTime();
  const endTime_ms = end.getTime();
  
  return nowTime >= startTime_ms && nowTime <= endTime_ms;
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
