const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

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
      query += ` AND pe.plan_date = $${params.length}`;
    } else if (start_date && end_date) {
      params.push(start_date, end_date);
      query += ` AND pe.plan_date BETWEEN $${params.length - 1} AND $${params.length}`;
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

    if (!machine_id || !job_card_id || !plan_date) {
      return res.status(400).json({ error: 'Machine, job card, and plan date are required' });
    }

    // Verify job card exists
    const jobCheck = await db.query('SELECT id, job_card_number FROM cnc_job_cards WHERE id = $1', [job_card_id]);
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // Verify machine exists
    const machineCheck = await db.query('SELECT id FROM cnc_machines WHERE id = $1', [machine_id]);
    if (machineCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    const result = await db.query(
      `INSERT INTO cnc_plan_entries (machine_id, job_card_id, plan_date, planned_start_time, planned_end_time, assigned_to, notes, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [machine_id, job_card_id, plan_date, planned_start_time || null, planned_end_time || null, assigned_to || null, notes || '', sort_order || 0, req.user.id]
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
      [machine_id, plan_date, planned_start_time, planned_end_time, actual_start_time, actual_end_time, assigned_to, notes, status, sort_order, req.params.id]
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

module.exports = router;
