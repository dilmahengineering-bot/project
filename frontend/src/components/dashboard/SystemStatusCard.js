import React, { useState, useEffect } from 'react';
import { getSyncedTime } from '../../services/timeSyncService';
import { formatDateInSLST, getTimezoneInfo } from '../../utils/timezoneHelper';
import './SystemStatusCard.css';

export default function SystemStatusCard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [tzInfo, setTzInfo] = useState(null);
  const [uptime, setUptime] = useState(0);

  // Update time every second
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(getSyncedTime());
      const info = getTimezoneInfo();
      setTzInfo(info);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate uptime (time since component mounted)
  useEffect(() => {
    const startTime = Date.now();
    const uptimeInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      setUptime({ hours, minutes });
    }, 1000);

    return () => clearInterval(uptimeInterval);
  }, []);

  const dateDisplay = formatDateInSLST(currentTime, 'DD/MM/YYYY');
  const timeDisplay = formatDateInSLST(currentTime, 'HH:mm:ss');

  return (
    <div className="system-status-card">
      <div className="status-header">
        <div className="status-title">
          <span className="status-icon">🖥️</span>
          <h3>System Status</h3>
        </div>
        <div className="status-indicator active">
          <span className="status-dot"></span>
          Active
        </div>
      </div>

      <div className="status-content">
        <div className="status-section">
          <div className="status-label">Date</div>
          <div className="status-value date-display">{dateDisplay}</div>
        </div>

        <div className="status-section">
          <div className="status-label">Time</div>
          <div className="status-value time-display">{timeDisplay}</div>
        </div>

        <div className="status-section">
          <div className="status-label">Timezone</div>
          <div className="status-value">{tzInfo?.timezone || 'Loading...'}</div>
        </div>

        <div className="status-section">
          <div className="status-label">System Uptime</div>
          <div className="status-value">
            {uptime.hours > 0 ? `${uptime.hours}h ${uptime.minutes}m` : `${uptime.minutes}m`}
          </div>
        </div>
      </div>

      <div className="status-footer">
        <div className="server-sync">
          <span className="sync-icon">↔️</span>
          <span>Server Synced</span>
        </div>
      </div>
    </div>
  );
}
