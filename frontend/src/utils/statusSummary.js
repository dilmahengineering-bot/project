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
  
  // Count jobs by status - ACROSS ALL MACHINES
  const activeJobs = entries.filter(e => e.status === 'in_progress');
  const plannedJobs = entries.filter(e => e.status === 'planned');
  const completedJobs = entries.filter(e => e.status === 'completed');
  const totalJobs = entries.length;

  // Count jobs per machine
  const jobsByMachine = {};
  entries.forEach(entry => {
    const machineId = entry.machine_id;
    const machineName = entry.machine_name || 'Unknown';
    if (!jobsByMachine[machineName]) {
      jobsByMachine[machineName] = 0;
    }
    jobsByMachine[machineName]++;
  });

  // Find current job (earliest job that is currently ongoing)
  const currentJob = entries
    .filter(entry => {
      const start = new Date(entry.planned_start_time);
      const end = new Date(entry.planned_end_time);
      return start <= now && end > now;
    })
    .sort((a, b) => new Date(a.planned_start_time) - new Date(b.planned_start_time))[0];

  // Find next job (earliest job starting after now)
  const sortedByStart = [...entries].sort((a, b) => 
    new Date(a.planned_start_time) - new Date(b.planned_start_time)
  );
  const nextJob = sortedByStart.find(entry => 
    new Date(entry.planned_start_time) > now
  );

  let summary = `Status Report for ${formatDateInSLST(now, 'DD/MM/YYYY HH:mm')}. `;
  
  summary += `Total jobs: ${totalJobs}. `;
  summary += `Active: ${activeJobs.length}. Planned: ${plannedJobs.length}. Completed: ${completedJobs.length}. `;

  // Show job distribution across machines
  const machineList = Object.keys(jobsByMachine).sort().join(', ');
  const machineCount = Object.keys(jobsByMachine).length;
  summary += `${machineCount} machine${machineCount !== 1 ? 's' : ''} have jobs: ${machineList}. `;

  if (currentJob) {
    summary += `Current job: ${currentJob.job_card_number}, ${currentJob.job_name}, `;
    summary += `on machine ${currentJob.machine_name}. `;
  } else {
    summary += `No current jobs. `;
  }

  if (nextJob) {
    summary += `Next job: ${nextJob.job_card_number}, ${nextJob.job_name}, `;
    summary += `on machine ${nextJob.machine_name}. `;
    const nextStart = new Date(nextJob.planned_start_time);
    const timeUntil = Math.floor((nextStart - now) / 60000);
    if (timeUntil < 60) {
      summary += `Starting in ${timeUntil} minutes.`;
    } else {
      const hours = Math.floor(timeUntil / 60);
      const mins = timeUntil % 60;
      summary += `Starting in ${hours} hour${hours !== 1 ? 's' : ''} ${mins} minute${mins !== 1 ? 's' : ''}.`;
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

export function generateDetailedStatusByMachine(entries, machines) {
  if (!entries || entries.length === 0) {
    return 'No jobs scheduled for any machine.';
  }

  const now = getNowInSLST();
  const jobsByMachine = {};

  // Group entries by machine
  entries.forEach(entry => {
    const machineName = entry.machine_name || 'Unknown Machine';
    if (!jobsByMachine[machineName]) {
      jobsByMachine[machineName] = {
        jobs: [],
        active: 0,
        planned: 0,
        completed: 0,
      };
    }
    jobsByMachine[machineName].jobs.push(entry);
    jobsByMachine[machineName][entry.status]++;
  });

  const machineNames = Object.keys(jobsByMachine).sort();
  let detail = `Detailed Status by Machine. `;

  machineNames.forEach((machineName, index) => {
    const machineData = jobsByMachine[machineName];
    const totalMachineJobs = machineData.jobs.length;
    detail += `${machineName}: ${totalMachineJobs} job${totalMachineJobs !== 1 ? 's' : ''}`;
    
    if (machineData.active > 0) {
      detail += ` - ${machineData.active} active`;
    }
    if (machineData.planned > 0) {
      detail += ` - ${machineData.planned} planned`;
    }

    // Find current job for this machine
    const currentMachineJob = machineData.jobs.find(entry => {
      const start = new Date(entry.planned_start_time);
      const end = new Date(entry.planned_end_time);
      return start <= now && end > now;
    });

    if (currentMachineJob) {
      detail += `. Running: ${currentMachineJob.job_card_number}`;
    }

    if (index < machineNames.length - 1) {
      detail += '. ';
    }
  });

  detail += '.';
  return detail;
}

export default {
  generateStatusSummary,
  generateMachineStatusSummary,
  generateDetailedStatusByMachine,
};
