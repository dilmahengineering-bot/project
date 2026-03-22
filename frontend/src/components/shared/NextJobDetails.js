import React, { useMemo } from 'react';
import { getNowInSLST, formatTimeInSLST, formatDateInSLST } from '../../utils/timezoneHelper';
import './NextJobDetails.css';

export default function NextJobDetails({ entries = [], machines = [] }) {
  const jobDetails = useMemo(() => {
    if (!entries || entries.length === 0) return null;

    const now = getNowInSLST();
    
    // Find current job
    const currentJob = entries.find(entry => {
      const start = new Date(entry.planned_start_time);
      const end = new Date(entry.planned_end_time);
      return start <= now && end > now;
    });

    // Find next job(s) - top 2 upcoming jobs
    const sortedEntries = [...entries].sort((a, b) => 
      new Date(a.planned_start_time) - new Date(b.planned_start_time)
    );
    
    const upcomingJobs = sortedEntries.filter(entry => 
      new Date(entry.planned_start_time) > now
    ).slice(0, 2);

    return {
      current: currentJob,
      upcoming: upcomingJobs,
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

  return (
    <div className="next-job-details">
      {/* Current Job */}
      {jobDetails.current && (
        <div className="job-block current-job">
          <div className="job-header">
            <span className="job-label">● Now Playing</span>
            <span className="job-status-badge">IN PROGRESS</span>
          </div>
          <div className="job-content">
            <div className="job-main-info">
              <h3 className="job-number">{jobDetails.current.job_card_number}</h3>
              <p className="job-name">{jobDetails.current.job_name}</p>
            </div>
            <div className="job-grid">
              <div className="job-item">
                <span className="label">Machine</span>
                <span className="value">🖥️ {jobDetails.current.machine_name}</span>
              </div>
              <div className="job-item">
                <span className="label">Time</span>
                <span className="value">
                  {formatTimeInSLST(jobDetails.current.planned_start_time)} - {formatTimeInSLST(jobDetails.current.planned_end_time)}
                </span>
              </div>
              <div className="job-item">
                <span className="label">Duration</span>
                <span className="value">
                  {formatTimeDiff(new Date(jobDetails.current.planned_start_time), new Date(jobDetails.current.planned_end_time))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Next Jobs */}
      {jobDetails.upcoming.map((job, index) => (
        <div key={job.id} className={`job-block next-job next-job-${index + 1}`}>
          <div className="job-header">
            <span className="job-label">◯ Next {index === 0 ? '(1)' : '(2)'}</span>
            <span className="job-status-badge planned">PLANNED</span>
          </div>
          <div className="job-content">
            <div className="job-main-info">
              <h3 className="job-number">{job.job_card_number}</h3>
              <p className="job-name">{job.job_name}</p>
            </div>
            <div className="job-grid">
              <div className="job-item">
                <span className="label">Machine</span>
                <span className="value">🖥️ {job.machine_name}</span>
              </div>
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
}
