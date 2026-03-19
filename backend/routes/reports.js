const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/pdf', authenticate, requireAdmin, async (req, res) => {
  try {

    // Task stats (overall)
    const taskStats = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'archived') as archived,
        COUNT(*) FILTER (WHERE (extended_deadline IS NOT NULL AND extended_deadline < NOW() OR extended_deadline IS NULL AND deadline < NOW()) AND status NOT IN ('completed','archived')) as overdue,
        COUNT(*) FILTER (WHERE deadline BETWEEN NOW() AND NOW() + INTERVAL '3 days' AND status NOT IN ('completed','archived')) as due_soon
      FROM tasks
    `);

    // CNC stats (overall)
    const cncStats = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE estimate_end_date < NOW() AND status = 'active') as overdue,
        COUNT(*) FILTER (WHERE estimate_end_date IS NULL AND status = 'active') as no_deadline,
        COUNT(*) FILTER (WHERE estimate_end_date BETWEEN NOW() AND NOW() + INTERVAL '5 days' AND status = 'active') as due_soon
      FROM cnc_job_cards
    `);

    // Per-user stats
    const userTaskStats = await db.query(`
      SELECT 
        u.id, u.name,
        COUNT(t.id) as task_total,
        COUNT(t.id) FILTER (WHERE t.status = 'pending') as task_pending,
        COUNT(t.id) FILTER (WHERE t.status = 'in_progress') as task_in_progress,
        COUNT(t.id) FILTER (WHERE t.status = 'completed') as task_completed,
        COUNT(t.id) FILTER (WHERE t.status = 'archived') as task_archived,
        COUNT(t.id) FILTER (WHERE (t.extended_deadline IS NOT NULL AND t.extended_deadline < NOW() OR t.extended_deadline IS NULL AND t.deadline < NOW()) AND t.status NOT IN ('completed','archived')) as task_overdue
      FROM users u
      LEFT JOIN tasks t ON t.assigned_to = u.id
      WHERE u.is_active = true AND u.role = 'user'
      GROUP BY u.id, u.name ORDER BY u.name ASC
    `);

    const userCncStats = await db.query(`
      SELECT 
        u.id,
        COUNT(c.id) as cnc_total,
        COUNT(c.id) FILTER (WHERE c.status = 'active') as cnc_active,
        COUNT(c.id) FILTER (WHERE c.status = 'completed') as cnc_completed,
        COUNT(c.id) FILTER (WHERE c.estimate_end_date < NOW() AND c.status = 'active') as cnc_overdue,
        COUNT(c.id) FILTER (WHERE c.estimate_end_date IS NULL AND c.status = 'active') as cnc_no_deadline
      FROM users u
      LEFT JOIN cnc_job_cards c ON c.assigned_to = u.id
      WHERE u.is_active = true AND u.role = 'user'
      GROUP BY u.id
    `);

    const cncMap = {};
    userCncStats.rows.forEach(r => { cncMap[r.id] = r; });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="dilmah-cnc-report-${Date.now()}.pdf"`);
    doc.pipe(res);

    // ── Helper functions ──
    const pageW = doc.page.width;
    const leftM = 50;
    const rightM = pageW - 50;
    const contentW = rightM - leftM;

    function drawHeader() {
      doc.rect(0, 0, pageW, 85).fill('#1e1b4b');
      doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text('Dilmah CNC', leftM, 20);
      doc.fontSize(10).font('Helvetica').text('Comprehensive Report — Tasks & CNC Manufacturing', leftM, 46);
      doc.fontSize(9).text(`Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 330, 30, { align: 'right', width: 215 });
      doc.fontSize(9).text(`Report ID: RPT-${Date.now().toString(36).toUpperCase()}`, 330, 44, { align: 'right', width: 215 });
      return 105;
    }

    function drawSectionTitle(title, y) {
      doc.fillColor('#1e1b4b').fontSize(14).font('Helvetica-Bold').text(title, leftM, y);
      doc.moveTo(leftM, y + 18).lineTo(rightM, y + 18).strokeColor('#c7d2fe').lineWidth(1.5).stroke();
      return y + 28;
    }

    function drawStatBox(x, y, w, h, value, label, color, bgColor) {
      doc.rect(x, y, w, h).fillAndStroke(bgColor, '#e0e7ff');
      doc.fillColor(color).fontSize(18).font('Helvetica-Bold').text(String(value || 0), x + 4, y + 6, { width: w - 8, align: 'center' });
      doc.fillColor('#6b7280').fontSize(8).font('Helvetica').text(label, x + 4, y + 27, { width: w - 8, align: 'center' });
      return y + h;
    }

    function drawProgressBar(x, y, w, label, pct, color) {
      doc.fillColor('#374151').fontSize(9).font('Helvetica').text(label, x, y);
      doc.fillColor(color).fontSize(9).font('Helvetica-Bold').text(pct + '%', x + w - 40, y, { width: 40, align: 'right' });
      doc.rect(x, y + 14, w, 7).fill('#e5e7eb');
      if (pct > 0) doc.rect(x, y + 14, w * pct / 100, 7).fill(color);
      return y + 28;
    }

    function checkPage(y, needed) {
      if (y + needed > 750) { doc.addPage(); return drawHeader(); }
      return y;
    }

    // ══════════════════════════════════════════════════════════
    // PAGE 1: Overall Summary
    // ══════════════════════════════════════════════════════════
    let y = drawHeader();
    const ts = taskStats.rows[0];
    const cs = cncStats.rows[0];

    // ── Task Summary ──
    y = drawSectionTitle('Tasks Overview', y);
    const taskItems = [
      { label: 'Total', value: ts.total, color: '#6366f1', bg: '#f5f3ff' },
      { label: 'Pending', value: ts.pending, color: '#d97706', bg: '#fffbeb' },
      { label: 'In Progress', value: ts.in_progress, color: '#2563eb', bg: '#eff6ff' },
      { label: 'Completed', value: ts.completed, color: '#059669', bg: '#ecfdf5' },
      { label: 'Overdue', value: ts.overdue, color: '#dc2626', bg: '#fef2f2' },
      { label: 'Due Soon', value: ts.due_soon, color: '#7c3aed', bg: '#f5f3ff' },
    ];
    const boxW = (contentW - 25) / 6;
    taskItems.forEach((item, i) => {
      drawStatBox(leftM + i * (boxW + 5), y, boxW, 40, item.value, item.label, item.color, item.bg);
    });
    y += 52;

    // Task health progress bars
    const taskTotal = parseInt(ts.total) || 1;
    const taskCompRate = Math.round((parseInt(ts.completed) + parseInt(ts.archived)) / taskTotal * 100);
    const taskOverdueRate = Math.round(parseInt(ts.overdue) / taskTotal * 100);
    const taskActiveRate = Math.round(parseInt(ts.in_progress) / taskTotal * 100);

    y = drawProgressBar(leftM, y, contentW, 'Task Completion Rate', taskCompRate, '#059669');
    y = drawProgressBar(leftM, y, contentW, 'Task Overdue Rate', taskOverdueRate, '#dc2626');
    y = drawProgressBar(leftM, y, contentW, 'Task Active Rate', taskActiveRate, '#2563eb');
    y += 10;

    // ── CNC Summary ──
    y = drawSectionTitle('CNC Job Cards Overview', y);
    const cncItems = [
      { label: 'Total', value: cs.total, color: '#6366f1', bg: '#f5f3ff' },
      { label: 'Active', value: cs.active, color: '#2563eb', bg: '#eff6ff' },
      { label: 'Completed', value: cs.completed, color: '#059669', bg: '#ecfdf5' },
      { label: 'Overdue', value: cs.overdue, color: '#dc2626', bg: '#fef2f2' },
      { label: 'Due <=5 Days', value: cs.due_soon, color: '#7c3aed', bg: '#f5f3ff' },
      { label: 'No Deadline', value: cs.no_deadline, color: '#6b7280', bg: '#f3f4f6' },
    ];
    cncItems.forEach((item, i) => {
      drawStatBox(leftM + i * (boxW + 5), y, boxW, 40, item.value, item.label, item.color, item.bg);
    });
    y += 52;

    // CNC health progress bars
    const cncTotal = parseInt(cs.total) || 1;
    const cncCompRate = Math.round(parseInt(cs.completed) / cncTotal * 100);
    const cncOverdueRate = Math.round(parseInt(cs.overdue) / cncTotal * 100);
    const cncActiveRate = Math.round(parseInt(cs.active) / cncTotal * 100);

    y = drawProgressBar(leftM, y, contentW, 'CNC Completion Rate', cncCompRate, '#059669');
    y = drawProgressBar(leftM, y, contentW, 'CNC Overdue Rate', cncOverdueRate, '#dc2626');
    y = drawProgressBar(leftM, y, contentW, 'CNC Active Rate', cncActiveRate, '#2563eb');
    y += 15;

    // ══════════════════════════════════════════════════════════
    // SECTION: Per-User Performance
    // ══════════════════════════════════════════════════════════
    y = checkPage(y, 60);
    y = drawSectionTitle('User Performance Breakdown', y);

    userTaskStats.rows.forEach((user) => {
      const cnc = cncMap[user.id] || {};
      const uTaskTotal = parseInt(user.task_total) || 0;
      const uCncTotal = parseInt(cnc.cnc_total || 0);
      const uTaskOverdue = parseInt(user.task_overdue) || 0;
      const uCncOverdue = parseInt(cnc.cnc_overdue || 0);

      // Each user block needs ~85px
      y = checkPage(y, 90);

      // User name row with background
      doc.rect(leftM, y, contentW, 22).fill('#ede9fe');
      doc.fillColor('#1e1b4b').fontSize(11).font('Helvetica-Bold').text(user.name, leftM + 10, y + 5);

      // Badges on right side
      let badgeX = rightM - 10;
      if (uTaskOverdue + uCncOverdue > 0) {
        const oBadge = `${uTaskOverdue + uCncOverdue} Overdue`;
        const oW = doc.widthOfString(oBadge) + 14;
        badgeX -= oW;
        doc.rect(badgeX, y + 3, oW, 16).fill('#fee2e2');
        doc.fillColor('#dc2626').fontSize(8).font('Helvetica-Bold').text(oBadge, badgeX + 7, y + 7);
        badgeX -= 6;
      }
      const cBadge = `${uCncTotal} CNC`;
      const cW = doc.widthOfString(cBadge) + 14;
      badgeX -= cW;
      doc.rect(badgeX, y + 3, cW, 16).fill('#dbeafe');
      doc.fillColor('#2563eb').fontSize(8).font('Helvetica-Bold').text(cBadge, badgeX + 7, y + 7);
      badgeX -= 6;

      const tBadge = `${uTaskTotal} Tasks`;
      const tW = doc.widthOfString(tBadge) + 14;
      badgeX -= tW;
      doc.rect(badgeX, y + 3, tW, 16).fill('#f5f3ff');
      doc.fillColor('#6366f1').fontSize(8).font('Helvetica-Bold').text(tBadge, badgeX + 7, y + 7);

      y += 28;

      // Two columns: Task stats | CNC stats
      const colW = (contentW - 20) / 2;
      const col1X = leftM;
      const col2X = leftM + colW + 20;
      let y1 = y, y2 = y;

      // Task column
      doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text('Tasks', col1X, y1);
      y1 += 14;
      if (uTaskTotal === 0) {
        doc.fillColor('#9ca3af').fontSize(8).font('Helvetica').text('No tasks assigned', col1X, y1);
        y1 += 14;
      } else {
        [
          { label: 'Pending', val: parseInt(user.task_pending), color: '#f59e0b' },
          { label: 'In Progress', val: parseInt(user.task_in_progress), color: '#3b82f6' },
          { label: 'Completed', val: parseInt(user.task_completed), color: '#10b981' },
          { label: 'Overdue', val: parseInt(user.task_overdue), color: '#ef4444' },
        ].forEach(item => {
          doc.fillColor('#6b7280').fontSize(8).font('Helvetica').text(item.label, col1X, y1);
          doc.fillColor(item.color).fontSize(8).font('Helvetica-Bold').text(String(item.val), col1X + 60, y1);
          // Mini bar
          const barX = col1X + 80;
          const barW = colW - 80;
          doc.rect(barX, y1 + 1, barW, 6).fill('#e5e7eb');
          if (item.val > 0) doc.rect(barX, y1 + 1, barW * item.val / uTaskTotal, 6).fill(item.color);
          y1 += 12;
        });
        const compPct = Math.round((parseInt(user.task_completed) + parseInt(user.task_archived)) / uTaskTotal * 100);
        doc.fillColor('#059669').fontSize(8).font('Helvetica-Bold').text(`Completion: ${compPct}%`, col1X, y1);
        y1 += 14;
      }

      // CNC column
      doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text('CNC Jobs', col2X, y2);
      y2 += 14;
      if (uCncTotal === 0) {
        doc.fillColor('#9ca3af').fontSize(8).font('Helvetica').text('No CNC jobs assigned', col2X, y2);
        y2 += 14;
      } else {
        [
          { label: 'Active', val: parseInt(cnc.cnc_active || 0), color: '#3b82f6' },
          { label: 'Completed', val: parseInt(cnc.cnc_completed || 0), color: '#10b981' },
          { label: 'Overdue', val: parseInt(cnc.cnc_overdue || 0), color: '#ef4444' },
          { label: 'No Deadline', val: parseInt(cnc.cnc_no_deadline || 0), color: '#9ca3af' },
        ].forEach(item => {
          doc.fillColor('#6b7280').fontSize(8).font('Helvetica').text(item.label, col2X, y2);
          doc.fillColor(item.color).fontSize(8).font('Helvetica-Bold').text(String(item.val), col2X + 65, y2);
          const barX = col2X + 85;
          const barW = colW - 85;
          doc.rect(barX, y2 + 1, barW, 6).fill('#e5e7eb');
          if (item.val > 0) doc.rect(barX, y2 + 1, barW * item.val / uCncTotal, 6).fill(item.color);
          y2 += 12;
        });
        const compPct = Math.round(parseInt(cnc.cnc_completed || 0) / uCncTotal * 100);
        doc.fillColor('#059669').fontSize(8).font('Helvetica-Bold').text(`Completion: ${compPct}%`, col2X, y2);
        y2 += 14;
      }

      y = Math.max(y1, y2) + 8;
      // Separator line
      doc.moveTo(leftM, y).lineTo(rightM, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      y += 10;
    });

    // Footer on last page
    y = Math.max(y + 20, 720);
    if (y > 750) { doc.addPage(); y = 50; }
    doc.moveTo(leftM, y).lineTo(rightM, y).strokeColor('#c7d2fe').lineWidth(1).stroke();
    doc.fillColor('#9ca3af').fontSize(8).font('Helvetica').text('Dilmah CNC — Confidential Report', leftM, y + 6);
    doc.text(`Page ${doc.bufferedPageRange().count}`, rightM - 80, y + 6, { width: 80, align: 'right' });

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

    // CNC stats
    const cncFilter = req.user.role !== 'admin' ? `AND assigned_to = '${req.user.id}'` : '';
    const cncStats = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE estimate_end_date < NOW() AND status = 'active') as overdue,
        COUNT(*) FILTER (WHERE estimate_end_date IS NULL AND status = 'active') as no_deadline,
        COUNT(*) FILTER (WHERE estimate_end_date BETWEEN NOW() AND NOW() + INTERVAL '5 days' AND status = 'active') as due_soon,
        COUNT(*) FILTER (WHERE status = 'active' AND estimate_end_date IS NOT NULL) as with_deadline
      FROM cnc_job_cards WHERE 1=1 ${cncFilter}
    `);

    const cncPendingExt = req.user.role === 'admin'
      ? await db.query("SELECT COUNT(*) as count FROM cnc_deadline_extensions WHERE approval_status = 'pending'")
      : { rows: [{ count: 0 }] };

    res.json({ 
      stats: stats.rows[0], 
      pending_extensions: parseInt(pending_extensions.rows[0].count),
      cnc_stats: cncStats.rows[0],
      cnc_pending_extensions: parseInt(cncPendingExt.rows[0].count)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Individual User Report PDF (admin only)
router.get('/user-pdf/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Get user info
    const userRes = await db.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRes.rows[0];

    // User's tasks
    const tasks = await db.query(`
      SELECT t.*, u2.name as created_name
      FROM tasks t
      LEFT JOIN users u2 ON t.created_by = u2.id
      WHERE t.assigned_to = $1
      ORDER BY t.deadline ASC
    `, [userId]);

    // User's task stats
    const taskStats = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'archived') as archived,
        COUNT(*) FILTER (WHERE (extended_deadline IS NOT NULL AND extended_deadline < NOW() OR extended_deadline IS NULL AND deadline < NOW()) AND status NOT IN ('completed','archived')) as overdue
      FROM tasks WHERE assigned_to = $1
    `, [userId]);

    // User's CNC job cards
    const cncJobs = await db.query(`
      SELECT c.*, w.name as workflow_name, ws.name as stage_name
      FROM cnc_job_cards c
      LEFT JOIN workflows w ON c.workflow_id = w.id
      LEFT JOIN workflow_stages ws ON c.current_stage_id = ws.id
      WHERE c.assigned_to = $1
      ORDER BY c.created_at DESC
    `, [userId]);

    // User's CNC stats
    const cncStats = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE estimate_end_date < NOW() AND status = 'active') as overdue,
        COUNT(*) FILTER (WHERE estimate_end_date IS NULL AND status = 'active') as no_deadline
      FROM cnc_job_cards WHERE assigned_to = $1
    `, [userId]);

    // Procurement summary — jobs with procurement data
    const procurement = await db.query(`
      SELECT job_card_number, job_name, material, item_code, dimension, pr_number, po_number, estimated_delivery_date, client_name, quantity
      FROM cnc_job_cards
      WHERE assigned_to = $1 AND (material IS NOT NULL OR item_code IS NOT NULL OR pr_number IS NOT NULL OR po_number IS NOT NULL)
      ORDER BY created_at DESC
    `, [userId]);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="user-report-${user.name.replace(/\s+/g, '-')}-${Date.now()}.pdf"`);
    doc.pipe(res);

    const pageW = doc.page.width;
    const leftM = 50;
    const rightM = pageW - 50;
    const contentW = rightM - leftM;

    function drawHeader(subtitle) {
      doc.rect(0, 0, pageW, 85).fill('#1e1b4b');
      doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text('Dilmah CNC', leftM, 20);
      doc.fontSize(10).font('Helvetica').text(subtitle || `Individual Report — ${user.name}`, leftM, 46);
      doc.fontSize(9).text(`Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 330, 30, { align: 'right', width: 215 });
      doc.fontSize(9).text(user.email, 330, 44, { align: 'right', width: 215 });
      return 105;
    }

    function drawSectionTitle(title, y) {
      doc.fillColor('#1e1b4b').fontSize(14).font('Helvetica-Bold').text(title, leftM, y);
      doc.moveTo(leftM, y + 18).lineTo(rightM, y + 18).strokeColor('#c7d2fe').lineWidth(1.5).stroke();
      return y + 28;
    }

    function drawStatBox(x, y, w, h, value, label, color, bgColor) {
      doc.rect(x, y, w, h).fillAndStroke(bgColor, '#e0e7ff');
      doc.fillColor(color).fontSize(18).font('Helvetica-Bold').text(String(value || 0), x + 4, y + 6, { width: w - 8, align: 'center' });
      doc.fillColor('#6b7280').fontSize(8).font('Helvetica').text(label, x + 4, y + 27, { width: w - 8, align: 'center' });
    }

    function checkPage(y, needed) {
      if (y + needed > 750) { doc.addPage(); return drawHeader(); }
      return y;
    }

    function drawFooter(y) {
      y = Math.max(y + 15, 720);
      if (y > 750) { doc.addPage(); y = 50; }
      doc.moveTo(leftM, y).lineTo(rightM, y).strokeColor('#c7d2fe').lineWidth(1).stroke();
      doc.fillColor('#9ca3af').fontSize(8).font('Helvetica').text('Dilmah CNC — Confidential User Report', leftM, y + 6);
    }

    // ══════════════════════════════════════════════════════════
    // PAGE 1: User Summary Stats
    // ══════════════════════════════════════════════════════════
    let y = drawHeader();
    const ts = taskStats.rows[0];
    const cs = cncStats.rows[0];

    // Task stats boxes
    y = drawSectionTitle('Task Summary', y);
    const boxW = (contentW - 25) / 6;
    [
      { label: 'Total', value: ts.total, color: '#6366f1', bg: '#f5f3ff' },
      { label: 'Pending', value: ts.pending, color: '#d97706', bg: '#fffbeb' },
      { label: 'In Progress', value: ts.in_progress, color: '#2563eb', bg: '#eff6ff' },
      { label: 'Completed', value: ts.completed, color: '#059669', bg: '#ecfdf5' },
      { label: 'Archived', value: ts.archived, color: '#6b7280', bg: '#f3f4f6' },
      { label: 'Overdue', value: ts.overdue, color: '#dc2626', bg: '#fef2f2' },
    ].forEach((item, i) => {
      drawStatBox(leftM + i * (boxW + 5), y, boxW, 40, item.value, item.label, item.color, item.bg);
    });
    y += 54;

    // CNC stats boxes
    y = drawSectionTitle('CNC Job Card Summary', y);
    [
      { label: 'Total', value: cs.total, color: '#6366f1', bg: '#f5f3ff' },
      { label: 'Active', value: cs.active, color: '#2563eb', bg: '#eff6ff' },
      { label: 'Completed', value: cs.completed, color: '#059669', bg: '#ecfdf5' },
      { label: 'Overdue', value: cs.overdue, color: '#dc2626', bg: '#fef2f2' },
      { label: 'No Deadline', value: cs.no_deadline, color: '#6b7280', bg: '#f3f4f6' },
    ].forEach((item, i) => {
      drawStatBox(leftM + i * (boxW + 5), y, boxW, 40, item.value, item.label, item.color, item.bg);
    });
    y += 60;

    // ══════════════════════════════════════════════════════════
    // SECTION: Task Details Table
    // ══════════════════════════════════════════════════════════
    y = checkPage(y, 60);
    y = drawSectionTitle('Task Details', y);

    if (tasks.rows.length === 0) {
      doc.fillColor('#9ca3af').fontSize(10).font('Helvetica').text('No tasks assigned to this user.', leftM, y);
      y += 20;
    } else {
      const tCols = [170, 110, 85, 75, 55];
      const tHeaders = ['Title', 'Created By', 'Deadline', 'Status', 'Priority'];
      doc.rect(leftM, y, contentW, 20).fill('#ede9fe');
      doc.fillColor('#1e1b4b').fontSize(9).font('Helvetica-Bold');
      let tx = leftM;
      tHeaders.forEach((h, i) => { doc.text(h, tx + 4, y + 5, { width: tCols[i] - 8 }); tx += tCols[i]; });
      y += 22;

      const statusColors = { pending: '#f59e0b', in_progress: '#3b82f6', completed: '#10b981', archived: '#6b7280' };
      tasks.rows.forEach((task, rowIdx) => {
        y = checkPage(y, 20);
        if (rowIdx % 2 === 0) doc.rect(leftM, y, contentW, 18).fill('#faf5ff');
        const deadline = new Date(task.extended_deadline || task.deadline);
        const isOverdue = deadline < new Date() && !['completed', 'archived'].includes(task.status);
        doc.fillColor('#374151').fontSize(8).font('Helvetica');
        let cx = leftM;
        [
          task.title.substring(0, 28),
          (task.created_name || '-').substring(0, 18),
          deadline.toLocaleDateString(),
          task.status.replace('_', ' '),
          task.priority
        ].forEach((v, i) => {
          if (i === 3) doc.fillColor(statusColors[task.status] || '#374151');
          else if (i === 4 && task.priority === 'high') doc.fillColor('#ef4444');
          else doc.fillColor(isOverdue && i === 2 ? '#ef4444' : '#374151');
          doc.text(v, cx + 4, y + 5, { width: tCols[i] - 8 });
          cx += tCols[i];
        });
        y += 18;
      });
    }
    y += 10;

    // ══════════════════════════════════════════════════════════
    // SECTION: CNC Job Card Details Table
    // ══════════════════════════════════════════════════════════
    y = checkPage(y, 60);
    y = drawSectionTitle('CNC Job Card Details', y);

    if (cncJobs.rows.length === 0) {
      doc.fillColor('#9ca3af').fontSize(10).font('Helvetica').text('No CNC job cards assigned to this user.', leftM, y);
      y += 20;
    } else {
      const cCols = [85, 110, 80, 80, 70, 70];
      const cHeaders = ['Job Card #', 'Job Name', 'Client', 'Stage', 'Status', 'End Date'];
      doc.rect(leftM, y, contentW, 20).fill('#dbeafe');
      doc.fillColor('#1e1b4b').fontSize(9).font('Helvetica-Bold');
      let jx = leftM;
      cHeaders.forEach((h, i) => { doc.text(h, jx + 4, y + 5, { width: cCols[i] - 8 }); jx += cCols[i]; });
      y += 22;

      cncJobs.rows.forEach((job, rowIdx) => {
        y = checkPage(y, 20);
        if (rowIdx % 2 === 0) doc.rect(leftM, y, contentW, 18).fill('#eff6ff');
        const endDate = job.estimate_end_date ? new Date(job.estimate_end_date).toLocaleDateString() : 'None';
        const isOverdue = job.estimate_end_date && new Date(job.estimate_end_date) < new Date() && job.status === 'active';
        doc.fillColor('#374151').fontSize(8).font('Helvetica');
        let cx = leftM;
        [
          (job.job_card_number || '-').substring(0, 14),
          (job.job_name || '-').substring(0, 18),
          (job.client_name || '-').substring(0, 12),
          (job.stage_name || '-').substring(0, 12),
          job.status,
          endDate
        ].forEach((v, i) => {
          if (i === 4) doc.fillColor(job.status === 'completed' ? '#059669' : '#2563eb');
          else if (i === 5 && isOverdue) doc.fillColor('#ef4444');
          else doc.fillColor('#374151');
          doc.text(v, cx + 4, y + 5, { width: cCols[i] - 8 });
          cx += cCols[i];
        });
        y += 18;
      });
    }
    y += 10;

    // ══════════════════════════════════════════════════════════
    // SECTION: Procurement Summary
    // ══════════════════════════════════════════════════════════
    y = checkPage(y, 60);
    y = drawSectionTitle('Procurement Summary', y);

    if (procurement.rows.length === 0) {
      doc.fillColor('#9ca3af').fontSize(10).font('Helvetica').text('No procurement data available for this user.', leftM, y);
      y += 20;
    } else {
      const pCols = [75, 70, 75, 70, 65, 65, 75];
      const pHeaders = ['Job Card #', 'Material', 'Dimension', 'Item Code', 'PR No.', 'PO No.', 'Est. Delivery'];
      doc.rect(leftM, y, contentW, 20).fill('#ecfdf5');
      doc.fillColor('#1e1b4b').fontSize(8).font('Helvetica-Bold');
      let px = leftM;
      pHeaders.forEach((h, i) => { doc.text(h, px + 3, y + 5, { width: pCols[i] - 6 }); px += pCols[i]; });
      y += 22;

      procurement.rows.forEach((item, rowIdx) => {
        y = checkPage(y, 20);
        if (rowIdx % 2 === 0) doc.rect(leftM, y, contentW, 18).fill('#f0fdf4');
        doc.fillColor('#374151').fontSize(7).font('Helvetica');
        let cx = leftM;
        [
          (item.job_card_number || '-').substring(0, 12),
          (item.material || '-').substring(0, 12),
          (item.dimension || '-').substring(0, 12),
          (item.item_code || '-').substring(0, 11),
          (item.pr_number || '-').substring(0, 10),
          (item.po_number || '-').substring(0, 10),
          item.estimated_delivery_date ? new Date(item.estimated_delivery_date).toLocaleDateString() : '-'
        ].forEach((v, i) => {
          doc.text(v, cx + 3, y + 5, { width: pCols[i] - 6 });
          cx += pCols[i];
        });
        y += 18;
      });
    }

    drawFooter(y);
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate user report' });
  }
});

// Per-user stats for both Tasks and CNC (admin only)
router.get('/user-stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const userTaskStats = await db.query(`
      SELECT 
        u.id, u.name, u.email, u.avatar_color,
        COUNT(t.id) as task_total,
        COUNT(t.id) FILTER (WHERE t.status = 'pending') as task_pending,
        COUNT(t.id) FILTER (WHERE t.status = 'in_progress') as task_in_progress,
        COUNT(t.id) FILTER (WHERE t.status = 'completed') as task_completed,
        COUNT(t.id) FILTER (WHERE t.status = 'archived') as task_archived,
        COUNT(t.id) FILTER (WHERE (t.extended_deadline IS NOT NULL AND t.extended_deadline < NOW() OR t.extended_deadline IS NULL AND t.deadline < NOW()) AND t.status NOT IN ('completed','archived')) as task_overdue
      FROM users u
      LEFT JOIN tasks t ON t.assigned_to = u.id
      WHERE u.is_active = true AND u.role = 'user'
      GROUP BY u.id, u.name, u.email, u.avatar_color
      ORDER BY u.name ASC
    `);

    const userCncStats = await db.query(`
      SELECT 
        u.id,
        COUNT(c.id) as cnc_total,
        COUNT(c.id) FILTER (WHERE c.status = 'active') as cnc_active,
        COUNT(c.id) FILTER (WHERE c.status = 'completed') as cnc_completed,
        COUNT(c.id) FILTER (WHERE c.estimate_end_date < NOW() AND c.status = 'active') as cnc_overdue,
        COUNT(c.id) FILTER (WHERE c.estimate_end_date IS NULL AND c.status = 'active') as cnc_no_deadline
      FROM users u
      LEFT JOIN cnc_job_cards c ON c.assigned_to = u.id
      WHERE u.is_active = true AND u.role = 'user'
      GROUP BY u.id
    `);

    // Merge task and CNC stats per user
    const cncMap = {};
    userCncStats.rows.forEach(r => { cncMap[r.id] = r; });

    const userStats = userTaskStats.rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar_color: u.avatar_color,
      tasks: {
        total: parseInt(u.task_total),
        pending: parseInt(u.task_pending),
        in_progress: parseInt(u.task_in_progress),
        completed: parseInt(u.task_completed),
        archived: parseInt(u.task_archived),
        overdue: parseInt(u.task_overdue),
      },
      cnc: {
        total: parseInt(cncMap[u.id]?.cnc_total || 0),
        active: parseInt(cncMap[u.id]?.cnc_active || 0),
        completed: parseInt(cncMap[u.id]?.cnc_completed || 0),
        overdue: parseInt(cncMap[u.id]?.cnc_overdue || 0),
        no_deadline: parseInt(cncMap[u.id]?.cnc_no_deadline || 0),
      }
    }));

    res.json({ user_stats: userStats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

module.exports = router;
