/**
 * Status Summary Utility
 * Generates voice-readable status summaries for the system
 */

import { getNowInSLST, formatDateInSLST } from './timezoneHelper';

export function generateStatusSummary(entries, machines) {
  if (!entries || entries.length === 0) {
    return 'No jobs scheduled.';
  }

  const now = getNowInSLST();
  
  // Count jobs by status
  const activeJobs = entries.filter(e => e.status === 'in_progress');
  const plannedJobs = entries.filter(e => e.status === 'planned');
  const completedJobs = entries.filter(e => e.status === 'completed');
  const totalJobs = entries.length;

  // Find current job
  const currentJob = entries.find(entry => {
    const start = new Date(entry.planned_start_time);
    const end = new Date(entry.planned_end_time);
    return start <= now && end > now;
  });

  // Find next job
  const sortedByStart = [...entries].sort((a, b) => 
    new Date(a.planned_start_time) - new Date(b.planned_start_time)
  );
  const nextJob = sortedByStart.find(entry => 
    new Date(entry.planned_start_time) > now
  );

  let summary = `Status Report for ${formatDateInSLST(now, 'DD/MM/YYYY HH:mm')}. `;
  
  summary += `Total jobs: ${totalJobs}. `;
  summary += `Active: ${activeJobs.length}. Planned: ${plannedJobs.length}. Completed: ${completedJobs.length}. `;

  if (currentJob) {
    summary += `Current job: ${currentJob.job_card_number}, ${currentJob.job_name}, `;
    summary += `on machine ${currentJob.machine_name}. `;
  }

  if (nextJob) {
    summary += `Next job: ${nextJob.job_card_number}, ${nextJob.job_name}, `;
    const nextStart = new Date(nextJob.planned_start_time);
    const timeUntil = Math.floor((nextStart - now) / 60000);
    if (timeUntil < 60) {
      summary += `starting in ${timeUntil} minutes.`;
    } else {
      const hours = Math.floor(timeUntil / 60);
      const mins = timeUntil % 60;
      summary += `starting in ${hours} hours ${mins} minutes.`;
    }
  } else {
    summary += `No upcoming jobs scheduled.`;
  }

  return summary;
}

export function generateMachineStatusSummary(machines) {
  if (!machines || machines.length === 0) {
    return 'No machines configured.';
  }

  const activeCount = machines.filter(m => m.status === 'active').length;
  const summary = `System has ${machines.length} machines. ${activeCount} machines are active.`;

  return summary;
}

export default {
  generateStatusSummary,
  generateMachineStatusSummary,
};
