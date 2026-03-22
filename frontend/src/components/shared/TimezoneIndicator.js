import React from 'react';
import { getTimezoneInfo, formatDateInSLST, getNowInSLST } from '../../utils/timezoneHelper';

export default function TimezoneIndicator() {
  const tzInfo = getTimezoneInfo();
  const now = getNowInSLST();
  const timeStr = formatDateInSLST(now, 'HH:mm:ss');

  return (
    <div className="timezone-indicator" title={`System Timezone: ${tzInfo.name} (${tzInfo.offset})`}>
      <span className="tz-icon">🌏</span>
      <span className="tz-text">{tzInfo.abbreviation}</span>
      <span className="tz-time">{timeStr}</span>
    </div>
  );
}
