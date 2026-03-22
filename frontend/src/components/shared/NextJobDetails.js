import React, { useMemo, useState, useEffect } from 'react';
import { getNowInSLST, formatTimeInSLST, isTimeInRange } from '../../utils/timezoneHelper';
import './NextJobDetails.css';

export default function NextJobDetails({ entries = [], machines = [] }) {
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh every 30 seconds to update countdown timers
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for timezone changes and refresh immediately
  useEffect(() => {
    const handleSettingsChanged = (event) => {
      if (event.detail.changed?.includes('timezone')) {
        setRefreshKey(k => k + 1);
      }
    };

    window.addEventListener('settingsChanged', handleSettingsChanged);
    return () => window.removeEventListener('settingsChanged', handleSettingsChanged);
  }, []);

  const jobDetails = useMemo(() => {
    if (!entries || entries.length === 0) return null;

    const now = getNowInSLST();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    
    // Find current jobs (one per machine) - using precise time range check
    const currentJobs = {};
    entries.forEach(entry => {
      if (isTimeInRange(entry.planned_start_time, entry.planned_end_time)) {
        const machineId = entry.machine_id || entry.machine_name;
        if (!currentJobs[machineId]) {
          currentJobs[machineId] = entry;
        }
      }
    });

    // Find ALL upcoming jobs within 2 hours grouped by machine
    const upcomingByMachine = {};
    const sortedEntries = [...entries].sort((a, b) => 
      new Date(a.planned_start_time) - new Date(b.planned_start_time)
    );
    
    sortedEntries.forEach(entry => {
      const start = new Date(entry.planned_start_time);
      // Show ALL jobs starting within next 2 hours
      if (start > now && start <= twoHoursFromNow) {
        const machineId = entry.machine_id || entry.machine_name;
        if (!upcomingByMachine[machineId]) {
          upcomingByMachine[machineId] = [];
        }
        upcomingByMachine[machineId].push(entry);
      }
    });

    return {
      currentJobs,
      upcomingByMachine,
      now,
    };
  }, [entries, refreshKey]);

  if (!jobDetails) {
    return (
      <div className="next-job-details">
        <div className="job-block empty">
          <p>No jobs scheduled</p>
        </div>
      </div>
    );
  }

  const formatTimeDiff = (start, end) => {
    const duration = (end - start) / (1000 * 60); // minutes
    if (duration < 60) {
      return `${Math.round(duration)}m`;
    }
    const hours = Math.floor(duration / 60);
    const mins = Math.round(duration % 60);
    return `${hours}h ${mins}m`;
  };

  // Calculate time until job starts
  const getTimeUntilStart = (startTime) => {
    const jobStartTime = new Date(startTime);
    const now = jobDetails.now;
    const minutesUntilStart = (jobStartTime - now) / (1000 * 60);
    
    if (minutesUntilStart < 60) {
      return `${Math.round(minutesUntilStart)}m`;
    }
    const hours = Math.floor(minutesUntilStart / 60);
    const mins = Math.round(minutesUntilStart % 60);
    return `${hours}h ${mins}m`;
  };

  // Get all machines with upcoming jobs
  const activeMachines = Object.keys({
    ...jobDetails.currentJobs,
    ...jobDetails.upcomingByMachine,
  });

  // If no current jobs and no upcoming jobs within 1-2 hours
  if (activeMachines.length === 0 || Object.keys(jobDetails.upcomingByMachine).every(m => jobDetails.upcomingByMachine[m].length === 0)) {
    return (
      <div className="next-job-details">
        <div className="job-block empty">
          <p>No jobs starting within the next 2 hours</p>
        </div>
      </div>
    );
  }

  return (
    <div className="next-job-details">
      <div className="machines-container">
        {activeMachines.map(machineId => {
          const currentJob = jobDetails.currentJobs[machineId];
          const upcomingJobs = jobDetails.upcomingByMachine[machineId] || [];
          
          return (
            <div key={machineId} className="machine-section">
              <div className="machine-header">
                <span className="machine-name">🖥️ {machineId}</span>
                <span className="jobs-count">{(currentJob ? 1 : 0) + upcomingJobs.length} Job(s)</span>
              </div>
              
              {/* Current Job for this machine */}
              {currentJob && (
                <div className="job-block current-job">
                  <div className="job-header">
                    <span className="job-status-badge">RUNNING NOW</span>
                  </div>
                  <div className="job-content">
                    <h3 className="job-number">{currentJob.job_card_number}</h3>
                    <p className="job-name">{currentJob.job_name}</p>
                    <div className="job-grid">
                      <div className="job-item">
                        <span className="label">Time</span>
                        <span className="value">
                          {formatTimeInSLST(currentJob.planned_start_time)} - {formatTimeInSLST(currentJob.planned_end_time)}
                        </span>
                      </div>
                      <div className="job-item">
                        <span className="label">Duration</span>
                        <span className="value">
                          {formatTimeDiff(new Date(currentJob.planned_start_time), new Date(currentJob.planned_end_time))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Upcoming jobs within 2 hours for this machine */}
              {upcomingJobs.map((job, index) => {
                const minutesUntil = (new Date(job.planned_start_time).getTime() - jobDetails.now.getTime()) / (1000 * 60);
                let urgencyClass = 'next-job-upcoming';
                let urgencyLabel = '📋 Upcoming';
                let urgencyBadgeClass = 'upcoming';

                if (minutesUntil <= 30) {
                  urgencyClass = 'next-job-critical';
                  urgencyLabel = '🔴 URGENT';
                  urgencyBadgeClass = 'critical';
                } else if (minutesUntil <= 60) {
                  urgencyClass = 'next-job-soon';
                  urgencyLabel = '🟠 Very Soon';
                  urgencyBadgeClass = 'soon';
                }

                return (
                  <div key={job.id} className={`job-block next-job ${urgencyClass}`}>
                    <div className="job-header">
                      <span className="job-label">{urgencyLabel}</span>
                      <span className={`job-status-badge ${urgencyBadgeClass}`}>IN {getTimeUntilStart(job.planned_start_time)}</span>
                    </div>
                    <div className="job-content">
                      <h3 className="job-number">{job.job_card_number}</h3>
                      <p className="job-name">{job.job_name}</p>
                      <div className="job-grid">
                        <div className="job-item">
                          <span className="label">Starts At</span>
                          <span className="value">{formatTimeInSLST(job.planned_start_time)}</span>
                        </div>
                        <div className="job-item">
                          <span className="label">Duration</span>
                          <span className="value">
                            {formatTimeDiff(new Date(job.planned_start_time), new Date(job.planned_end_time))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
