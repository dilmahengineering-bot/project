const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const multer = require('multer');

// Use memory storage to avoid file system issues on Render
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/pdf' // .pdf (legacy support)
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only .docx (Word) files are allowed'));
    }
  }
});

// Get all templates (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    console.log('[Templates GET] User:', req.user?.id, 'Role:', req.user?.role);
    
    // First verify the table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'machine_job_card_templates'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('[Templates GET] Table does not exist yet');
      return res.json([]);
    }
    
    const result = await db.query(
      `SELECT id, name, template_content, is_active, is_pdf_based, created_by, created_at
       FROM machine_job_card_templates
       ORDER BY created_at DESC`
    );
    
    console.log('[Templates GET] Found', result.rows.length, 'templates');
    res.json(result.rows);
  } catch (error) {
    console.error('[Templates GET] ERROR:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch templates',
      details: error.message 
    });
  }
});

// Get active template (for PDF generation)
router.get('/active', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, template_content, is_active, is_pdf_based, pdf_template_base64, variables FROM machine_job_card_templates WHERE is_active = true LIMIT 1'
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active template found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching active template:', error.message);
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
    // Prevent deleting if it's the last one
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM machine_job_card_templates'
    );
    if (parseInt(countResult.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last template' });
    }

    const result = await db.query(
      'DELETE FROM machine_job_card_templates WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Upload DOCX template as base64 (admin only)
router.post('/:id/upload-pdf', authenticate, requireAdmin, upload.single('pdf_template'), async (req, res) => {
  try {
    const { id } = req.params;

    console.log('[DOCX Upload] Template ID:', id);
    console.log('[DOCX Upload] File:', req.file ? `${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})` : 'None');

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Convert buffer to base64
    const fileBase64 = req.file.buffer.toString('base64');
    const isDocx = req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    
    console.log('[DOCX Upload] Type:', isDocx ? 'DOCX' : 'PDF', 'Base64 length:', fileBase64.length);

    // Update template with file base64
    const result = await db.query(
      `UPDATE machine_job_card_templates 
       SET pdf_template_base64 = $1, 
           is_pdf_based = true,
           updated_at = NOW()
       WHERE id = $2 RETURNING id, name, is_active, is_pdf_based`,
      [fileBase64, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    console.log('[DOCX Upload] Success!');
    res.json({
      message: 'Template file uploaded successfully',
      template: result.rows[0]
    });
  } catch (error) {
    console.error('[DOCX Upload] Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to upload template file',
      details: error.message 
    });
  }
});

// Download template file (admin only)
router.get('/:id/download-pdf', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, pdf_template_base64, is_pdf_based FROM machine_job_card_templates WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = result.rows[0];

    if (!template.pdf_template_base64 || !template.is_pdf_based) {
      return res.status(404).json({ error: 'No template file uploaded' });
    }

    const fileBuffer = Buffer.from(template.pdf_template_base64, 'base64');

    // Detect if it's a DOCX by checking file signature (PK zip header)
    const isDocx = fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B;
    
    if (isDocx) {
      res.setHeader('Content-Disposition', `attachment; filename="Template-${template.name}.docx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="Template-${template.name}.pdf"`);
      res.setHeader('Content-Type', 'application/pdf');
    }
    
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
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
