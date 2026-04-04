const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

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
      'DELETE FROM machine_job_card_templates WHERE id = $1 RETURNING *',
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

module.exports = router;
