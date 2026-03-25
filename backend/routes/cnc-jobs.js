const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin, denyGuest } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = crypto.randomUUID() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.doc', '.docx', '.xls', '.xlsx', '.dwg', '.dxf', '.step', '.stp', '.iges', '.stl', '.sldprt', '.sldasm', '.slddrw', '.3dm', '.sat', '.x_t', '.x_b', '.prt', '.asm', '.zip', '.rar', '.7z'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

// Helper to log CNC job card history
const logCncHistory = async (jobCardId, actionType, userId, notes, oldValue = null, newValue = null) => {
  await db.query(
    `INSERT INTO cnc_job_card_history (job_card_id, action_type, user_id, notes, old_value, new_value) VALUES ($1,$2,$3,$4,$5,$6)`,
    [jobCardId, actionType, userId, notes, oldValue, newValue]
  );
};

// Get CNC jobs assigned to current user (for My Tasks integration)
router.get(
  '/my-jobs',
  authenticate,
  async (req, res) => {
    try {
      const { status = 'active', search = '' } = req.query;
      let query_str = `
        SELECT 
          j.*,
          w.name as workflow_name,
          s.stage_name as stage_name,
          u.name as assigned_user,
          creator.name as created_by_name,
          (SELECT COUNT(*) FROM cnc_job_attachments a WHERE a.job_card_id = j.id) as attachment_count,
          (SELECT ext.new_deadline FROM cnc_deadline_extensions ext WHERE ext.job_card_id = j.id AND ext.approval_status = 'approved' ORDER BY ext.created_at DESC LIMIT 1) as approved_extension_date
        FROM cnc_job_cards j
        LEFT JOIN workflows w ON j.workflow_id = w.id
        LEFT JOIN workflow_stages s ON j.current_stage_id = s.id
        LEFT JOIN users u ON j.assigned_to = u.id
        LEFT JOIN users creator ON j.created_by = creator.id
        WHERE j.assigned_to = $1
      `;
      const params = [req.user.id];

      if (search) {
        query_str += ` AND (j.job_name ILIKE $${params.length + 1} OR j.job_card_number ILIKE $${params.length + 1} OR j.part_number ILIKE $${params.length + 1} OR j.client_name ILIKE $${params.length + 1})`;
        params.push(`%${search}%`);
      }

      if (status === 'active') {
        query_str += ` AND j.status = 'active'`;
      } else if (status === 'completed') {
        query_str += ` AND j.status = 'completed'`;
      }

      query_str += ` ORDER BY j.created_at DESC`;
      const result = await db.query(query_str, params);

      // Stats for the user's CNC jobs
      const statsResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE estimate_end_date < NOW() AND status = 'active') as overdue
        FROM cnc_job_cards WHERE assigned_to = $1
      `, [req.user.id]);

      res.json({
        data: result.rows,
        stats: statsResult.rows[0]
      });
    } catch (error) {
      console.error('Error fetching user job cards:', error);
      res.status(500).json({ error: 'Failed to fetch your CNC job cards' });
    }
  }
);

// Get ALL CNC jobs for admin (All Tasks page)
router.get(
  '/all-jobs',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { status = 'active', search = '' } = req.query;
      let query_str = `
        SELECT 
          j.*,
          w.name as workflow_name,
          s.stage_name as stage_name,
          u.name as assigned_user,
          creator.name as created_by_name,
          (SELECT COUNT(*) FROM cnc_job_attachments a WHERE a.job_card_id = j.id) as attachment_count,
          (SELECT ext.new_deadline FROM cnc_deadline_extensions ext WHERE ext.job_card_id = j.id AND ext.approval_status = 'approved' ORDER BY ext.created_at DESC LIMIT 1) as approved_extension_date
        FROM cnc_job_cards j
        LEFT JOIN workflows w ON j.workflow_id = w.id
        LEFT JOIN workflow_stages s ON j.current_stage_id = s.id
        LEFT JOIN users u ON j.assigned_to = u.id
        LEFT JOIN users creator ON j.created_by = creator.id
        WHERE 1=1
      `;
      const params = [];

      if (status === 'active') {
        query_str += ` AND j.status = 'active'`;
      } else if (status === 'completed') {
        query_str += ` AND j.status = 'completed'`;
      }

      if (search) {
        params.push(`%${search}%`);
        query_str += ` AND (j.job_name ILIKE $${params.length} OR j.job_card_number ILIKE $${params.length} OR j.part_number ILIKE $${params.length} OR u.name ILIKE $${params.length})`;
      }

      query_str += ` ORDER BY j.created_at DESC`;
      const result = await db.query(query_str, params);

      // Stats across all CNC jobs
      const statsResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE estimate_end_date < NOW() AND status = 'active') as overdue
        FROM cnc_job_cards
      `);

      res.json({
        data: result.rows,
        stats: statsResult.rows[0]
      });
    } catch (error) {
      console.error('Error fetching all job cards:', error);
      res.status(500).json({ error: 'Failed to fetch CNC job cards' });
    }
  }
);

// Get all CNC job cards (with filters)
router.get(
  '/',
  authenticate,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { workflow_id, status = 'active', page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      let query_str = `
        SELECT 
          j.*,
          w.name as workflow_name,
          s.stage_name as stage_name,
          u.name as assigned_user,
          creator.name as created_by_name,
          (SELECT COUNT(*) FROM cnc_job_attachments a WHERE a.job_card_id = j.id) as attachment_count,
          (SELECT ext.new_deadline FROM cnc_deadline_extensions ext WHERE ext.job_card_id = j.id AND ext.approval_status = 'approved' ORDER BY ext.created_at DESC LIMIT 1) as approved_extension_date
        FROM cnc_job_cards j
        LEFT JOIN workflows w ON j.workflow_id = w.id
        LEFT JOIN workflow_stages s ON j.current_stage_id = s.id
        LEFT JOIN users u ON j.assigned_to = u.id
        LEFT JOIN users creator ON j.created_by = creator.id
        WHERE 1=1
      `;

      const params = [];

      if (workflow_id) {
        query_str += ` AND j.workflow_id = $${params.length + 1}`;
        params.push(workflow_id);
      }

      if (status === 'active') {
        query_str += ` AND j.status = 'active'`;
      } else if (status === 'completed') {
        query_str += ` AND j.status = 'completed'`;
      }

      query_str += ` ORDER BY j.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(query_str, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM cnc_job_cards WHERE 1=1';
      const countParams = [];

      if (workflow_id) {
        countQuery += ` AND workflow_id = $${countParams.length + 1}`;
        countParams.push(workflow_id);
      }

      if (status === 'active') {
        countQuery += ` AND status = 'active'`;
      } else if (status === 'completed') {
        countQuery += ` AND status = 'completed'`;
      }

      const countResult = await db.query(countQuery, countParams);
      const total = countResult.rows[0].total;

      res.json({
        data: result.rows,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching job cards:', error);
      res.status(500).json({ error: 'Failed to fetch job cards' });
    }
  }
);

// Get all CNC extensions (admin)
router.get('/extensions/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.*, u1.name as requested_by_name, u2.name as approved_by_name, j.job_name, j.job_card_number
       FROM cnc_deadline_extensions e
       LEFT JOIN users u1 ON e.requested_by = u1.id
       LEFT JOIN users u2 ON e.approved_by = u2.id
       LEFT JOIN cnc_job_cards j ON e.job_card_id = j.id
       ORDER BY e.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching CNC extensions:', error);
    res.status(500).json({ error: 'Failed to fetch extensions' });
  }
});

// Get single job card
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT 
        j.*,
        w.name as workflow_name,
        s.stage_name,
        u.name as assigned_user,
        creator.name as created_by_name
      FROM cnc_job_cards j
      LEFT JOIN workflows w ON j.workflow_id = w.id
      LEFT JOIN workflow_stages s ON j.current_stage_id = s.id
      LEFT JOIN users u ON j.assigned_to = u.id
      LEFT JOIN users creator ON j.created_by = creator.id
      WHERE j.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // Get history
    const historyResult = await db.query(
      `SELECT 
        h.*,
        u.name as user_name,
        fs.stage_name as from_stage_name,
        ts.stage_name as to_stage_name
      FROM cnc_job_card_history h
      LEFT JOIN users u ON h.user_id = u.id
      LEFT JOIN workflow_stages fs ON h.from_stage_id = fs.id
      LEFT JOIN workflow_stages ts ON h.to_stage_id = ts.id
      WHERE h.job_card_id = $1
      ORDER BY h.created_at DESC`,
      [id]
    );

    // Get attachments
    const attachmentsResult = await db.query(
      `SELECT a.*, u.name as uploaded_by_name
       FROM cnc_job_attachments a
       LEFT JOIN users u ON a.uploaded_by = u.id
       WHERE a.job_card_id = $1
       ORDER BY a.created_at DESC`,
      [id]
    );

    // Get extensions
    const extensionsResult = await db.query(
      `SELECT e.*, 
        r.name as requested_by_name,
        a.name as approved_by_name
       FROM cnc_deadline_extensions e
       LEFT JOIN users r ON e.requested_by = r.id
       LEFT JOIN users a ON e.approved_by = a.id
       WHERE e.job_card_id = $1
       ORDER BY e.created_at DESC`,
      [id]
    );

    res.json({
      ...result.rows[0],
      history: historyResult.rows,
      attachments: attachmentsResult.rows,
      extensions: extensionsResult.rows
    });
  } catch (error) {
    console.error('Error fetching job card:', error);
    res.status(500).json({ error: 'Failed to fetch job card' });
  }
});

// Create new job card
router.post(
  '/',
  authenticate,
  denyGuest,
  async (req, res) => {

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const {
        job_name,
        job_card_number,
        subjob_card_number,
        job_date,
        machine_name,
        client_name,
        part_number,
        manufacturing_type,
        quantity = 1,
        estimate_end_date,
        workflow_id,
        assigned_to,
        priority = 'medium',
        notes,
        material,
        drawing_number,
        tolerance,
        surface_finish
      } = req.body;

      // Get first stage of workflow
      const firstStageResult = await client.query(
        `SELECT id FROM workflow_stages 
         WHERE workflow_id = $1 AND is_active = true 
         ORDER BY stage_order LIMIT 1`,
        [workflow_id]
      );

      if (firstStageResult.rows.length === 0) {
        throw new Error('Workflow has no active stages');
      }

      const firstStageId = firstStageResult.rows[0].id;

      // Create job card
      const jobCardResult = await client.query(
        `INSERT INTO cnc_job_cards (
          job_name, job_card_number, subjob_card_number, job_date, 
          machine_name, client_name, part_number, manufacturing_type, 
          quantity, estimate_end_date, workflow_id, current_stage_id, 
          assigned_to, created_by, priority, notes,
          material, drawing_number, tolerance, surface_finish
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *`,
        [
          job_name,
          job_card_number,
          subjob_card_number || null,
          job_date,
          machine_name || null,
          client_name || null,
          part_number,
          manufacturing_type,
          quantity,
          estimate_end_date || null,
          workflow_id,
          firstStageId,
          assigned_to || null,
          req.user.id,
          priority,
          notes || null,
          material || null,
          drawing_number || null,
          tolerance || null,
          surface_finish || null
        ]
      );

      const jobCard = jobCardResult.rows[0];

      // Log initial creation
      await client.query(
        `INSERT INTO cnc_job_card_history (
          job_card_id, action_type, to_stage_id, user_id, notes
        ) VALUES ($1, $2, $3, $4, $5)`,
        [jobCard.id, 'created', firstStageId, req.user.id, `Job card created and placed in first stage`]
      );

      await client.query('COMMIT');

      res.status(201).json(jobCard);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating job card:', error);

      if (error.code === '23505') {
        return res.status(400).json({ error: 'Job card number already exists' });
      }
      res.status(500).json({ error: error.message || 'Failed to create job card' });
    } finally {
      client.release();
    }
  }
);

// Update job card
router.put(
  '/:id',
  authenticate,
  denyGuest,
  async (req, res) => {

    try {
      const { id } = req.params;
      const updates = req.body;

      // Get existing job card for comparison
      const existing = await db.query('SELECT * FROM cnc_job_cards WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Job card not found' });
      }
      const old = existing.rows[0];

      // Deadline change logic (same as tasks):
      // - Users can change estimate_end_date ONCE per job card
      // - Admins can change UNLIMITED times
      // - After first change, users must request an extension
      const normalizeDate = (dateStr) => {
        if (!dateStr) return null;
        return new Date(dateStr).toISOString().split('T')[0];
      };

      const oldDeadline = normalizeDate(old.estimate_end_date);
      const newDeadline = normalizeDate(updates.estimate_end_date);
      const deadlineChanged = newDeadline && newDeadline !== oldDeadline;

      if (deadlineChanged && req.user.role !== 'admin') {
        const deadlineChanges = await db.query(
          `SELECT COUNT(*) as count FROM cnc_job_card_history 
           WHERE job_card_id = $1 AND action_type = 'deadline_changed' AND user_id = $2`,
          [id, req.user.id]
        );
        if (parseInt(deadlineChanges.rows[0].count) > 0) {
          return res.status(403).json({ error: 'You have already changed the estimate end date once. Please request an extension.' });
        }
      }

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [id];
      let paramCount = 2;

      for (const [key, value] of Object.entries(updates)) {
        updateFields.push(`${key} = $${paramCount}`);
        updateValues.push(value);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const result = await db.query(
        `UPDATE cnc_job_cards SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`,
        updateValues
      );

      // Log history for important field changes
      if (deadlineChanged) {
        await logCncHistory(id, 'deadline_changed', req.user.id, `Estimate end date changed`, oldDeadline, newDeadline);
      }
      if (updates.assigned_to && updates.assigned_to !== old.assigned_to) {
        await logCncHistory(id, 'reassigned', req.user.id, `Job card reassigned`);
      }
      if (updates.priority && updates.priority !== old.priority) {
        await logCncHistory(id, 'priority_changed', req.user.id, `Priority: ${old.priority} → ${updates.priority}`, old.priority, updates.priority);
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating job card:', error);
      res.status(500).json({ error: 'Failed to update job card' });
    }
  }
);

// Move job card to different stage
router.post(
  '/:id/move-stage',
  authenticate,
  denyGuest,
  async (req, res) => {

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { stage_id, notes } = req.body;

      // Get job card
      const jobCardResult = await client.query(
        'SELECT * FROM cnc_job_cards WHERE id = $1',
        [id]
      );

      if (jobCardResult.rows.length === 0) {
        throw new Error('Job card not found');
      }

      const jobCard = jobCardResult.rows[0];
      const fromStageId = jobCard.current_stage_id;

      // Verify stage exists and belongs to same workflow
      const stageResult = await client.query(
        'SELECT id FROM workflow_stages WHERE id = $1 AND workflow_id = $2',
        [stage_id, jobCard.workflow_id]
      );

      if (stageResult.rows.length === 0) {
        throw new Error('Invalid stage for this workflow');
      }

      // Update job card stage
      const updateResult = await client.query(
        'UPDATE cnc_job_cards SET current_stage_id = $1 WHERE id = $2 RETURNING *',
        [stage_id, id]
      );

      // Log the movement
      await client.query(
        `INSERT INTO cnc_job_card_history (
          job_card_id, action_type, from_stage_id, to_stage_id, user_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, 'stage_moved', fromStageId, stage_id, req.user.id, notes || null]
      );

      await client.query('COMMIT');

      res.json(updateResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error moving job card:', error);
      res.status(500).json({ error: error.message || 'Failed to move job card' });
    } finally {
      client.release();
    }
  }
);

// Complete/close job card (admin only)
router.post(
  '/:id/complete',
  authenticate,
  async (req, res) => {
    // Admin-only check
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required. Only admins can mark job cards as completed.' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { notes } = req.body;

      // Get job card
      const jobCardResult = await client.query(
        'SELECT current_stage_id FROM cnc_job_cards WHERE id = $1',
        [id]
      );

      if (jobCardResult.rows.length === 0) {
        throw new Error('Job card not found');
      }

      const fromStageId = jobCardResult.rows[0].current_stage_id;

      // Update job card: mark as completed and archive (sets status='completed', is_active=false)
      const result = await client.query(
        `UPDATE cnc_job_cards 
         SET status = 'completed', actual_end_date = NOW() 
         WHERE id = $1 RETURNING *`,
        [id]
      );

      // Log completion
      await client.query(
        `INSERT INTO cnc_job_card_history (
          job_card_id, action_type, from_stage_id, user_id, notes
        ) VALUES ($1, $2, $3, $4, $5)`,
        [id, 'completed', fromStageId, req.user.id, notes || 'Job card completed and archived']
      );

      await client.query('COMMIT');

      res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error completing job card:', error);
      res.status(500).json({ error: error.message || 'Failed to complete job card' });
    } finally {
      client.release();
    }
  }
);

// Delete job card (hard delete - admin only)
router.delete(
  '/:id',
  authenticate,
  async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { id } = req.params;

      const result = await db.query(
        'DELETE FROM cnc_job_cards WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Job card not found' });
      }

      res.json({ message: 'Job card deleted successfully' });
    } catch (error) {
      console.error('Error deleting job card:', error);
      res.status(500).json({ error: 'Failed to delete job card' });
    }
  }
);

// ==================== EXTENSIONS ====================

// Request extension for CNC job estimate end date
router.post('/:id/extension', authenticate, denyGuest, async (req, res) => {
  try {
    const { new_deadline, reason } = req.body;
    if (!new_deadline) return res.status(400).json({ error: 'New deadline is required' });

    const job = await db.query('SELECT * FROM cnc_job_cards WHERE id = $1', [req.params.id]);
    if (!job.rows[0]) return res.status(404).json({ error: 'Job card not found' });

    const result = await db.query(
      `INSERT INTO cnc_deadline_extensions (job_card_id, requested_by, previous_deadline, new_deadline, reason) 
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, req.user.id, job.rows[0].extended_estimate_end_date || job.rows[0].estimate_end_date, new_deadline, reason]
    );

    await logCncHistory(req.params.id, 'extension_requested', req.user.id, `Extension requested to ${new_deadline}`);

    // Broadcast extension request via socket
    const io = req.app.locals.io;
    if (io) {
      io.emit('cnc:extension:requested', {
        jobCardId: req.params.id,
        extension: result.rows[0],
        requestedBy: req.user.name,
        timestamp: new Date()
      });
    }

    res.status(201).json({ extension: result.rows[0] });
  } catch (err) {
    console.error('Error requesting CNC extension:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: approve/reject CNC extension
router.put('/extensions/:extId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { approval_status } = req.body;
    const ext = await db.query('SELECT * FROM cnc_deadline_extensions WHERE id = $1', [req.params.extId]);
    if (!ext.rows[0]) return res.status(404).json({ error: 'Extension not found' });

    await db.query(
      'UPDATE cnc_deadline_extensions SET approval_status=$1, approved_by=$2, approved_at=NOW() WHERE id=$3',
      [approval_status, req.user.id, req.params.extId]
    );

    if (approval_status === 'approved') {
      await db.query(
        'UPDATE cnc_job_cards SET extended_estimate_end_date=$1 WHERE id=$2',
        [ext.rows[0].new_deadline, ext.rows[0].job_card_id]
      );
      await logCncHistory(ext.rows[0].job_card_id, 'extension_approved', req.user.id, `Extension approved to ${ext.rows[0].new_deadline}`);

      const io = req.app.locals.io;
      if (io) {
        io.emit('cnc:extension:approved', {
          jobCardId: ext.rows[0].job_card_id,
          extension: ext.rows[0],
          approvedBy: req.user.name,
          timestamp: new Date()
        });
      }
    } else {
      await logCncHistory(ext.rows[0].job_card_id, 'extension_rejected', req.user.id, `Extension rejected`);
    }

    res.json({ message: `Extension ${approval_status}` });
  } catch (err) {
    console.error('Error handling CNC extension:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== ATTACHMENTS ====================

// Upload attachment to job card
router.post(
  '/:id/attachments',
  authenticate,
  upload.single('file'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Verify job card exists
      const jobCheck = await db.query('SELECT id FROM cnc_job_cards WHERE id = $1', [id]);
      if (jobCheck.rows.length === 0) {
        // Clean up uploaded file
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Job card not found' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const result = await db.query(
        `INSERT INTO cnc_job_attachments (job_card_id, stored_filename, original_name, file_type, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error uploading attachment:', error);
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to upload attachment' });
    }
  }
);

// Download attachment (must be before /:id/attachments to avoid route conflict)
router.get('/attachments/:attachmentId/download', authenticate, async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const result = await db.query(
      'SELECT stored_filename, original_name, file_type FROM cnc_job_attachments WHERE id = $1',
      [attachmentId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    const att = result.rows[0];
    const filePath = path.join(__dirname, '..', 'uploads', att.stored_filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${att.original_name}"`);
    if (att.file_type) res.setHeader('Content-Type', att.file_type);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// Get attachments for a job card
router.get('/:id/attachments', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT a.*, u.name as uploaded_by_name
       FROM cnc_job_attachments a
       LEFT JOIN users u ON a.uploaded_by = u.id
       WHERE a.job_card_id = $1
       ORDER BY a.created_at DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// Delete attachment
router.delete('/attachments/:attachmentId', authenticate, denyGuest, async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const result = await db.query(
      'DELETE FROM cnc_job_attachments WHERE id = $1 RETURNING *',
      [attachmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Delete physical file
    const filePath = path.join(__dirname, '..', 'uploads', result.rows[0].stored_filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Attachment deleted' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// ==================== PDF REPORT ====================

// Generate PDF report for a job card
router.get('/:id/report', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT 
        j.*,
        w.name as workflow_name,
        s.stage_name,
        u.name as assigned_user_name,
        creator.name as created_by_name
      FROM cnc_job_cards j
      LEFT JOIN workflows w ON j.workflow_id = w.id
      LEFT JOIN workflow_stages s ON j.current_stage_id = s.id
      LEFT JOIN users u ON j.assigned_to = u.id
      LEFT JOIN users creator ON j.created_by = creator.id
      WHERE j.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const card = result.rows[0];

    // Get history
    const historyResult = await db.query(
      `SELECT h.*, u.name as user_name,
              fs.stage_name as from_stage_name,
              ts.stage_name as to_stage_name
       FROM cnc_job_card_history h
       LEFT JOIN users u ON h.user_id = u.id
       LEFT JOIN workflow_stages fs ON h.from_stage_id = fs.id
       LEFT JOIN workflow_stages ts ON h.to_stage_id = ts.id
       WHERE h.job_card_id = $1
       ORDER BY h.created_at ASC`,
      [id]
    );

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="JobCard-${card.job_card_number}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('CNC JOB CARD REPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
      .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(1);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd');
    doc.moveDown(0.5);

    // Job Info Section
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Job Information');
    doc.moveDown(0.5);

    const addField = (label, value) => {
      if (!value) return;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#555').text(label + ': ', { continued: true });
      doc.font('Helvetica').fillColor('#000').text(String(value));
    };

    addField('Job Name', card.job_name);
    addField('Job Card #', card.job_card_number);
    if (card.subjob_card_number) addField('Sub Job Card #', card.subjob_card_number);
    addField('Part Number', card.part_number);
    if (card.drawing_number) addField('Drawing Number', card.drawing_number);
    addField('Workflow', card.workflow_name);
    addField('Current Stage', card.stage_name);
    addField('Status', card.status);
    addField('Priority', card.priority?.toUpperCase());
    doc.moveDown(0.5);

    // Manufacturing Details
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Manufacturing Details');
    doc.moveDown(0.5);

    addField('Manufacturing Type', card.manufacturing_type === 'internal' ? 'Internal' : 'External');
    if (card.machine_name) addField('Machine', card.machine_name);
    if (card.client_name) addField('Client', card.client_name);
    addField('Quantity', card.quantity);
    if (card.material) addField('Material', card.material);
    if (card.tolerance) addField('Tolerance', card.tolerance);
    if (card.surface_finish) addField('Surface Finish', card.surface_finish);
    doc.moveDown(0.5);

    // Dates
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Timeline');
    doc.moveDown(0.5);

    addField('Job Date', card.job_date ? new Date(card.job_date).toLocaleDateString() : 'N/A');
    addField('Est. End Date', card.estimate_end_date ? new Date(card.estimate_end_date).toLocaleDateString() : 'N/A');
    if (card.actual_end_date) addField('Actual End Date', new Date(card.actual_end_date).toLocaleDateString());
    addField('Created', new Date(card.created_at).toLocaleString());
    doc.moveDown(0.5);

    // Assignment
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Assignment');
    doc.moveDown(0.5);

    addField('Assigned To', card.assigned_user_name || 'Unassigned');
    addField('Created By', card.created_by_name);
    doc.moveDown(0.5);

    if (card.notes) {
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Notes');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#000').text(card.notes);
      doc.moveDown(0.5);
    }

    // History
    if (historyResult.rows.length > 0) {
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Stage History');
      doc.moveDown(0.5);

      historyResult.rows.forEach((h, i) => {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#555')
          .text(`${i + 1}. ${h.action_type.replace('_', ' ').toUpperCase()}`, { continued: true });
        doc.font('Helvetica').fillColor('#888')
          .text(`  - ${new Date(h.created_at).toLocaleString()}`);
        if (h.from_stage_name && h.to_stage_name) {
          doc.fontSize(9).fillColor('#666')
            .text(`   ${h.from_stage_name} → ${h.to_stage_name}`);
        }
        if (h.user_name) {
          doc.fontSize(9).fillColor('#666').text(`   By: ${h.user_name}`);
        }
        if (h.notes) {
          doc.fontSize(9).fillColor('#666').text(`   Note: ${h.notes}`);
        }
        doc.moveDown(0.3);
      });
    }

    doc.end();
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Bulk CSV Import endpoint for job cards (Admin only)
const csv = require('csv-parser');
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    console.log('File received:', file.originalname, file.mimetype);
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed. Received: ' + file.mimetype));
    }
  }
});

// Error handler middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    }
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

router.post(
  '/bulk-import',
  authenticate,
  requireAdmin,
  csvUpload.single('csv_file'),
  async (req, res) => {
    try {
      console.log('=== CSV Import Handler ===');
      console.log('Request received');
      console.log('Content-Type header:', req.get('content-type'));
      console.log('Is multipart?', req.is('multipart'));
      console.log('Is multipart/form-data?', req.is('multipart/form-data'));
      console.log('User:', req.user?.id);
      console.log('File present:', !!req.file);
      if (req.file) {
        console.log('File name:', req.file.originalname);
        console.log('File size:', req.file.size);
        console.log('File mimetype:', req.file.mimetype);
      }
      console.log('Body keys:', Object.keys(req.body));
      console.log('Body:', req.body);

      if (!req.file) {
        console.log('ERROR: No file in request');
        console.log('Available fields in req.body:', Object.keys(req.body));
        return res.status(400).json({ 
          error: 'No CSV file provided. Please upload a .csv file.',
          debug: { hasFile: !!req.file, bodyFields: Object.keys(req.body) }
        });
      }

      const { workflow_id } = req.body;
      if (!workflow_id) {
        console.log('ERROR: workflow_id missing from body');
        console.log('Body contents:', req.body);
        return res.status(400).json({ 
          error: 'workflow_id is required in form data',
          debug: { workflow_id, body: req.body }
        });
      }

      // Verify workflow exists
      const workflowCheck = await db.query(
        'SELECT id FROM workflows WHERE id = $1',
        [workflow_id]
      );
      if (workflowCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid workflow_id' });
      }

      // Get first stage of workflow
      const stageResult = await db.query(
        `SELECT id FROM workflow_stages 
         WHERE workflow_id = $1 AND is_active = true 
         ORDER BY stage_order LIMIT 1`,
        [workflow_id]
      );
      if (stageResult.rows.length === 0) {
        return res.status(400).json({ error: 'Workflow has no active stages' });
      }
      const firstStageId = stageResult.rows[0].id;

      const results = [];
      const errors = [];
      const skipped = [];
      let successCount = 0;
      const rows = [];

      // Parse CSV - collect all rows first
      return new Promise((resolve) => {
        const Readable = require('stream').Readable;
        const csvStream = new Readable();
        csvStream.push(req.file.buffer);
        csvStream.push(null);

        csvStream
          .pipe(csv())
          .on('data', (row) => {
            rows.push(row);
          })
          .on('end', async () => {
            // Process all collected rows
            for (const row of rows) {
              try {
                // Validate required fields
                if (!row.job_name || !row.job_card_number || !row.part_number) {
                  errors.push({
                    row: row.job_card_number || 'Unknown',
                    error: 'Missing required fields: job_name, job_card_number, or part_number'
                  });
                  continue;
                }

                const { job_name, job_card_number, subjob_card_number, job_date, machine_name, client_name, part_number, manufacturing_type, quantity, estimate_end_date, assigned_to, priority, notes } = row;

                // Check if job card already exists (duplicate check)
                const existCheck = await db.query(
                  'SELECT id FROM cnc_job_cards WHERE job_card_number = $1',
                  [job_card_number]
                );
                if (existCheck.rows.length > 0) {
                  skipped.push({
                    job_card_number,
                    job_name,
                    reason: 'Job card number already exists in database'
                  });
                  continue;
                }

                // Validate manufacturing type
                if (manufacturing_type && !['internal', 'external'].includes(manufacturing_type.toLowerCase())) {
                  errors.push({
                    row: job_card_number,
                    error: 'Manufacturing type must be "internal" or "external"'
                  });
                  continue;
                }

                // Validate priority
                if (priority && !['low', 'medium', 'high'].includes(priority.toLowerCase())) {
                  errors.push({
                    row: job_card_number,
                    error: 'Priority must be "low", "medium", or "high"'
                  });
                  continue;
                }

                // Parse dates - handle multiple formats (YYYY-MM-DD or DD/MM/YYYY)
                const parseDate = (dateStr) => {
                  if (!dateStr || typeof dateStr !== 'string') return null;
                  dateStr = dateStr.trim();
                  if (!dateStr) return null;

                  // Try YYYY-MM-DD format first
                  let date = new Date(dateStr);
                  if (!isNaN(date)) return date;

                  // Try DD/MM/YYYY format
                  const ddmmMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                  if (ddmmMatch) {
                    const [, day, month, year] = ddmmMatch;
                    date = new Date(year, month - 1, day);
                    if (!isNaN(date)) return date;
                  }

                  // Try DD-MM-YYYY format
                  const ddmmDashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
                  if (ddmmDashMatch) {
                    const [, day, month, year] = ddmmDashMatch;
                    date = new Date(year, month - 1, day);
                    if (!isNaN(date)) return date;
                  }

                  return null;
                };

                let jobDate = null;
                let estEndDate = null;
                if (job_date) {
                  jobDate = parseDate(job_date);
                  if (jobDate === null) {
                    errors.push({
                      row: job_card_number,
                      error: `Invalid job_date format: "${job_date}" (use YYYY-MM-DD or DD/MM/YYYY)`
                    });
                    continue;
                  }
                }
                if (estimate_end_date) {
                  estEndDate = parseDate(estimate_end_date);
                  if (estEndDate === null) {
                    errors.push({
                      row: job_card_number,
                      error: `Invalid estimate_end_date format: "${estimate_end_date}" (use YYYY-MM-DD or DD/MM/YYYY)`
                    });
                    continue;
                  }
                }

                // Parse user assignment
                let assignedUserId = null;
                if (assigned_to && assigned_to.trim()) {
                  const userCheck = await db.query(
                    'SELECT id FROM users WHERE email = $1',
                    [assigned_to]
                  );
                  if (userCheck.rows.length > 0) {
                    assignedUserId = userCheck.rows[0].id;
                  }
                }

                // Parse quantity - handle empty values
                let parsedQuantity = 1;
                if (quantity && typeof quantity === 'string' && quantity.trim()) {
                  const numQty = parseInt(quantity, 10);
                  if (!isNaN(numQty) && numQty > 0) {
                    parsedQuantity = numQty;
                  }
                }

                // Create job card
                const result = await db.query(
                  `INSERT INTO cnc_job_cards (
                    job_name, job_card_number, subjob_card_number, job_date, 
                    machine_name, client_name, part_number, manufacturing_type, 
                    quantity, estimate_end_date, workflow_id, current_stage_id, 
                    assigned_to, created_by, priority, notes
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                  RETURNING id`,
                  [
                    job_name,
                    job_card_number,
                    subjob_card_number || null,
                    jobDate,
                    machine_name || null,
                    client_name || null,
                    part_number,
                    manufacturing_type ? manufacturing_type.toLowerCase() : 'internal',
                    parsedQuantity,
                    estEndDate,
                    workflow_id,
                    firstStageId,
                    assignedUserId,
                    req.user.id,
                    priority ? priority.toLowerCase() : 'medium',
                    notes || null
                  ]
                );

                // Log history
                await db.query(
                  `INSERT INTO cnc_job_card_history (job_card_id, action_type, user_id, notes) VALUES ($1, $2, $3, $4)`,
                  [result.rows[0].id, 'created_bulk', req.user.id, 'Bulk import from CSV']
                );

                successCount++;
                results.push({
                  job_card_number,
                  job_name,
                  status: 'success'
                });
              } catch (error) {
                console.error('Error processing CSV row:', error);
                errors.push({
                  row: row.job_card_number || 'Unknown',
                  error: error.message
                });
              }
            }

            // Send response after all processing is done
            res.json({
              success: true,
              summary: {
                total: successCount + skipped.length + errors.length,
                imported: successCount,
                skipped: skipped.length,
                errors: errors.length
              },
              imported: results,
              skipped: skipped,
              errors: errors
            });
            resolve();
          })
          .on('error', (error) => {
            console.error('CSV parse error:', error);
            res.status(400).json({ error: 'Failed to parse CSV: ' + error.message });
            resolve();
          });
      });
    } catch (error) {
      console.error('Error in bulk import:', error);
      res.status(500).json({ error: 'Server error during bulk import' });
    }
  }
);

// Error handling middleware for multer and other errors
router.use((error, req, res, next) => {
  console.error('Route error middleware:', error.message);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    }
    return res.status(400).json({ error: 'File upload error: ' + error.message });
  }
  
  if (error instanceof Error) {
    return res.status(400).json({ error: error.message });
  }
  
  res.status(500).json({ error: 'Unknown error occurred' });
});

// ========================================
// MANUFACTURING ORDERS ENDPOINTS
// ========================================

// Get manufacturing orders for a job card
router.get(
  '/:jobCardId/manufacturing-orders',
  authenticate,
  async (req, res) => {
    try {
      const { jobCardId } = req.params;
      
      const result = await db.query(`
        SELECT 
          mo.*,
          m.machine_name,
          m.machine_code,
          m.machine_type,
          m.status as machine_status,
          op.name as operator_name,
          creator.name as created_by_name
        FROM manufacturing_orders mo
        LEFT JOIN machines m ON mo.machine_id = m.id
        LEFT JOIN users op ON mo.assigned_operator = op.id
        LEFT JOIN users creator ON mo.created_by = creator.id
        WHERE mo.job_card_id = $1
        ORDER BY mo.order_sequence ASC
      `, [jobCardId]);
      
      res.json({ data: result.rows });
    } catch (error) {
      console.error('Error fetching manufacturing orders:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Add manufacturing order
router.post(
  '/:jobCardId/manufacturing-orders',
  authenticate,
  denyGuest,
  async (req, res) => {
    try {
      const { jobCardId } = req.params;
      const { machine_id, order_sequence, estimated_duration_minutes, notes } = req.body;
      
      if (!machine_id || order_sequence === undefined) {
        return res.status(400).json({ error: 'Machine and sequence are required' });
      }
      
      // Check if job card exists
      const jobResult = await db.query('SELECT id FROM cnc_job_cards WHERE id = $1', [jobCardId]);
      if (jobResult.rows.length === 0) {
        return res.status(404).json({ error: 'Job card not found' });
      }
      
      // Check if machine exists
      const machineResult = await db.query('SELECT id FROM machines WHERE id = $1', [machine_id]);
      if (machineResult.rows.length === 0) {
        return res.status(404).json({ error: 'Machine not found' });
      }
      
      // Insert manufacturing order
      const result = await db.query(`
        INSERT INTO manufacturing_orders 
        (job_card_id, machine_id, order_sequence, estimated_duration_minutes, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [jobCardId, machine_id, order_sequence, estimated_duration_minutes, notes, req.user.id]);
      
      // Log history
      await db.query(`
        INSERT INTO manufacturing_order_history (manufacturing_order_id, action_type, user_id, notes)
        VALUES ($1, 'created', $2, $3)
      `, [result.rows[0].id, req.user.id, `Added machine to manufacturing sequence`]);
      
      res.status(201).json({ data: result.rows[0] });
    } catch (error) {
      console.error('Error adding manufacturing order:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Update manufacturing order
router.put(
  '/manufacturing-orders/:orderId',
  authenticate,
  denyGuest,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { order_sequence, estimated_duration_minutes, status, quality_check_status, assigned_operator, notes } = req.body;
      
      // Get current order
      const currentResult = await db.query('SELECT * FROM manufacturing_orders WHERE id = $1', [orderId]);
      if (currentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Manufacturing order not found' });
      }
      
      const current = currentResult.rows[0];
      
      // Build update query
      const updates = [];
      const values = [orderId];
      let paramCount = 2;
      
      if (order_sequence !== undefined && order_sequence !== null) {
        updates.push(`order_sequence = $${paramCount}`);
        values.push(order_sequence);
        paramCount++;
      }
      
      if (estimated_duration_minutes !== undefined && estimated_duration_minutes !== null) {
        updates.push(`estimated_duration_minutes = $${paramCount}`);
        values.push(estimated_duration_minutes);
        paramCount++;
      }
      
      if (status) {
        updates.push(`status = $${paramCount}`);
        values.push(status);
        paramCount++;
      }
      
      if (quality_check_status) {
        updates.push(`quality_check_status = $${paramCount}`);
        values.push(quality_check_status);
        paramCount++;
      }
      
      if (assigned_operator !== undefined) {
        updates.push(`assigned_operator = $${paramCount}`);
        values.push(assigned_operator);
        paramCount++;
      }
      
      if (notes !== undefined && notes !== null) {
        updates.push(`notes = $${paramCount}`);
        values.push(notes);
        paramCount++;
      }
      
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      const result = await db.query(`
        UPDATE manufacturing_orders
        SET ${updates.join(', ')}
        WHERE id = $1
        RETURNING *
      `, values);
      
      // Log status change
      if (status && status !== current.status) {
        await db.query(`
          INSERT INTO manufacturing_order_history (manufacturing_order_id, action_type, from_status, to_status, user_id)
          VALUES ($1, 'status_changed', $2, $3, $4)
        `, [orderId, current.status, status, req.user.id]);
      }
      
      res.json({ data: result.rows[0] });
    } catch (error) {
      console.error('Error updating manufacturing order:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete manufacturing order
router.delete(
  '/manufacturing-orders/:orderId',
  authenticate,
  denyGuest,
  requireAdmin,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      
      // Check if order exists
      const result = await db.query('SELECT id FROM manufacturing_orders WHERE id = $1', [orderId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Manufacturing order not found' });
      }
      
      await db.query('DELETE FROM manufacturing_orders WHERE id = $1', [orderId]);
      res.json({ message: 'Manufacturing order deleted' });
    } catch (error) {
      console.error('Error deleting manufacturing order:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Reorder manufacturing sequence
router.post(
  '/:jobCardId/manufacturing-orders/reorder',
  authenticate,
  denyGuest,
  async (req, res) => {
    try {
      const { jobCardId } = req.params;
      const { orders } = req.body; // Array of { id, newSequence }
      
      if (!Array.isArray(orders)) {
        return res.status(400).json({ error: 'Orders must be an array' });
      }
      
      // Update all orders
      for (const order of orders) {
        await db.query(
          'UPDATE manufacturing_orders SET order_sequence = $1 WHERE id = $2',
          [order.newSequence, order.id]
        );
      }
      
      res.json({ message: 'Manufacturing sequence updated' });
    } catch (error) {
      console.error('Error reordering manufacturing orders:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
