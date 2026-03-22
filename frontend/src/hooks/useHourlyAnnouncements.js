import { useEffect, useRef, useState } from 'react';
import voiceAnnouncer from '../utils/voiceAnnouncer';
import { getNowInSLST } from '../utils/timezoneHelper';

/**
 * Hook to handle announcements for jobs starting within next 2 hours
 * Scans timeline continuously and announces upcoming jobs
 * @param {array} entries - All job entries from Gantt Chart
 * @param {array} machines - All machines
 * @param {boolean} isActive - Whether announcements should be active
 * @param {object} options - Voice options (rate, pitch, volume, lang)
 */
export const useHourlyAnnouncements = (entries, machines, isActive = true, options = {}) => {
  const scanIntervalRef = useRef(null);
  const announcedJobsRef = useRef(new Set());
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    if (!isActive || !voiceEnabled || !entries || entries.length === 0) {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return;
    }

    const scanAndAnnounce = () => {
      const now = getNowInSLST();
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      
      // Get all jobs that are:
      // 1. Currently running
      // 2. Starting within next 2 hours and not yet announced
      const sortedEntries = [...entries].sort((a, b) => {
        const aStart = new Date(a.planned_start_time);
        const bStart = new Date(b.planned_start_time);
        return aStart - bStart;
      });

      // Current job
      const currentJob = sortedEntries.find(entry => {
        const start = new Date(entry.planned_start_time);
        const end = new Date(entry.planned_end_time);
        return start <= now && end > now;
      });

      // Upcoming jobs within 2 hours
      const upcomingJobs = sortedEntries.filter(entry => {
        const start = new Date(entry.planned_start_time);
        return start > now && start <= twoHoursFromNow;
      });

      // Announce each upcoming job only once
      if (voiceEnabled && upcomingJobs.length > 0) {
        upcomingJobs.forEach(job => {
          const jobKey = `${job.id}-${job.planned_start_time}`;
          if (!announcedJobsRef.current.has(jobKey)) {
            announcedJobsRef.current.add(jobKey);
            
            // Announce this job
            const announcement = `Next job alert: ${job.job_card_number}. ${job.job_name}. On machine ${job.machine_name}. Starts at ${formatTimeCompact(job.planned_start_time)}.`;
            voiceAnnouncer.announceWithBell(announcement, options).catch(err => {
              console.error('Announcement failed:', err);
            });
          }
        });
      }

      // Clean up announced jobs that are now past 2-hour window
      const keysToDelete = [];
      announcedJobsRef.current.forEach(key => {
        const [jobIdStr, timeStr] = key.split('-');
        const jobStartTime = new Date(timeStr);
        if (jobStartTime <= now || jobStartTime > twoHoursFromNow) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => announcedJobsRef.current.delete(key));
    };

    // Format time in HH:mm format
    const formatTimeCompact = (dateStr) => {
      const date = new Date(dateStr);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    // Scan every 5 minutes for upcoming jobs
    scanIntervalRef.current = setInterval(scanAndAnnounce, 5 * 60 * 1000);

    // Check immediately on mount
    scanAndAnnounce();

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [entries, isActive, voiceEnabled, options]);

  // Reset announced jobs when timezone changes
  useEffect(() => {
    const handleSettingsChanged = (event) => {
      if (event.detail.changed?.includes('timezone')) {
        announcedJobsRef.current.clear();
      }
    };
    window.addEventListener('settingsChanged', handleSettingsChanged);
    return () => window.removeEventListener('settingsChanged', handleSettingsChanged);
  }, []);

  return { voiceEnabled, setVoiceEnabled };
};

export default useHourlyAnnouncements;
