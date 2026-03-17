const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

// Middleware to check admin role
const adminOnly = requireAdmin;

// Get all workflows
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM workflows WHERE is_active = true ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// Get workflow with stages
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const workflowResult = await db.query(
      'SELECT * FROM workflows WHERE id = $1',
      [id]
    );
    
    if (workflowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const stagesResult = await db.query(
      'SELECT * FROM workflow_stages WHERE workflow_id = $1 ORDER BY stage_order',
      [id]
    );
    
    res.json({
      ...workflowResult.rows[0],
      stages: stagesResult.rows
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

// Create new workflow (Admin only)
router.post(
  '/',
  authenticate,
  requireAdmin,
  async (req, res) => {

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const { name, description, workflow_type, stages } = req.body;

      // Create workflow
      const workflowResult = await client.query(
        `INSERT INTO workflows (name, description, workflow_type, created_by) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, description || null, workflow_type, req.user.id]
      );

      const workflow = workflowResult.rows[0];

      // Create stages
      const createdStages = [];
      for (let i = 0; i < stages.length; i++) {
        const stageResult = await client.query(
          `INSERT INTO workflow_stages (workflow_id, stage_name, stage_order, color) 
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [workflow.id, stages[i].name, i, stages[i].color || '#6366f1']
        );
        createdStages.push(stageResult.rows[0]);
      }

      await client.query('COMMIT');

      res.status(201).json({
        ...workflow,
        stages: createdStages
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating workflow:', error);
      
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Workflow with this name already exists' });
      }
      res.status(500).json({ error: 'Failed to create workflow' });
    } finally {
      client.release();
    }
  }
);

// Update workflow
router.put(
  '/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {

    try {
      const { id } = req.params;
      const { name, description, is_active } = req.body;

      const updateFields = [];
      const updateValues = [id];
      let paramCount = 2;

      if (name) {
        updateFields.push(`name = $${paramCount}`);
        updateValues.push(name);
        paramCount++;
      }
      if (description) {
        updateFields.push(`description = $${paramCount}`);
        updateValues.push(description);
        paramCount++;
      }
      if (is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount}`);
        updateValues.push(is_active);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const result = await db.query(
        `UPDATE workflows SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating workflow:', error);
      res.status(500).json({ error: 'Failed to update workflow' });
    }
  }
);

// Delete workflow (Admin only)
router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Check if workflow is in use
      const inUseResult = await db.query(
        'SELECT COUNT(*) as count FROM cnc_job_cards WHERE workflow_id = $1 AND is_active = true',
        [id]
      );

      if (inUseResult.rows[0].count > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete workflow in use by active job cards. Deactivate it instead.' 
        });
      }

      const result = await db.query(
        'DELETE FROM workflows WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      res.json({ message: 'Workflow deleted successfully' });
    } catch (error) {
      console.error('Error deleting workflow:', error);
      res.status(500).json({ error: 'Failed to delete workflow' });
    }
  }
);

// ==================== STAGES MANAGEMENT ====================

// Get stages for a workflow
router.get('/:id/stages', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT * FROM workflow_stages WHERE workflow_id = $1 AND is_active = true ORDER BY stage_order',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching stages:', error);
    res.status(500).json({ error: 'Failed to fetch stages' });
  }
});

// Add stage to workflow
router.post(
  '/:id/stages',
  authenticate,
  requireAdmin,
  async (req, res) => {

    try {
      const { id } = req.params;
      const { stage_name, stage_order, color } = req.body;

      // Check if workflow exists
      const workflowCheck = await db.query('SELECT id FROM workflows WHERE id = $1', [id]);
      if (workflowCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      // Shift existing stages if needed
      await db.query(
        'UPDATE workflow_stages SET stage_order = stage_order + 1 WHERE workflow_id = $1 AND stage_order >= $2',
        [id, stage_order]
      );

      const result = await db.query(
        `INSERT INTO workflow_stages (workflow_id, stage_name, stage_order, color) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, stage_name, stage_order, color || '#6366f1']
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error adding stage:', error);
      
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Stage with this name already exists in this workflow' });
      }
      res.status(500).json({ error: 'Failed to add stage' });
    }
  }
);

// Update stage
router.put(
  '/stages/:stageId',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { stageId } = req.params;
      const { stage_name, stage_order, color, is_active } = req.body;

      const updateFields = [];
      const updateValues = [stageId];
      let paramCount = 2;

      if (stage_name) {
        updateFields.push(`stage_name = $${paramCount}`);
        updateValues.push(stage_name);
        paramCount++;
      }
      if (stage_order !== undefined) {
        updateFields.push(`stage_order = $${paramCount}`);
        updateValues.push(stage_order);
        paramCount++;
      }
      if (color) {
        updateFields.push(`color = $${paramCount}`);
        updateValues.push(color);
        paramCount++;
      }
      if (is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount}`);
        updateValues.push(is_active);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const result = await db.query(
        `UPDATE workflow_stages SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Stage not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating stage:', error);
      res.status(500).json({ error: 'Failed to update stage' });
    }
  }
);

// Delete stage
router.delete(
  '/stages/:stageId',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { stageId } = req.params;

      // Get the stage to find its workflow
      const stageResult = await db.query('SELECT workflow_id FROM workflow_stages WHERE id = $1', [stageId]);
      if (stageResult.rows.length === 0) {
        return res.status(404).json({ error: 'Stage not found' });
      }

      const workflowId = stageResult.rows[0].workflow_id;

      // Check if stage is in use
      const inUseResult = await db.query(
        'SELECT COUNT(*) as count FROM cnc_job_cards WHERE current_stage_id = $1',
        [stageId]
      );

      if (inUseResult.rows[0].count > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete stage in use by active job cards' 
        });
      }

      // Delete the stage
      await db.query('DELETE FROM workflow_stages WHERE id = $1', [stageId]);

      // Reorder remaining stages
      const remainingStages = await db.query(
        'SELECT id FROM workflow_stages WHERE workflow_id = $1 ORDER BY stage_order',
        [workflowId]
      );

      for (let i = 0; i < remainingStages.rows.length; i++) {
        await db.query(
          'UPDATE workflow_stages SET stage_order = $1 WHERE id = $2',
          [i, remainingStages.rows[i].id]
        );
      }

      res.json({ message: 'Stage deleted successfully' });
    } catch (error) {
      console.error('Error deleting stage:', error);
      res.status(500).json({ error: 'Failed to delete stage' });
    }
  }
);

// Reorder stages (Admin only)
router.post(
  '/:id/stages/reorder',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { stages } = req.body;

      for (let i = 0; i < stages.length; i++) {
        await client.query(
          'UPDATE workflow_stages SET stage_order = $1 WHERE id = $2 AND workflow_id = $3',
          [i, stages[i].id, id]
        );
      }

      await client.query('COMMIT');

      const result = await client.query(
        'SELECT * FROM workflow_stages WHERE workflow_id = $1 ORDER BY stage_order',
        [id]
      );

      res.json(result.rows);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error reordering stages:', error);
      res.status(500).json({ error: 'Failed to reorder stages' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
