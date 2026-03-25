const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');
const { authenticate, requireAdmin } = require('../middleware/auth');
const PlanningEngine = require('../services/planningEngine');

// ==================== MACHINES (Machine Master) ====================

// Get all machines
router.get('/machines', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM cnc_machines ORDER BY machine_name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching machines:', error);
    res.status(500).json({ error: 'Failed to fetch machines' });
  }
});

// Get single machine
router.get('/machines/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM cnc_machines WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching machine:', error);
    res.status(500).json({ error: 'Failed to fetch machine' });
  }
});

// Create machine (admin only)
router.post('/machines', authenticate, requireAdmin, async (req, res) => {
  try {
    const { machine_name, machine_code, machine_type, description, status } = req.body;
    if (!machine_name || !machine_code) {
      return res.status(400).json({ error: 'Machine name and code are required' });
    }
    const result = await db.query(
      `INSERT INTO cnc_machines (machine_name, machine_code, machine_type, description, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [machine_name, machine_code, machine_type || 'cnc', description || '', status || 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Machine code already exists' });
    console.error('Error creating machine:', error);
    res.status(500).json({ error: 'Failed to create machine' });
  }
});

// Update machine (admin only)
router.put('/machines/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { machine_name, machine_code, machine_type, description, status } = req.body;
    const result = await db.query(
      `UPDATE cnc_machines SET machine_name=$1, machine_code=$2, machine_type=$3, description=$4, status=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [machine_name, machine_code, machine_type, description, status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Machine code already exists' });
    console.error('Error updating machine:', error);
    res.status(500).json({ error: 'Failed to update machine' });
  }
});

// Delete machine (admin only)
router.delete('/machines/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM cnc_machines WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
    res.json({ message: 'Machine deleted' });
  } catch (error) {
    console.error('Error deleting machine:', error);
    res.status(500).json({ error: 'Failed to delete machine' });
  }
});

// ==================== PLAN ENTRIES ====================

// Get plan entries for a date range (default: selected date)
router.get('/entries', authenticate, async (req, res) => {
  try {
    const { date, start_date, end_date, machine_id } = req.query;

    let query = `
      SELECT pe.*, 
        m.machine_name, m.machine_code, m.machine_type,
        jc.job_name, jc.job_card_number, jc.part_number, jc.client_name, jc.priority,
        jc.quantity, jc.manufacturing_type,
        u.name as assigned_to_name
      FROM cnc_plan_entries pe
      LEFT JOIN cnc_machines m ON pe.machine_id = m.id
      LEFT JOIN cnc_job_cards jc ON pe.job_card_id = jc.id
      LEFT JOIN users u ON pe.assigned_to = u.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      params.push(date);
      query += ` AND (pe.plan_date = $${params.length} OR (pe.planned_start_time IS NOT NULL AND pe.planned_end_time IS NOT NULL AND pe.planned_start_time::date <= $${params.length}::date AND pe.planned_end_time::date >= $${params.length}::date))`;
    } else if (start_date && end_date) {
      params.push(start_date, end_date);
      query += ` AND (pe.plan_date BETWEEN $${params.length - 1} AND $${params.length} OR (pe.planned_start_time IS NOT NULL AND pe.planned_end_time IS NOT NULL AND pe.planned_start_time < ($${params.length}::date + interval '1 day') AND pe.planned_end_time >= $${params.length - 1}::date))`;
    }

    if (machine_id) {
      params.push(machine_id);
      query += ` AND pe.machine_id = $${params.length}`;
    }

    query += ` ORDER BY pe.plan_date ASC, m.machine_name ASC, pe.sort_order ASC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching plan entries:', error);
    res.status(500).json({ error: 'Failed to fetch plan entries' });
  }
});

// Create plan entry
router.post('/entries', authenticate, async (req, res) => {
  try {
    const { machine_id, job_card_id, plan_date, planned_start_time, planned_end_time, assigned_to, notes, sort_order } = req.body;

    if (!machine_id || !job_card_id) {
      return res.status(400).json({ error: 'Machine and job card are required' });
    }

    // Auto-derive plan_date from planned_start_time if not provided
    const effectivePlanDate = plan_date || (planned_start_time ? planned_start_time.substring(0, 10) : new Date().toISOString().split('T')[0]);

    // Verify job card exists
    const jobCheck = await db.query('SELECT id, job_card_number FROM cnc_job_cards WHERE id = $1', [job_card_id]);
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // Verify machine exists
    const machineCheck = await db.query('SELECT id, machine_name FROM cnc_machines WHERE id = $1', [machine_id]);
    if (machineCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    // Check for time overlap on same machine (one machine can only run one job at a time)
    if (planned_start_time && planned_end_time) {
      const overlap = await db.query(
        `SELECT pe.id, jc.job_card_number, jc.job_name
         FROM cnc_plan_entries pe
         LEFT JOIN cnc_job_cards jc ON pe.job_card_id = jc.id
         WHERE pe.machine_id = $1
           AND pe.status != 'cancelled'
           AND pe.planned_start_time < $3
           AND pe.planned_end_time > $2`,
        [machine_id, planned_start_time, planned_end_time]
      );
      if (overlap.rows.length > 0) {
        const conflicting = overlap.rows[0];
        return res.status(409).json({
          error: `Time conflict on ${machineCheck.rows[0].machine_name}: overlaps with ${conflicting.job_card_number} (${conflicting.job_name})`
        });
      }
    }

    const result = await db.query(
      `INSERT INTO cnc_plan_entries (machine_id, job_card_id, plan_date, planned_start_time, planned_end_time, assigned_to, notes, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [machine_id, job_card_id, effectivePlanDate, planned_start_time || null, planned_end_time || null, assigned_to || null, notes || '', sort_order || 0, req.user.id]
    );

    // Return with joined data
    const entry = await db.query(
      `SELECT pe.*, 
        m.machine_name, m.machine_code, m.machine_type,
        jc.job_name, jc.job_card_number, jc.part_number, jc.client_name, jc.priority,
        jc.quantity, jc.manufacturing_type,
        u.name as assigned_to_name
      FROM cnc_plan_entries pe
      LEFT JOIN cnc_machines m ON pe.machine_id = m.id
      LEFT JOIN cnc_job_cards jc ON pe.job_card_id = jc.id
      LEFT JOIN users u ON pe.assigned_to = u.id
      WHERE pe.id = $1`,
      [result.rows[0].id]
    );
    res.status(201).json(entry.rows[0]);
  } catch (error) {
    console.error('Error creating plan entry:', error);
    res.status(500).json({ error: 'Failed to create plan entry' });
  }
});

// Create plan entry with shift-based splitting
router.post('/entries/shift-plan', authenticate, async (req, res) => {
  try {
    const { machine_id, job_card_id, planned_start_time, required_hours, shift_type, assigned_to, notes } = req.body;

    if (!machine_id || !job_card_id || !planned_start_time || !required_hours || !shift_type) {
      return res.status(400).json({ error: 'Machine, job card, start time, required hours, and shift type are required' });
    }

    const hours = parseFloat(required_hours);
    if (isNaN(hours) || hours <= 0 || hours > 720) {
      return res.status(400).json({ error: 'Required hours must be between 0 and 720' });
    }

    // Verify job card and machine exist
    const [jobCheck, machineCheck] = await Promise.all([
      db.query('SELECT id FROM cnc_job_cards WHERE id = $1', [job_card_id]),
      db.query('SELECT id FROM cnc_machines WHERE id = $1', [machine_id]),
    ]);
    if (jobCheck.rows.length === 0) return res.status(404).json({ error: 'Job card not found' });
    if (machineCheck.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });

    // Helper: format Date as local ISO string without timezone suffix
    function fmtDT(d) {
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    // Helper: build time segments based on shift type
    // Day shift: 7:00 - 19:00, Night shift: 19:00 - 07:00 (next day)
    function buildSegments(startTime, totalMinutes, shiftType) {
      const segments = [];
      let remaining = totalMinutes;
      let cursor = new Date(startTime);

      while (remaining > 0) {
        const h = cursor.getHours();
        const m = cursor.getMinutes();
        let segStart, segEnd, availableMinutes;

        if (shiftType === 'both') {
          // Continuous — use all remaining in one segment
          segStart = new Date(cursor);
          segEnd = new Date(cursor.getTime() + remaining * 60000);
          segments.push({ start: segStart, end: segEnd });
          remaining = 0;
        } else if (shiftType === 'day') {
          // Day shift: 7:00 - 19:00
          if (h >= 7 && h < 19) {
            // We're in day shift window
            segStart = new Date(cursor);
            const dayEnd = new Date(cursor);
            dayEnd.setHours(19, 0, 0, 0);
            availableMinutes = (dayEnd - cursor) / 60000;
            const useMinutes = Math.min(remaining, availableMinutes);
            segEnd = new Date(cursor.getTime() + useMinutes * 60000);
            segments.push({ start: segStart, end: segEnd });
            remaining -= useMinutes;
            // Jump to next day 7am
            cursor = new Date(cursor);
            cursor.setDate(cursor.getDate() + 1);
            cursor.setHours(7, 0, 0, 0);
          } else {
            // Outside day shift — jump to next 7am
            if (h >= 19) {
              cursor.setDate(cursor.getDate() + 1);
            }
            cursor.setHours(7, 0, 0, 0);
          }
        } else if (shiftType === 'night') {
          // Night shift: 19:00 - 07:00 (next day)
          if (h >= 19 || h < 7) {
            // We're in night shift window
            segStart = new Date(cursor);
            const nightEnd = new Date(cursor);
            if (h >= 19) {
              nightEnd.setDate(nightEnd.getDate() + 1);
            }
            nightEnd.setHours(7, 0, 0, 0);
            availableMinutes = (nightEnd - cursor) / 60000;
            const useMinutes = Math.min(remaining, availableMinutes);
            segEnd = new Date(cursor.getTime() + useMinutes * 60000);
            segments.push({ start: segStart, end: segEnd });
            remaining -= useMinutes;
            // Jump to next night start 19:00
            cursor = new Date(nightEnd);
            cursor.setHours(19, 0, 0, 0);
          } else {
            // Outside night shift — jump to 19:00 today
            cursor.setHours(19, 0, 0, 0);
          }
        }
      }
      return segments;
    }

    const totalMinutes = hours * 60;
    const segments = buildSegments(new Date(planned_start_time), totalMinutes, shift_type);

    // Create entries for each segment
    const createdIds = [];
    for (const seg of segments) {
      const startStr = fmtDT(seg.start);
      const endStr = fmtDT(seg.end);
      const planDate = startStr.substring(0, 10);
      const result = await db.query(
        `INSERT INTO cnc_plan_entries (machine_id, job_card_id, plan_date, planned_start_time, planned_end_time, assigned_to, notes, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8) RETURNING id`,
        [machine_id, job_card_id, planDate, startStr, endStr, assigned_to || null, notes || '', req.user.id]
      );
      createdIds.push(result.rows[0].id);
    }

    // Return all created entries with joined data
    const entriesResult = await db.query(
      `SELECT pe.*, 
        m.machine_name, m.machine_code, m.machine_type,
        jc.job_name, jc.job_card_number, jc.part_number, jc.client_name, jc.priority,
        jc.quantity, jc.manufacturing_type,
        u.name as assigned_to_name
      FROM cnc_plan_entries pe
      LEFT JOIN cnc_machines m ON pe.machine_id = m.id
      LEFT JOIN cnc_job_cards jc ON pe.job_card_id = jc.id
      LEFT JOIN users u ON pe.assigned_to = u.id
      WHERE pe.id = ANY($1)
      ORDER BY pe.planned_start_time ASC`,
      [createdIds]
    );

    res.status(201).json({ entries: entriesResult.rows, count: createdIds.length });
  } catch (error) {
    console.error('Error creating shift-planned entries:', error);
    res.status(500).json({ error: 'Failed to create plan entries' });
  }
});

// Batch update sort order (for drag-drop reordering — must be before /:id)
router.put('/entries/reorder/batch', authenticate, async (req, res) => {
  try {
    const { entries } = req.body; // [{ id, machine_id, plan_date, sort_order }]
    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries array is required' });
    }

    for (const entry of entries) {
      await db.query(
        `UPDATE cnc_plan_entries SET machine_id = $1, plan_date = $2, sort_order = $3, updated_at = NOW() WHERE id = $4`,
        [entry.machine_id, entry.plan_date, entry.sort_order, entry.id]
      );
    }

    res.json({ message: 'Reorder successful', count: entries.length });
  } catch (error) {
    console.error('Error reordering entries:', error);
    res.status(500).json({ error: 'Failed to reorder entries' });
  }
});

// Update plan entry (including drag-drop reschedule)
router.put('/entries/:id', authenticate, async (req, res) => {
  try {
    const { machine_id, plan_date, planned_start_time, planned_end_time, actual_start_time, actual_end_time, assigned_to, notes, status, sort_order } = req.body;

    // Auto-derive plan_date from planned_start_time if start is being updated
    const effectivePlanDate = plan_date || (planned_start_time ? planned_start_time.substring(0, 10) : undefined);

    // Check for time overlap on same machine (exclude current entry)
    if (planned_start_time && planned_end_time) {
      // Get the machine_id for this entry (use provided or existing)
      const targetMachine = machine_id || (await db.query('SELECT machine_id FROM cnc_plan_entries WHERE id = $1', [req.params.id])).rows[0]?.machine_id;
      if (targetMachine) {
        const overlap = await db.query(
          `SELECT pe.id, jc.job_card_number, jc.job_name, m.machine_name
           FROM cnc_plan_entries pe
           LEFT JOIN cnc_job_cards jc ON pe.job_card_id = jc.id
           LEFT JOIN cnc_machines m ON pe.machine_id = m.id
           WHERE pe.machine_id = $1
             AND pe.id != $4
             AND pe.status != 'cancelled'
             AND pe.planned_start_time < $3
             AND pe.planned_end_time > $2`,
          [targetMachine, planned_start_time, planned_end_time, req.params.id]
        );
        if (overlap.rows.length > 0) {
          const c = overlap.rows[0];
          return res.status(409).json({
            error: `Time conflict on ${c.machine_name}: overlaps with ${c.job_card_number} (${c.job_name})`
          });
        }
      }
    }

    const result = await db.query(
      `UPDATE cnc_plan_entries SET
        machine_id = COALESCE($1, machine_id),
        plan_date = COALESCE($2, plan_date),
        planned_start_time = COALESCE($3, planned_start_time),
        planned_end_time = COALESCE($4, planned_end_time),
        actual_start_time = COALESCE($5, actual_start_time),
        actual_end_time = COALESCE($6, actual_end_time),
        assigned_to = COALESCE($7, assigned_to),
        notes = COALESCE($8, notes),
        status = COALESCE($9, status),
        sort_order = COALESCE($10, sort_order),
        updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [machine_id, effectivePlanDate, planned_start_time, planned_end_time, actual_start_time, actual_end_time, assigned_to, notes, status, sort_order, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Plan entry not found' });

    // Return with joined data
    const entry = await db.query(
      `SELECT pe.*, 
        m.machine_name, m.machine_code, m.machine_type,
        jc.job_name, jc.job_card_number, jc.part_number, jc.client_name, jc.priority,
        jc.quantity, jc.manufacturing_type,
        u.name as assigned_to_name
      FROM cnc_plan_entries pe
      LEFT JOIN cnc_machines m ON pe.machine_id = m.id
      LEFT JOIN cnc_job_cards jc ON pe.job_card_id = jc.id
      LEFT JOIN users u ON pe.assigned_to = u.id
      WHERE pe.id = $1`,
      [result.rows[0].id]
    );
    res.json(entry.rows[0]);
  } catch (error) {
    console.error('Error updating plan entry:', error);
    res.status(500).json({ error: 'Failed to update plan entry' });
  }
});

// Delete plan entry
router.delete('/entries/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM cnc_plan_entries WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Plan entry not found' });
    res.json({ message: 'Plan entry deleted' });
  } catch (error) {
    console.error('Error deleting plan entry:', error);
    res.status(500).json({ error: 'Failed to delete plan entry' });
  }
});

// ==================== SEARCH JOB CARDS ====================

// Search job cards by job_card_number for adding to plans
router.get('/search-jobs', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json([]);

    const result = await db.query(
      `SELECT id, job_name, job_card_number, part_number, client_name, priority, quantity, manufacturing_type, machine_name
       FROM cnc_job_cards
       WHERE is_active = true AND (
         job_card_number ILIKE $1 OR job_name ILIKE $1 OR part_number ILIKE $1 OR client_name ILIKE $1
       )
       ORDER BY job_card_number ASC
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching jobs:', error);
    res.status(500).json({ error: 'Failed to search jobs' });
  }
});

// Get last completed/planned job for a machine to suggest next start time
router.get('/machine-last-job/:machineId', authenticate, async (req, res) => {
  try {
    const { machineId } = req.params;
    if (!machineId) return res.status(400).json({ error: 'Machine ID required' });

    const result = await db.query(
      `SELECT 
         pe.job_card_id,
         pe.planned_start_time,
         pe.planned_end_time,
         jc.job_card_number,
         jc.job_name
       FROM cnc_plan_entries pe
       JOIN cnc_job_cards jc ON pe.job_card_id = jc.id
       WHERE pe.machine_id = $1 
         AND pe.planned_end_time IS NOT NULL
         AND pe.status IN ('completed', 'in_progress', 'planned')
       ORDER BY pe.planned_end_time DESC
       LIMIT 1`,
      [machineId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching last job for machine:', error);
    res.status(500).json({ error: 'Failed to fetch last job' });
  }
});

// Get planning dashboard stats
router.get('/stats', authenticate, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const [totalEntries, machineCount, completedEntries, inProgressEntries] = await Promise.all([
      db.query('SELECT COUNT(*) FROM cnc_plan_entries WHERE plan_date = $1', [targetDate]),
      db.query('SELECT COUNT(*) FROM cnc_machines WHERE status = $1', ['active']),
      db.query("SELECT COUNT(*) FROM cnc_plan_entries WHERE plan_date = $1 AND status = 'completed'", [targetDate]),
      db.query("SELECT COUNT(*) FROM cnc_plan_entries WHERE plan_date = $1 AND status = 'in_progress'", [targetDate]),
    ]);

    res.json({
      total_planned: parseInt(totalEntries.rows[0].count),
      active_machines: parseInt(machineCount.rows[0].count),
      completed: parseInt(completedEntries.rows[0].count),
      in_progress: parseInt(inProgressEntries.rows[0].count),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get users for assignment dropdown
router.get('/users', authenticate, async (req, res) => {
  try {
    const result = await db.query("SELECT id, name, email, role FROM users WHERE role != 'guest' ORDER BY name ASC");
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ==================== PRODUCTION REPORT PDF ====================

const STATUS_LABELS = { planned: 'Planned', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_COLORS_RGB = { planned: [99, 102, 241], in_progress: [245, 158, 11], completed: [16, 185, 129], cancelled: [239, 68, 68] };

// Same palette as Gantt chart — same job_card_id always gets the same colour
const JOB_COLORS_PDF = [
  { r: 99,  g: 102, b: 241 }, // indigo
  { r: 245, g: 158, b: 11  }, // amber
  { r: 16,  g: 185, b: 129 }, // emerald
  { r: 239, g: 68,  b: 68  }, // red
  { r: 59,  g: 130, b: 246 }, // blue
  { r: 139, g: 92,  b: 246 }, // violet
  { r: 236, g: 72,  b: 153 }, // pink
  { r: 20,  g: 184, b: 166 }, // teal
  { r: 249, g: 115, b: 22  }, // orange
  { r: 6,   g: 182, b: 212 }, // cyan
  { r: 132, g: 204, b: 22  }, // lime
  { r: 168, g: 85,  b: 247 }, // purple
  { r: 225, g: 29,  b: 72  }, // rose
  { r: 14,  g: 165, b: 233 }, // sky
  { r: 217, g: 70,  b: 239 }, // fuchsia
  { r: 34,  g: 197, b: 94  }, // green
];

router.get('/production-report-pdf', authenticate, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date required' });

    // Fetch machines
    const machinesResult = await db.query(`SELECT * FROM cnc_machines WHERE status = 'active' ORDER BY machine_name ASC`);
    const machines = machinesResult.rows;

    // Fetch entries (same overlap logic)
    const entriesResult = await db.query(`
      SELECT pe.*, 
        m.machine_name, m.machine_code, m.machine_type,
        jc.job_name, jc.job_card_number, jc.part_number, jc.client_name, jc.priority,
        u.name as assigned_to_name
      FROM cnc_plan_entries pe
      LEFT JOIN cnc_machines m ON pe.machine_id = m.id
      LEFT JOIN cnc_job_cards jc ON pe.job_card_id = jc.id
      LEFT JOIN users u ON pe.assigned_to = u.id
      WHERE (pe.plan_date BETWEEN $1 AND $2 
        OR (pe.planned_start_time IS NOT NULL AND pe.planned_end_time IS NOT NULL 
            AND pe.planned_start_time < ($2::date + interval '1 day') 
            AND pe.planned_end_time >= $1::date))
      ORDER BY pe.plan_date ASC, m.machine_name ASC, pe.sort_order ASC
    `, [start_date, end_date]);
    const entries = entriesResult.rows;

    // Build job-card colour map (same job_card_id → same colour)
    const jobColorMap = {};
    const uniqueJobIds = [...new Set(entries.map(e => e.job_card_id).filter(Boolean))];
    uniqueJobIds.forEach((id, i) => {
      jobColorMap[id] = JOB_COLORS_PDF[i % JOB_COLORS_PDF.length];
    });

    // Build date list
    const dates = [];
    const d = new Date(start_date + 'T00:00:00');
    const endD = new Date(end_date + 'T00:00:00');
    while (d <= endD) {
      dates.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }

    // Create PDF (A4 landscape)
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    const filename = `Production-Report-${start_date}-to-${end_date}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const leftM = 30;
    const rightM = pageW - 30;
    const contentW = rightM - leftM;

    // ── Column definitions (proportional) ──
    const COL_DEFS = [
      { label: '#',              weight: 2.5 },
      { label: 'Job Card',      weight: 10  },
      { label: 'Job Name',      weight: 10  },
      { label: 'Part No.',      weight: 6   },
      { label: 'Client',        weight: 8   },
      { label: 'Shift',         weight: 4   },
      { label: 'Planned Start', weight: 8   },
      { label: 'Planned End',   weight: 8   },
      { label: 'Duration',      weight: 5.5 },
      { label: 'Actual Start',  weight: 8   },
      { label: 'Actual End',    weight: 8   },
      { label: 'Status',        weight: 7   },
      { label: 'Operator',      weight: 7.5 },
    ];
    const totalWeight = COL_DEFS.reduce((s, c) => s + c.weight, 0);
    const COLS = COL_DEFS.map(c => ({ ...c, w: (c.weight / totalWeight) * contentW }));

    // ── Helpers ──
    function formatDT(ts) {
      if (!ts) return '-';
      const dt = new Date(ts);
      if (isNaN(dt.getTime())) return '-';
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[dt.getMonth()]} ${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    }

    function formatDateFull(dateStr) {
      const dt = new Date(dateStr + 'T00:00:00');
      return dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function getShift(ts) {
      if (!ts) return '-';
      const dt = new Date(ts);
      if (isNaN(dt.getTime())) return '-';
      const h = dt.getHours();
      return h >= 7 && h < 19 ? 'Day' : 'Night';
    }

    function calcDuration(s, e) {
      if (!s || !e) return '-';
      const st = new Date(s), en = new Date(e);
      if (isNaN(st.getTime()) || isNaN(en.getTime())) return '-';
      const mins = Math.round((en - st) / 60000);
      if (mins <= 0) return '-';
      const days = Math.floor(mins / 1440);
      const h = Math.floor((mins % 1440) / 60);
      const m = mins % 60;
      if (days > 0) return `${days}d ${h}h`;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    function getEntriesForDate(dateStr) {
      return entries.filter(entry => {
        const planDate = entry.plan_date ? new Date(entry.plan_date).toISOString().split('T')[0] : null;
        if (planDate === dateStr) return true;
        const startDT = entry.planned_start_time ? new Date(entry.planned_start_time) : null;
        const endDT = entry.planned_end_time ? new Date(entry.planned_end_time) : null;
        if (startDT && endDT) {
          const dayStart = new Date(dateStr + 'T00:00:00');
          const dayEnd = new Date(dateStr + 'T23:59:59');
          return startDT <= dayEnd && endDT >= dayStart;
        }
        return false;
      });
    }

    function truncText(text, maxW, fontSize) {
      if (!text) return '-';
      doc.fontSize(fontSize);
      if (doc.widthOfString(text) <= maxW) return text;
      while (text.length > 1 && doc.widthOfString(text + '..') > maxW) text = text.slice(0, -1);
      return text + '..';
    }

    // Safe text helper — resets doc.y to prevent PDFKit auto-pagination
    function safeText(str, x, y, opts) {
      doc.y = 0;
      doc.text(str, x, y, { ...opts, lineBreak: false });
    }

    // ── Draw bordered table cell ──
    function drawCell(x, y, w, h, text, opts = {}) {
      const { fontSize = 7, bold = false, align = 'left', bg = '#ffffff', textColor = '#1e293b', padding = 3, noTrunc = false } = opts;

      doc.rect(x, y, w, h).fill(bg);
      doc.strokeColor('#e2e8f0').lineWidth(0.5);
      doc.rect(x, y, w, h).stroke();

      doc.fillColor(textColor).fontSize(fontSize).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      const displayText = noTrunc ? String(text || '-') : truncText(String(text || '-'), w - padding * 2, fontSize);
      safeText(displayText, x + padding, y + (h - fontSize) / 2, {
        width: w - padding * 2,
        height: h,
        align,
      });
    }

    // ── Page header ──
    function drawPageHeader(dateStr) {
      doc.rect(0, 0, pageW, 50).fill('#ffffff');
      doc.strokeColor('#e2e8f0').lineWidth(0.5).rect(0, 0, pageW, 50).stroke();

      doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold');
      safeText('DAILY PRODUCTION SHEET', leftM, 10, { width: 250 });
      doc.fillColor('#64748b').fontSize(8).font('Helvetica');
      safeText('TaskFlow CNC Production Planning', leftM, 28, {});

      doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold');
      safeText(formatDateFull(dateStr), 0, 14, { width: pageW, align: 'center' });

      doc.fillColor('#64748b').fontSize(7).font('Helvetica');
      safeText(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, rightM - 140, 12, { width: 140, align: 'right' });
      safeText(`Report Date: ${dateStr}`, rightM - 140, 23, { width: 140, align: 'right' });

      doc.rect(0, 50, pageW, 1).fill('#cbd5e1');

      doc.fillColor('#000000');
      doc.y = 0;
      return 60;
    }

    // ── Machine section header ──
    function drawMachineHeader(y, machine, jobCount) {
      doc.rect(leftM, y, contentW, 18).fill('#ffffff');
      doc.strokeColor('#cbd5e1').lineWidth(0.5).rect(leftM, y, contentW, 18).stroke();

      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold');
      safeText(machine.machine_name, leftM + 8, y + 4, { width: contentW / 2 });
      doc.fillColor('#475569').fontSize(7).font('Helvetica');
      safeText(`Code: ${machine.machine_code}  |  Type: ${machine.machine_type}  |  ${jobCount} job${jobCount !== 1 ? 's' : ''}`,
        leftM + contentW / 2, y + 5, { width: contentW / 2 - 8, align: 'right' });

      doc.fillColor('#000000');
      doc.y = 0;
      return y + 20;
    }

    // ── Table header row ──
    function drawTableHeader(y) {
      const rowH = 16;
      let x = leftM;
      COLS.forEach((col, idx) => {
        drawCell(x, y, col.w, rowH, col.label.toUpperCase(), {
          fontSize: 6.5,
          bold: true,
          bg: '#ffffff',
          textColor: '#1e293b',
          align: 'center',
          noTrunc: idx === 1,  // Don't truncate Job Card header
        });
        x += col.w;
      });
      return y + rowH;
    }

    // ── Table data row ──
    function drawEntryRow(entry, idx, y) {
      const rowH = 15;
      const jc = jobColorMap[entry.job_card_id] || JOB_COLORS_PDF[0];
      // Use pure white for all rows to match screen view
      const bg = '#ffffff';

      const values = [
        String(idx + 1),
        entry.job_card_number || '-',
        entry.job_name || '-',
        entry.part_number || '-',
        entry.client_name || '-',
        getShift(entry.planned_start_time),
        formatDT(entry.planned_start_time),
        formatDT(entry.planned_end_time),
        calcDuration(entry.planned_start_time, entry.planned_end_time),
        formatDT(entry.actual_start_time),
        formatDT(entry.actual_end_time),
        STATUS_LABELS[entry.status] || entry.status,
        entry.assigned_to_name || '-',
      ];

      let x = leftM;

      // Draw all cells with borders
      values.forEach((val, i) => {
        let cellBg = bg;
        let cellTextColor = '#1e293b';
        let cellAlign = 'left';

        // Job Card column (i === 1): white background with dark text to match screen
        if (i === 1) {
          cellBg = '#ffffff';
          cellTextColor = '#1e293b';
        }

        // Column-specific styling
        if (i === 0) cellAlign = 'center';                   // #
        if (i === 5) cellAlign = 'center';                   // Shift
        if (i === 8) cellAlign = 'center';                   // Duration
        if (i === 11) {                                      // Status
          cellAlign = 'center';
          const sc = STATUS_COLORS_RGB[entry.status];
          if (sc) cellTextColor = `rgb(${sc[0]},${sc[1]},${sc[2]})`;
        }

        drawCell(x, y, COLS[i].w, rowH, val, {
          fontSize: 7,
          bg: cellBg,
          textColor: cellTextColor,
          align: cellAlign,
          noTrunc: i === 1,  // Don't truncate Job Card column
        });
        x += COLS[i].w;
      });

      // Job-card colour accent on left edge
      doc.strokeColor('#e2e8f0').lineWidth(0.5);
      doc.rect(leftM, y, 2.5, rowH).stroke();

      return y + rowH;
    }

    // ── Summary box ──
    function drawSummary(y, dayEntries, machineCount) {
      const boxH = 28;
      y += 6;
      doc.rect(leftM, y, contentW, boxH).fill('#ffffff');
      doc.strokeColor('#e2e8f0').lineWidth(0.5).rect(leftM, y, contentW, boxH).stroke();

      const planned = dayEntries.filter(e => e.status === 'planned').length;
      const inProg = dayEntries.filter(e => e.status === 'in_progress').length;
      const completed = dayEntries.filter(e => e.status === 'completed').length;
      const cancelled = dayEntries.filter(e => e.status === 'cancelled').length;

      const items = [
        { label: 'Total Jobs', value: dayEntries.length, color: '#1e293b' },
        { label: 'Machines', value: machineCount, color: '#1e293b' },
        { label: 'Planned', value: planned, color: 'rgb(99,102,241)' },
        { label: 'In Progress', value: inProg, color: 'rgb(245,158,11)' },
        { label: 'Completed', value: completed, color: 'rgb(16,185,129)' },
        { label: 'Cancelled', value: cancelled, color: 'rgb(239,68,68)' },
      ];

      const itemW = contentW / items.length;
      items.forEach((item, i) => {
        const ix = leftM + i * itemW;
        doc.fillColor(item.color).fontSize(12).font('Helvetica-Bold');
        safeText(String(item.value), ix, y + 4, { width: itemW, align: 'center' });
        doc.fillColor('#64748b').fontSize(6).font('Helvetica');
        safeText(item.label.toUpperCase(), ix, y + 18, { width: itemW, align: 'center' });
      });

      // Vertical dividers
      doc.strokeColor('#cbd5e1').lineWidth(0.3);
      for (let i = 1; i < items.length; i++) {
        const dx = leftM + i * itemW;
        doc.moveTo(dx, y + 4).lineTo(dx, y + boxH - 4).stroke();
      }

      doc.fillColor('#000000');
      return y + boxH + 4;
    }

    // ── Signature block ──
    function drawSignatures(y) {
      const sigBlockH = 75;
      const sigY = Math.max(y + 10, pageH - 20 - sigBlockH);

      doc.strokeColor('#e2e8f0').lineWidth(0.5)
        .moveTo(leftM, sigY).lineTo(rightM, sigY).stroke();

      doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold');
      safeText('APPROVALS', leftM, sigY + 3, { width: contentW, align: 'center' });

      const sigStartY = sigY + 14;
      const sigW = (contentW - 40) / 3;
      const roles = ['Workshop Technician', 'Workshop Engineer', 'Workshop Manager'];

      roles.forEach((role, i) => {
        const sx = leftM + i * (sigW + 20);

        doc.rect(sx, sigStartY, sigW, 50).fill('#fafbfc');
        doc.strokeColor('#cbd5e1').lineWidth(0.5).rect(sx, sigStartY, sigW, 50).stroke();

        doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica-Bold');
        safeText(role, sx + 4, sigStartY + 3, { width: sigW - 8, align: 'center' });

        doc.strokeColor('#1e293b').lineWidth(0.8)
          .moveTo(sx + 15, sigStartY + 28).lineTo(sx + sigW - 15, sigStartY + 28).stroke();

        doc.fillColor('#94a3b8').fontSize(5.5).font('Helvetica');
        safeText('Signature', sx + 15, sigStartY + 30, { width: sigW - 30, align: 'center' });

        doc.fillColor('#64748b').fontSize(6).font('Helvetica');
        safeText('Name: ..............................', sx + 8, sigStartY + 37, {});
        safeText('Date: ................................', sx + 8, sigStartY + 44, {});
      });

      doc.fillColor('#000000');
      doc.y = 0;
    }

    // ═══════════ Generate pages ═══════════
    // Only include dates that have entries
    const activeDates = dates.filter(dateStr => getEntriesForDate(dateStr).length > 0);
    let pageCount = 0;

    // Reserved space at bottom: signatures(~75) + summary(~38) + padding
    const bottomReserve = 122;

    activeDates.forEach((dateStr) => {
      if (pageCount > 0) doc.addPage();
      pageCount++;

      let y = drawPageHeader(dateStr);
      const dayEntries = getEntriesForDate(dateStr);
      const activeMachines = machines.filter(m => dayEntries.some(e => e.machine_id === m.id));
      activeMachines.forEach(machine => {
          const machineEntries = dayEntries
            .filter(e => e.machine_id === machine.id)
            .sort((a, b) => {
              const at = a.planned_start_time ? new Date(a.planned_start_time).getTime() : 0;
              const bt = b.planned_start_time ? new Date(b.planned_start_time).getTime() : 0;
              return at - bt;
            });

          // Check if we need a new page (machine header + table header + at least 1 row)
          const minNeeded = 20 + 16 + 15;
          if (y + minNeeded > pageH - bottomReserve) {
            doc.addPage();
            y = drawPageHeader(dateStr);
          }

          y = drawMachineHeader(y, machine, machineEntries.length);
          y = drawTableHeader(y);

          machineEntries.forEach((entry, idx) => {
            // Check row overflow
            if (y + 15 > pageH - bottomReserve) {
              doc.addPage();
              y = drawPageHeader(dateStr);
              y = drawMachineHeader(y, machine, machineEntries.length);
              y = drawTableHeader(y);
            }
            y = drawEntryRow(entry, idx, y);
          });

          y += 8;
        });

      // Summary + Signatures + Footer all on same page
      // Check if summary + signatures fit
      if (y + 38 + 75 > pageH - bottomReserve) {
        doc.addPage();
        y = drawPageHeader(dateStr);
      }
      y = drawSummary(y, dayEntries, activeMachines.length);
      drawSignatures(y);
    });

    if (activeDates.length === 0) {
      let y = drawPageHeader(start_date);
      doc.fillColor('#94a3b8').fontSize(11).font('Helvetica');
      safeText('No data found for selected date range', leftM, y + 40, { width: contentW, align: 'center' });
    }

    doc.end();
  } catch (error) {
    console.error('Error generating production report PDF:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== AUTOMATED INTELLIGENT PLANNING ====================

/**
 * Generate automatic intelligent plan for a single job card
 * Takes manufacturing orders, calculates optimal schedule, loads into planning board
 */
router.post('/auto-plan/job/:jobCardId', authenticate, async (req, res) => {
  try {
    const { jobCardId } = req.params;
    const {
      start_date = new Date().toISOString().split('T')[0],
      preferred_shift = 'day', // 'day', 'night', 'both'
      assign_operator = true
    } = req.body;

    console.log(`\n📊 AUTO-PLAN REQUEST for job: ${jobCardId}`);
    console.log(`   User: ${req.user.id}`);

    // Verify job card exists and has manufacturing orders
    const jobCheck = await db.query(
      'SELECT id, job_name FROM cnc_job_cards WHERE id = $1',
      [jobCardId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const orderCheck = await db.query(
      'SELECT COUNT(*) as count FROM manufacturing_orders WHERE job_card_id = $1 AND status != \'skipped\'',
      [jobCardId]
    );

    if (orderCheck.rows[0].count === 0) {
      return res.status(400).json({ 
        error: 'No manufacturing orders found. Please define manufacturing steps first.' 
      });
    }

    // Generate the plan
    const result = await PlanningEngine.generateAutoPlan(jobCardId, {
      start_date,
      preferredShift: preferred_shift,
      assignOperator: assign_operator
    });

    res.json(result);

  } catch (error) {
    console.error('Error in auto-plan endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate automatic plans for all unscheduled active jobs
 */
router.post('/auto-plan/bulk', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      preferred_shift = 'day',
      assign_operator = true
    } = req.body;

    console.log(`\n📊 BULK AUTO-PLAN REQUEST by admin: ${req.user.id}\n`);

    const result = await PlanningEngine.generateBulkAutoPlans({
      preferredShift: preferred_shift,
      assignOperator: assign_operator
    });

    res.json({
      success: true,
      ...result,
      processedJobs: result.successful,
      message: `Bulk auto-planning complete: ${result.successful} successful, ${result.failed} failed`
    });

  } catch (error) {
    console.error('Error in bulk auto-plan endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get auto-plan recommendations without applying them
 * (Preview what the automatic planner would do)
 */
router.get('/auto-plan/preview/:jobCardId', authenticate, async (req, res) => {
  try {
    const { jobCardId } = req.params;
    const {
      start_date = new Date().toISOString().split('T')[0],
      preferred_shift = 'day'
    } = req.query;

    const jobResult = await db.query(
      'SELECT * FROM cnc_job_cards WHERE id = $1',
      [jobCardId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const job = jobResult.rows[0];

    // Get manufacturing orders
    const ordersResult = await db.query(
      `SELECT mo.*, m.machine_name, m.machine_code
       FROM manufacturing_orders mo
       LEFT JOIN cnc_machines m ON mo.machine_id = m.id
       WHERE mo.job_card_id = $1 AND mo.status != 'skipped'
       ORDER BY mo.order_sequence ASC`,
      [jobCardId]
    );

    const orders = ordersResult.rows;
    const totalMinutes = orders.reduce((sum, mo) => sum + (mo.estimated_duration_minutes || 0), 0);
    
    let estimatedEndDate = null;
    let planSegments = [];
    
    if (totalMinutes > 0) {
      estimatedEndDate = PlanningEngine._calculateEstimatedEndDate(start_date, totalMinutes, preferred_shift);
      planSegments = PlanningEngine._buildShiftSegments(
        new Date(`${start_date}T07:00:00`), totalMinutes, preferred_shift
      );
    }

    res.json({
      jobCard: {
        id: job.id,
        job_name: job.job_name,
        job_card_number: job.job_card_number
      },
      manufacturingOrders: orders.map(o => ({
        order_sequence: o.order_sequence,
        machine_name: o.machine_name,
        machine_code: o.machine_code,
        estimated_duration_minutes: o.estimated_duration_minutes
      })),
      totalMinutes,
      estimatedEndDate,
      planSegments,
      startDate: start_date,
      preferredShift: preferred_shift
    });

  } catch (error) {
    console.error('Error getting auto-plan preview:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clear existing plan entries for a job (before regenerating)
 */
router.delete('/auto-plan/clear/:jobCardId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { jobCardId } = req.params;

    const result = await db.query(
      'DELETE FROM cnc_plan_entries WHERE job_card_id = $1 RETURNING id',
      [jobCardId]
    );

    res.json({
      success: true,
      deletedEntries: result.rows.length,
      message: `Deleted ${result.rows.length} plan entries for job card`
    });

  } catch (error) {
    console.error('Error clearing plan entries:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
