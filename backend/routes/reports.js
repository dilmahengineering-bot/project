const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/pdf', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, assigned_to, from_date, to_date } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (status) { where.push(`t.status = $${idx}`); params.push(status); idx++; }
    if (assigned_to) { where.push(`t.assigned_to = $${idx}`); params.push(assigned_to); idx++; }
    if (from_date) { where.push(`t.created_at >= $${idx}`); params.push(from_date); idx++; }
    if (to_date) { where.push(`t.created_at <= $${idx}`); params.push(to_date); idx++; }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const tasks = await db.query(`
      SELECT t.*, u1.name as assigned_name, u2.name as created_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      ${whereClause}
      ORDER BY t.deadline ASC
    `, params);

    const stats = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'archived') as archived,
        COUNT(*) FILTER (WHERE deadline < NOW() AND status NOT IN ('completed','archived')) as overdue
      FROM tasks t ${whereClause}
    `, params);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="taskflow-report-${Date.now()}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill('#1e1b4b');
    doc.fillColor('white').fontSize(24).font('Helvetica-Bold').text('TaskFlow', 50, 25);
    doc.fontSize(10).font('Helvetica').text('Task Management Report', 50, 52);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}`, 350, 40, { align: 'right', width: 200 });

    doc.moveDown(3);

    // Stats summary
    const s = stats.rows[0];
    doc.fillColor('#1e1b4b').fontSize(14).font('Helvetica-Bold').text('Summary', 50, 100);
    doc.moveTo(50, 118).lineTo(545, 118).strokeColor('#e0e7ff').stroke();

    const statItems = [
      { label: 'Total Tasks', value: s.total, color: '#6366f1' },
      { label: 'Pending', value: s.pending, color: '#f59e0b' },
      { label: 'In Progress', value: s.in_progress, color: '#3b82f6' },
      { label: 'Completed', value: s.completed, color: '#10b981' },
      { label: 'Archived', value: s.archived, color: '#6b7280' },
      { label: 'Overdue', value: s.overdue, color: '#ef4444' },
    ];

    let sx = 50;
    statItems.forEach((item, i) => {
      const bx = sx + (i % 3) * 165;
      const by = 128 + Math.floor(i / 3) * 55;
      doc.rect(bx, by, 150, 45).fillAndStroke('#f5f3ff', '#e0e7ff');
      doc.fillColor(item.color).fontSize(20).font('Helvetica-Bold').text(item.value, bx + 10, by + 8, { width: 130, align: 'center' });
      doc.fillColor('#6b7280').fontSize(9).font('Helvetica').text(item.label, bx + 10, by + 30, { width: 130, align: 'center' });
    });

    // Table
    doc.fillColor('#1e1b4b').fontSize(14).font('Helvetica-Bold').text('Task Details', 50, 250);
    doc.moveTo(50, 268).lineTo(545, 268).strokeColor('#e0e7ff').stroke();

    // Table header
    const cols = [200, 100, 120, 80, 80];
    const headers = ['Title', 'Assigned To', 'Deadline', 'Status', 'Priority'];
    let tx = 50;
    doc.rect(50, 272, 495, 20).fill('#ede9fe');
    doc.fillColor('#1e1b4b').fontSize(9).font('Helvetica-Bold');
    headers.forEach((h, i) => {
      doc.text(h, tx + 3, 277, { width: cols[i] - 6 });
      tx += cols[i];
    });

    let ty = 292;
    tasks.rows.forEach((task, rowIdx) => {
      if (ty > 730) { doc.addPage(); ty = 50; }
      if (rowIdx % 2 === 0) doc.rect(50, ty, 495, 18).fill('#faf5ff');
      
      const statusColors = { pending: '#f59e0b', in_progress: '#3b82f6', completed: '#10b981', archived: '#6b7280' };
      const deadline = new Date(task.extended_deadline || task.deadline);
      const isOverdue = deadline < new Date() && !['completed', 'archived'].includes(task.status);

      doc.fillColor('#374151').fontSize(8).font('Helvetica');
      let cx = 50;
      const vals = [
        task.title.substring(0, 35),
        (task.assigned_name || 'Unassigned').substring(0, 18),
        deadline.toLocaleDateString(),
        task.status.replace('_', ' '),
        task.priority
      ];
      vals.forEach((v, i) => {
        if (i === 3) doc.fillColor(statusColors[task.status] || '#374151');
        else if (i === 4 && task.priority === 'high') doc.fillColor('#ef4444');
        else doc.fillColor(isOverdue && i === 2 ? '#ef4444' : '#374151');
        doc.text(v, cx + 3, ty + 5, { width: cols[i] - 6 });
        cx += cols[i];
      });
      ty += 18;
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Dashboard stats
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userFilter = req.user.role !== 'admin' ? `AND (assigned_to = '${req.user.id}' OR created_by = '${req.user.id}')` : '';
    
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'archived') as archived,
        COUNT(*) FILTER (WHERE (extended_deadline IS NOT NULL AND extended_deadline < NOW() OR extended_deadline IS NULL AND deadline < NOW()) AND status NOT IN ('completed','archived')) as overdue,
        COUNT(*) FILTER (WHERE deadline BETWEEN NOW() AND NOW() + INTERVAL '3 days' AND status NOT IN ('completed','archived')) as due_soon
      FROM tasks WHERE 1=1 ${userFilter}
    `);

    const pending_extensions = req.user.role === 'admin'
      ? await db.query("SELECT COUNT(*) as count FROM deadline_extensions WHERE approval_status = 'pending'")
      : { rows: [{ count: 0 }] };

    res.json({ stats: stats.rows[0], pending_extensions: parseInt(pending_extensions.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
