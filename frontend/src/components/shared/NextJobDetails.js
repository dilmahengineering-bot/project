import React, { useMemo } from 'react';
import { getNowInSLST, formatTimeInSLST, formatDateInSLST } from '../../utils/timezoneHelper';
import './NextJobDetails.css';

export default function NextJobDetails({ entries = [], machines = [] }) {
  const jobDetails = useMemo(() => {
    if (!entries || entries.length === 0) return null;

    const now = getNowInSLST();
    
    // Find current jobs (one per machine)
    const currentJobs = {};
    entries.forEach(entry => {
      const start = new Date(entry.planned_start_time);
      const end = new Date(entry.planned_end_time);
      if (start <= now && end > now) {
        const machineId = entry.machine_id || entry.machine_name;
        if (!currentJobs[machineId]) {
          currentJobs[machineId] = entry;
        }
      }
    });

    // Find upcoming jobs grouped by machine
    const upcomingByMachine = {};
    const sortedEntries = [...entries].sort((a, b) => 
      new Date(a.planned_start_time) - new Date(b.planned_start_time)
    );
    
    sortedEntries.forEach(entry => {
      const start = new Date(entry.planned_start_time);
      if (start > now) {
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
    };
  }, [entries]);

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

  // Get all machines with jobs
  const activeMachines = Object.keys({
    ...jobDetails.currentJobs,
    ...jobDetails.upcomingByMachine,
  });

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
              
              {/* Upcoming jobs for this machine */}
              {upcomingJobs.slice(0, 3).map((job, index) => (
                <div key={job.id} className={`job-block next-job next-job-${index + 1}`}>
                  <div className="job-header">
                    <span className="job-label">Next {index === 0 ? '(1)' : index === 1 ? '(2)' : '(3)'}</span>
                    <span className="job-status-badge planned">PLANNED</span>
                  </div>
                  <div className="job-content">
                    <h3 className="job-number">{job.job_card_number}</h3>
                    <p className="job-name">{job.job_name}</p>
                    <div className="job-grid">
                      <div className="job-item">
                        <span className="label">Starts</span>
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
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
