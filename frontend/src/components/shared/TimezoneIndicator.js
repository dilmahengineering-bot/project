import React, { useState, useEffect } from 'react';
import { getTimezoneInfo, formatDateInSLST, getNowInSLST } from '../../utils/timezoneHelper';
import './TimezoneIndicator.css';

export default function TimezoneIndicator() {
  const [timeStr, setTimeStr] = useState('');
  const [tzInfo, setTzInfo] = useState(null);

  useEffect(() => {
    const updateTime = () => {
      const now = getNowInSLST();
      setTimeStr(formatDateInSLST(now, 'HH:mm:ss'));
      const info = getTimezoneInfo();
      setTzInfo(info);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  if (!tzInfo) return null;

  const tooltipText = `System Timezone: ${tzInfo.name} (${tzInfo.offset})\nCurrent Time: ${tzInfo.displayTime}`;

  return (
    <div className="timezone-indicator" title={tooltipText}>
      <span className="tz-icon">🌏</span>
      <span className="tz-text">{tzInfo.abbreviation}</span>
      <span className="tz-time">{timeStr}</span>
    </div>
  );
}
