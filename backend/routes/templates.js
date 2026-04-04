const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// File upload config for PDF templates
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'templates');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = crypto.randomUUID() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const pdfUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files allowed'));
    }
  }
});

// Get all templates (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, u.name as created_by_name 
       FROM machine_job_card_templates t
       LEFT JOIN users u ON t.created_by = u.id
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get active template (for PDF generation)
router.get('/active', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM machine_job_card_templates WHERE is_active = true LIMIT 1'
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active template found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching active template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Get single template by ID (admin only)
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM machine_job_card_templates WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Create new template (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, template_content, variables } = req.body;

    if (!name || !template_content) {
      return res.status(400).json({ error: 'Name and template content are required' });
    }

    const result = await db.query(
      `INSERT INTO machine_job_card_templates (name, template_content, variables, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, template_content, JSON.stringify(variables || []), req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, template_content, variables, is_active } = req.body;

    // Verify template exists
    const checkResult = await db.query(
      'SELECT id FROM machine_job_card_templates WHERE id = $1',
      [req.params.id]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // If activating this template, deactivate others
    if (is_active === true) {
      await db.query('UPDATE machine_job_card_templates SET is_active = false');
    }

    const result = await db.query(
      `UPDATE machine_job_card_templates 
       SET name = COALESCE($1, name),
           template_content = COALESCE($2, template_content),
           variables = COALESCE($3, variables),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, template_content, JSON.stringify(variables), is_active, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    // Prevent deleting the default template if it's the last one
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM machine_job_card_templates'
    );
    if (parseInt(countResult.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last template' });
    }

    const result = await db.query(
      'SELECT * FROM machine_job_card_templates WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete associated PDF file if exists
    if (result.rows[0].pdf_template_file_path) {
      const filePath = path.join(__dirname, '..', 'uploads', 'templates', result.rows[0].pdf_template_file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await db.query(
      'DELETE FROM machine_job_card_templates WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Upload PDF template (admin only)
router.post('/:id/upload-pdf', authenticate, requireAdmin, pdfUpload.single('pdf_template'), async (req, res) => {
  try {
    const { id } = req.params;

    console.log('[PDF Upload] Template ID:', id);
    console.log('[PDF Upload] File received:', req.file ? { filename: req.file.filename, size: req.file.size } : 'No file');

    // Verify template exists
    const templateResult = await db.query(
      'SELECT * FROM machine_job_card_templates WHERE id = $1',
      [id]
    );

    if (templateResult.rows.length === 0) {
      console.log('[PDF Upload] Template not found:', id);
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          console.warn('[PDF Upload] Failed to clean up uploaded file:', e.message);
        }
      }
      return res.status(404).json({ error: 'Template not found' });
    }

    if (!req.file) {
      console.log('[PDF Upload] No file uploaded');
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const template = templateResult.rows[0];

    // Delete old PDF if exists
    if (template.pdf_template_file_path) {
      try {
        const oldPath = path.join(__dirname, '..', 'uploads', 'templates', template.pdf_template_file_path);
        console.log('[PDF Upload] Checking old file:', oldPath);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
          console.log('[PDF Upload] Deleted old PDF');
        }
      } catch (e) {
        console.warn('[PDF Upload] Warning: Failed to delete old PDF:', e.message);
        // Don't fail if cleanup fails - just log it
      }
    }

    console.log('[PDF Upload] Updating database with new PDF:', req.file.filename);

    // Update template with new PDF - store just filename, not full path
    const result = await db.query(
      `UPDATE machine_job_card_templates 
       SET pdf_template_file_path = $1, 
           is_pdf_based = true,
           updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [req.file.filename, id]
    );

    console.log('[PDF Upload] Database updated successfully');

    res.json({
      message: 'PDF template uploaded successfully',
      template: result.rows[0]
    });
  } catch (error) {
    console.error('[PDF Upload] Error:', error.message, error.stack);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.warn('[PDF Upload] Failed to clean up on error:', e.message);
      }
    }
    res.status(500).json({ error: 'Failed to upload PDF template: ' + error.message });
  }
});

// Download PDF template (admin only)
router.get('/:id/download-pdf', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM machine_job_card_templates WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = result.rows[0];

    if (!template.pdf_template_file_path) {
      return res.status(404).json({ error: 'No PDF template uploaded for this template' });
    }

    const filePath = path.join(__dirname, '..', 'uploads', 'templates', template.pdf_template_file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'PDF file not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="Template-${template.name}.pdf"`);
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error downloading template:', error);
    res.status(500).json({ error: 'Failed to download template' });
  }
});

// Multer error handling middleware
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('[Multer Error]', error.code, error.message);
    if (error.code === 'FILE_TOO_LARGE') {
      return res.status(413).json({ error: 'File too large. Maximum 10MB allowed.' });
    }
    return res.status(400).json({ error: 'File upload error: ' + error.message });
  } else if (error) {
    console.error('[Upload Error]', error.message);
    return res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
  next();
});

module.exports = router;
