/**
 * Intelligent Planning Engine for CNC Job Scheduling
 * 
 * Automatically:
 * - Analyzes manufacturing orders for each job
 * - Calculates optimal machine sequence timing
 * - Loads into planning board with smart scheduling
 * - Considers machine availability and shift constraints
 */

require('dotenv').config();
const db = require('../db');

// Shift constants
const DAY_START = 7;    // 7 AM
const DAY_END = 19;     // 7 PM
const SHIFT_DURATION = DAY_END - DAY_START; // 12 hours

/**
 * PlanningEngine class for intelligent job scheduling
 */
class PlanningEngine {
  /**
   * Generate automatic plan for a job card
   * Takes manufacturing orders and creates optimized scheduling
   */
  static async generateAutoPlan(jobCardId, options = {}) {
    try {
      const {
        start_date = new Date().toISOString().split('T')[0],
        assignOperator = true,
        preferredShift = 'day', // 'day', 'night', or 'both'
        respectDeadline = true,
      } = options;

      console.log(`\n📊 Generating automatic plan for job card: ${jobCardId}`);
      console.log(`   Start Date: ${start_date}, Shift: ${preferredShift}`);

      // 1. Get job card details
      const jobResult = await db.query(
        `SELECT jc.*, w.name as workflow_name FROM cnc_job_cards jc
         LEFT JOIN workflows w ON jc.workflow_id = w.id
         WHERE jc.id = $1`,
        [jobCardId]
      );

      if (jobResult.rows.length === 0) {
        throw new Error(`Job card not found: ${jobCardId}`);
      }

      const job = jobResult.rows[0];
      console.log(`✓ Job: ${job.job_name} (${job.job_card_number})`);

      // 2. Get manufacturing orders (the sequence of machines)
      const ordersResult = await db.query(
        `SELECT mo.*, m.machine_name, m.machine_code, m.machine_type
         FROM manufacturing_orders mo
         LEFT JOIN cnc_machines m ON mo.machine_id = m.id
         WHERE mo.job_card_id = $1 AND mo.status != 'skipped'
         ORDER BY mo.order_sequence ASC`,
        [jobCardId]
      );

      const manufacturingOrders = ordersResult.rows;

      if (manufacturingOrders.length === 0) {
        throw new Error(`No manufacturing orders found for job card`);
      }

      console.log(`✓ Found ${manufacturingOrders.length} manufacturing steps`);

      // 3. Calculate total time and optimal start date
      const totalMinutes = manufacturingOrders.reduce((sum, mo) => 
        sum + (mo.estimated_duration_minutes || 0), 0
      );

      console.log(`✓ Total estimated time: ${totalMinutes} minutes (~${(totalMinutes / 60).toFixed(1)} hours)`);

      // 4. Calculate estimated end date
      const estimatedEndDate = this._calculateEstimatedEndDate(
        start_date,
        totalMinutes,
        preferredShift
      );
      console.log(`✓ Estimated end date: ${estimatedEndDate}`);

      // 5. Generate plan entries for each machine in sequence
      const planEntries = [];
      let currentStartTime = new Date(`${start_date}T${DAY_START}:00:00`);

      for (let i = 0; i < manufacturingOrders.length; i++) {
        const mo = manufacturingOrders[i];
        const duration = mo.estimated_duration_minutes || 0;

        console.log(`\n📍 Step ${i + 1}: ${mo.machine_name} (${duration} min)`);

        // Create plan entry for this machine
        const entry = await this._createPlanEntry(
          jobCardId,
          mo.machine_id,
          currentStartTime,
          duration,
          start_date,
          preferredShift,
          assignOperator ? job.assigned_to : null
        );

        planEntries.push(entry);
        console.log(`   ✓ Planned: ${entry.planned_start_time} → ${entry.planned_end_time}`);

        // Update current start time to next machine's end time
        currentStartTime = new Date(entry.planned_end_time);
      }

      // 6. Update job card estimate end date
      await db.query(
        `UPDATE cnc_job_cards 
         SET estimate_end_date = $1, updated_at = NOW() 
         WHERE id = $2`,
        [estimatedEndDate, jobCardId]
      );

      console.log(`\n✅ Automatic plan generated successfully!`);
      console.log(`   ${planEntries.length} plan entries created`);
      console.log(`   Estimated completion: ${estimatedEndDate}`);

      return {
        success: true,
        jobCardId,
        planEntries,
        estimatedEndDate,
        totalMinutes,
        message: `Generated optimal plan with ${planEntries.length} machine sequences`
      };

    } catch (error) {
      console.error('❌ Error generating automatic plan:', error);
      throw error;
    }
  }

  /**
   * Calculate estimated end date based on manufacturing duration and shift type
   */
  static _calculateEstimatedEndDate(startDate, totalMinutes, shiftType = 'day') {
    const startHour = String(DAY_START).padStart(2, '0');
    let currentDate = new Date(`${startDate}T${startHour}:00:00`);
    if (isNaN(currentDate.getTime())) {
      currentDate = new Date();
      currentDate.setHours(DAY_START, 0, 0, 0);
    }
    let remainingMinutes = totalMinutes || 0;
    if (remainingMinutes <= 0) return currentDate.toISOString();

    // Simulate shift-based scheduling
    while (remainingMinutes > 0) {
      const hour = currentDate.getHours();
      const minuteOfDay = hour * 60 + currentDate.getMinutes();

      if (shiftType === 'day') {
        const dayMinuteStart = DAY_START * 60;
        const dayMinuteEnd = DAY_END * 60;

        if (minuteOfDay < dayMinuteStart) {
          // Before day shift, jump to start
          currentDate.setHours(DAY_START, 0);
        } else if (minuteOfDay < dayMinuteEnd) {
          // During day shift
          const minutesAvailableInShift = dayMinuteEnd - minuteOfDay;
          if (remainingMinutes <= minutesAvailableInShift) {
            currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes);
            remainingMinutes = 0;
          } else {
            // Shift ends, jump to next day
            remainingMinutes -= minutesAvailableInShift;
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(DAY_START, 0);
          }
        } else {
          // After day shift, jump to next day
          currentDate.setDate(currentDate.getDate() + 1);
          currentDate.setHours(DAY_START, 0);
        }
      } else if (shiftType === 'night') {
        const nightMinuteStart = DAY_END * 60;
        const nightMinuteEnd = 24 * 60; // Midnight

        if (minuteOfDay >= nightMinuteStart || minuteOfDay < DAY_START * 60) {
          // During night shift (7 PM - 7 AM)
          const minutesAvailableInShift = (nightMinuteEnd - minuteOfDay) + (DAY_START * 60);
          if (remainingMinutes <= minutesAvailableInShift) {
            currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes);
            remainingMinutes = 0;
          } else {
            remainingMinutes -= minutesAvailableInShift;
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(DAY_END, 0);
          }
        } else {
          // During day shift, skip to night
          currentDate.setHours(DAY_END, 0);
        }
      } else {
        // 'both' shift - continuous 24h operation
        currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes);
        remainingMinutes = 0;
      }
    }

    return currentDate.toISOString();
  }

  /**
   * Create a single plan entry in the planning board
   */
  static async _createPlanEntry(jobCardId, machineId, startTime, durationMinutes, planDate, shiftType, assignedOperator) {
    // Build segments accounting for shift breaks
    const segments = this._buildShiftSegments(startTime, durationMinutes, shiftType);

    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    const result = await db.query(
      `INSERT INTO cnc_plan_entries 
       (job_card_id, machine_id, plan_date, planned_start_time, planned_end_time, 
        assigned_to, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'planned', $7, $8)
       RETURNING *`,
      [
        jobCardId,
        machineId,
        planDate,
        firstSegment.start.toISOString(),
        lastSegment.end.toISOString(),
        assignedOperator || null,
        `Auto-generated plan entry (${durationMinutes} min)`,
        'system'
      ]
    );

    return result.rows[0];
  }

  /**
   * Build shift-aware time segments for a job
   */
  static _buildShiftSegments(startTime, totalMinutes, shiftType = 'day') {
    const segments = [];
    let currentTime = new Date(startTime);
    let remainingMinutes = totalMinutes;
    let iterations = 0;
    const maxIterations = 200;

    while (remainingMinutes > 0 && iterations < maxIterations) {
      iterations++;
      const currentHour = currentTime.getHours();

      if (shiftType === 'day') {
        // Day shift: 7 AM - 7 PM
        if (currentHour < DAY_START) {
          currentTime.setHours(DAY_START, 0);
        } else if (currentHour >= DAY_END) {
          // Jump to next day 7 AM
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime.setHours(DAY_START, 0);
        } else {
          // Within day shift
          const dayEndTime = new Date(currentTime);
          dayEndTime.setHours(DAY_END, 0);
          const minutesUntilDayEnd = Math.round((dayEndTime - currentTime) / 60000);

          if (remainingMinutes <= minutesUntilDayEnd) {
            const endTime = new Date(currentTime);
            endTime.setMinutes(endTime.getMinutes() + remainingMinutes);
            segments.push({ start: new Date(currentTime), end: endTime });
            remainingMinutes = 0;
          } else {
            segments.push({ start: new Date(currentTime), end: new Date(dayEndTime) });
            remainingMinutes -= minutesUntilDayEnd;
            currentTime = new Date(dayEndTime);
            currentTime.setDate(currentTime.getDate() + 1);
            currentTime.setHours(DAY_START, 0);
          }
        }
      } else if (shiftType === 'night') {
        // Night shift: 7 PM - 7 AM
        if (currentHour >= DAY_START && currentHour < DAY_END) {
          currentTime.setHours(DAY_END, 0);
        } else {
          const nightEndTime = new Date(currentTime);
          if (currentHour >= DAY_END) {
            nightEndTime.setDate(nightEndTime.getDate() + 1);
          }
          nightEndTime.setHours(DAY_START, 0);
          const minutesUntilNightEnd = Math.round((nightEndTime - currentTime) / 60000);

          if (remainingMinutes <= minutesUntilNightEnd) {
            const endTime = new Date(currentTime);
            endTime.setMinutes(endTime.getMinutes() + remainingMinutes);
            segments.push({ start: new Date(currentTime), end: endTime });
            remainingMinutes = 0;
          } else {
            segments.push({ start: new Date(currentTime), end: new Date(nightEndTime) });
            remainingMinutes -= minutesUntilNightEnd;
            currentTime = new Date(nightEndTime);
            currentTime.setHours(DAY_END, 0);
          }
        }
      } else {
        // 'both' shift - no break
        const endTime = new Date(currentTime);
        endTime.setMinutes(endTime.getMinutes() + remainingMinutes);
        segments.push({ start: new Date(currentTime), end: endTime });
        remainingMinutes = 0;
      }
    }

    return segments;
  }

  /**
   * Bulk generate plans for all active jobs without plans
   */
  static async generateBulkAutoPlans(options = {}) {
    try {
      console.log('\n📊 Generating bulk automatic plans...\n');

      // Get all active jobs without full plans
      const jobsResult = await db.query(`
        SELECT DISTINCT jc.id, jc.job_name, jc.job_card_number
        FROM cnc_job_cards jc
        LEFT JOIN cnc_plan_entries pe ON jc.id = pe.job_card_id
        WHERE jc.status = 'active'
        GROUP BY jc.id
        HAVING COUNT(pe.id) = 0
        ORDER BY jc.created_at DESC
        LIMIT 50
      `);

      const jobsToSchedule = jobsResult.rows;
      console.log(`Found ${jobsToSchedule.length} unscheduled active jobs\n`);

      const results = {
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const job of jobsToSchedule) {
        try {
          await this.generateAutoPlan(job.id, options);
          results.successful++;
        } catch (error) {
          console.error(`  ✗ Failed for ${job.job_card_number}:`, error.message);
          results.failed++;
          results.errors.push({ jobCard: job.job_card_number, error: error.message });
        }
      }

      console.log(`\n✅ Bulk planning complete: ${results.successful} successful, ${results.failed} failed`);
      return results;

    } catch (error) {
      console.error('❌ Error in bulk planning:', error);
      throw error;
    }
  }
}

module.exports = PlanningEngine;
