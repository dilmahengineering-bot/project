/**
 * Time Sync Service
 * Synchronizes frontend time with server time to ensure all users
 * see consistent time regardless of their browser's local timezone
 */

let serverTimeOffset = 0; // Offset between client and server time in ms
let lastSyncTime = 0; // Last time we synced with server (ms since epoch)
const SYNC_INTERVAL = 5 * 60 * 1000; // Resync every 5 minutes

/**
 * Sync with server time
 * Calculates the offset between client and server
 */
export async function syncWithServer() {
  try {
    const clientTime = Date.now();
    const response = await fetch('/api/time', { method: 'GET' });
    const data = await response.json();
    const serverTime = data.timestamp;
    const fetchTime = Date.now();

    // Calculate offset: serverTime - clientTime
    // Account for network latency by dividing by 2
    const latency = (fetchTime - clientTime) / 2;
    serverTimeOffset = serverTime - clientTime - latency;
    lastSyncTime = clientTime;

    console.log('[TimeSync] Synced with server. Offset:', serverTimeOffset, 'ms');
    return true;
  } catch (error) {
    console.error('[TimeSync] Failed to sync with server:', error);
    return false;
  }
}

/**
 * Get current time synchronized with server
 * If manual time is enabled, use that instead
 * @returns {Date} Server-synchronized time
 */
export function getSyncedTime() {
  // Check if we need to resync
  if (Date.now() - lastSyncTime > SYNC_INTERVAL) {
    syncWithServer(); // Async, but don't wait
  }

  // Return adjusted time
  return new Date(Date.now() + serverTimeOffset);
}

/**
 * Initialize time sync on app start
 * Call this in your app initialization (App.js or main entry point)
 */
export async function initializeTimeSync() {
  const success = await syncWithServer();
  if (success) {
    // Resync periodically
    setInterval(syncWithServer, SYNC_INTERVAL);
  }
  return success;
}

/**
 * Get the current offset (for debugging)
 */
export function getTimeOffset() {
  return serverTimeOffset;
}

/**
 * Reset time sync (useful for testing)
 */
export function resetTimeSync() {
  serverTimeOffset = 0;
  lastSyncTime = 0;
}

export default {
  syncWithServer,
  getSyncedTime,
  initializeTimeSync,
  getTimeOffset,
  resetTimeSync,
};
