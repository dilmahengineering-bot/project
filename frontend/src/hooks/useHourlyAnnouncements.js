import { useEffect, useRef, useState } from 'react';
import voiceAnnouncer from '../utils/voiceAnnouncer';

/**
 * Hook to handle hourly job announcements in Gantt Chart
 * @param {array} entries - All job entries from Gantt Chart
 * @param {array} machines - All machines
 * @param {boolean} isActive - Whether announcements should be active
 * @param {object} options - Voice options (rate, pitch, volume, lang)
 */
export const useHourlyAnnouncements = (entries, machines, isActive = true, options = {}) => {
  const hourlyCheckIntervalRef = useRef(null);
  const lastAnnouncedHourRef = useRef(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    if (!isActive || !voiceEnabled || !entries || entries.length === 0) {
      if (hourlyCheckIntervalRef.current) {
        clearInterval(hourlyCheckIntervalRef.current);
        hourlyCheckIntervalRef.current = null;
      }
      return;
    }

    const checkAndAnnounce = () => {
      const now = new Date();
      const currentHour = now.getHours();

      // Only announce once per hour, at the top of the hour or after
      if (lastAnnouncedHourRef.current === currentHour) {
        return;
      }

      lastAnnouncedHourRef.current = currentHour;

      // Find current and next jobs
      const currentTime = new Date();
      const sortedEntries = [...entries].sort((a, b) => {
        const aStart = new Date(a.planned_start_time);
        const bStart = new Date(b.planned_start_time);
        return aStart - bStart;
      });

      // Current job: one that encompasses current time
      const currentJob = sortedEntries.find(entry => {
        const start = new Date(entry.planned_start_time);
        const end = new Date(entry.planned_end_time);
        return start <= currentTime && end > currentTime;
      });

      // Next job: first one after current time
      const nextJob = sortedEntries.find(entry => {
        const start = new Date(entry.planned_start_time);
        return start > currentTime;
      });

      // Announce
      if (voiceEnabled) {
        voiceAnnouncer.announceJobs(currentJob, nextJob, options).catch(err => {
          console.error('Announcement failed:', err);
        });
      }
    };

    // Check every minute for hour changes (more reliable than every hour)
    hourlyCheckIntervalRef.current = setInterval(checkAndAnnounce, 60000);

    // Check immediately on mount
    checkAndAnnounce();

    return () => {
      if (hourlyCheckIntervalRef.current) {
        clearInterval(hourlyCheckIntervalRef.current);
      }
    };
  }, [entries, isActive, voiceEnabled, options]);

  return { voiceEnabled, setVoiceEnabled };
};

export default useHourlyAnnouncements;
