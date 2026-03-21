const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');
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
    const machineCheck = await db.query('SELECT id FROM cnc_machines WHERE id = $1', [machine_id]);
    if (machineCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
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
      { label: 'Job Card',      weight: 6.5 },
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
      return h >= 6 && h < 18 ? 'Day' : 'Night';
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

    // ── Draw bordered table cell ──
    function drawCell(x, y, w, h, text, opts = {}) {
      const { fontSize = 7, bold = false, align = 'left', bg = null, textColor = '#1e293b', padding = 3 } = opts;

      // Background
      if (bg) doc.rect(x, y, w, h).fill(bg);

      // Borders
      doc.strokeColor('#cbd5e1').lineWidth(0.5);
      doc.rect(x, y, w, h).stroke();

      // Text
      doc.fillColor(textColor).fontSize(fontSize).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      const displayText = truncText(String(text || '-'), w - padding * 2, fontSize);
      doc.text(displayText, x + padding, y + (h - fontSize) / 2, {
        width: w - padding * 2,
        height: h,
        lineBreak: false,
        align,
      });
    }

    // ── Page header ──
    function drawPageHeader(dateStr) {
      // Top bar
      doc.rect(0, 0, pageW, 50).fill('#1e293b');

      // Title left
      doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold')
        .text('DAILY PRODUCTION SHEET', leftM, 10, { width: 250 });
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
        .text('TaskFlow CNC Production Planning', leftM, 28);

      // Date center
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
        .text(formatDateFull(dateStr), 0, 14, { width: pageW, align: 'center' });

      // Info right
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
        .text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, rightM - 140, 12, { width: 140, align: 'right' })
        .text(`Report Date: ${dateStr}`, rightM - 140, 23, { width: 140, align: 'right' });

      // Thin accent line
      doc.rect(0, 50, pageW, 2).fill('#6366f1');

      doc.fillColor('#000000');
      return 60;
    }

    // ── Machine section header ──
    function drawMachineHeader(y, machine, jobCount) {
      doc.rect(leftM, y, contentW, 18).fill('#e0e7ff');
      doc.strokeColor('#a5b4fc').lineWidth(0.5).rect(leftM, y, contentW, 18).stroke();

      doc.fillColor('#312e81').fontSize(9).font('Helvetica-Bold')
        .text(`${machine.machine_name}`, leftM + 8, y + 4, { width: contentW / 2 });
      doc.fillColor('#4338ca').fontSize(7).font('Helvetica')
        .text(`Code: ${machine.machine_code}  |  Type: ${machine.machine_type}  |  ${jobCount} job${jobCount !== 1 ? 's' : ''}`,
          leftM + contentW / 2, y + 5, { width: contentW / 2 - 8, align: 'right' });

      doc.fillColor('#000000');
      return y + 20;
    }

    // ── Table header row ──
    function drawTableHeader(y) {
      const rowH = 16;
      let x = leftM;
      COLS.forEach(col => {
        drawCell(x, y, col.w, rowH, col.label.toUpperCase(), {
          fontSize: 6.5,
          bold: true,
          bg: '#334155',
          textColor: '#ffffff',
          align: 'center',
        });
        x += col.w;
      });
      return y + rowH;
    }

    // ── Table data row ──
    function drawEntryRow(entry, idx, y) {
      const rowH = 15;
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

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
        });
        x += COLS[i].w;
      });

      // Status color accent on left edge
      const sc = STATUS_COLORS_RGB[entry.status] || [99, 102, 241];
      doc.rect(leftM, y, 2.5, rowH).fill(`rgb(${sc[0]},${sc[1]},${sc[2]})`);

      return y + rowH;
    }

    // ── Summary box ──
    function drawSummary(y, dayEntries, machineCount) {
      const boxH = 28;
      y += 6;
      doc.rect(leftM, y, contentW, boxH).fill('#f1f5f9');
      doc.strokeColor('#cbd5e1').lineWidth(0.5).rect(leftM, y, contentW, boxH).stroke();

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
        doc.fillColor(item.color).fontSize(12).font('Helvetica-Bold')
          .text(String(item.value), ix, y + 4, { width: itemW, align: 'center' });
        doc.fillColor('#64748b').fontSize(6).font('Helvetica')
          .text(item.label.toUpperCase(), ix, y + 18, { width: itemW, align: 'center' });
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
      // Push signatures to bottom of page
      const sigBlockH = 80;
      const sigY = Math.max(y + 15, pageH - 30 - sigBlockH);

      // Title line
      doc.strokeColor('#e2e8f0').lineWidth(0.5)
        .moveTo(leftM, sigY).lineTo(rightM, sigY).stroke();
      doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold')
        .text('APPROVALS', leftM, sigY + 4, { width: contentW, align: 'center' });

      const sigStartY = sigY + 16;
      const sigW = (contentW - 40) / 3;
      const roles = ['Workshop Technician', 'Workshop Engineer', 'Workshop Manager'];

      roles.forEach((role, i) => {
        const sx = leftM + i * (sigW + 20);

        // Signature box
        doc.rect(sx, sigStartY, sigW, 55).fill('#fafbfc');
        doc.strokeColor('#cbd5e1').lineWidth(0.5).rect(sx, sigStartY, sigW, 55).stroke();

        // Role title
        doc.fillColor('#1e293b').fontSize(8).font('Helvetica-Bold')
          .text(role, sx, sigStartY + 4, { width: sigW, align: 'center' });

        // Signature line
        doc.strokeColor('#1e293b').lineWidth(0.8)
          .moveTo(sx + 15, sigStartY + 32).lineTo(sx + sigW - 15, sigStartY + 32).stroke();
        doc.fillColor('#94a3b8').fontSize(6).font('Helvetica')
          .text('Signature', sx + 15, sigStartY + 34, { width: sigW - 30, align: 'center' });

        // Name and Date
        doc.fillColor('#64748b').fontSize(6.5).font('Helvetica')
          .text('Name: ..............................', sx + 8, sigStartY + 42)
          .text('Date: ................................', sx + 8, sigStartY + 49);
      });

      doc.fillColor('#000000');
    }

    // ── Page footer ──
    function drawFooter(pageNum, totalPages) {
      const footY = pageH - 20;
      doc.rect(0, footY, pageW, 20).fill('#1e293b');
      doc.fillColor('#94a3b8').fontSize(6.5).font('Helvetica')
        .text('TaskFlow CNC Production Planning System', leftM, footY + 6, { width: contentW / 3 })
        .text(`Page ${pageNum} of ${totalPages}`, leftM + contentW / 3, footY + 6, { width: contentW / 3, align: 'center' })
        .text('CONFIDENTIAL', leftM + 2 * contentW / 3, footY + 6, { width: contentW / 3, align: 'right' });
      doc.fillColor('#000000');
    }

    // ═══════════ Generate pages ═══════════
    const totalPages = dates.length || 1;

    dates.forEach((dateStr, pageIdx) => {
      if (pageIdx > 0) doc.addPage();

      let y = drawPageHeader(dateStr);
      const dayEntries = getEntriesForDate(dateStr);
      const activeMachines = machines.filter(m => dayEntries.some(e => e.machine_id === m.id));

      if (activeMachines.length === 0) {
        doc.fillColor('#94a3b8').fontSize(11).font('Helvetica')
          .text('No jobs planned for this date', leftM, y + 40, { width: contentW, align: 'center' });
        drawSignatures(y + 80);
      } else {
        activeMachines.forEach(machine => {
          const machineEntries = dayEntries
            .filter(e => e.machine_id === machine.id)
            .sort((a, b) => {
              const at = a.planned_start_time ? new Date(a.planned_start_time).getTime() : 0;
              const bt = b.planned_start_time ? new Date(b.planned_start_time).getTime() : 0;
              return at - bt;
            });

          // Check if we need a new page (machine header + table header + at least 2 rows + footer)
          const minNeeded = 20 + 16 + 15 * Math.min(machineEntries.length, 2) + 130;
          if (y + minNeeded > pageH - 30) {
            drawSignatures(y);
            drawFooter(pageIdx + 1, totalPages);
            doc.addPage();
            y = drawPageHeader(dateStr);
          }

          y = drawMachineHeader(y, machine, machineEntries.length);
          y = drawTableHeader(y);

          machineEntries.forEach((entry, idx) => {
            // Check row overflow
            if (y + 15 > pageH - 130) {
              drawSignatures(y);
              drawFooter(pageIdx + 1, totalPages);
              doc.addPage();
              y = drawPageHeader(dateStr);
              y = drawMachineHeader(y, machine, machineEntries.length);
              y = drawTableHeader(y);
            }
            y = drawEntryRow(entry, idx, y);
          });

          y += 10;
        });

        y = drawSummary(y, dayEntries, activeMachines.length);
        drawSignatures(y);
      }

      drawFooter(pageIdx + 1, totalPages);
    });

    if (dates.length === 0) {
      let y = drawPageHeader(start_date);
      doc.fillColor('#94a3b8').fontSize(11).font('Helvetica')
        .text('No data found for selected date range', leftM, y + 40, { width: contentW, align: 'center' });
      drawFooter(1, 1);
    }

    doc.end();
  } catch (error) {
    console.error('Error generating production report PDF:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;
