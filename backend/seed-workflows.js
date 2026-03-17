require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'taskflow_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get admin user for created_by
    const adminResult = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (adminResult.rows.length === 0) {
      throw new Error('No admin user found. Please create users first.');
    }
    const adminId = adminResult.rows[0].id;

    // Get regular users for assignment
    const usersResult = await client.query("SELECT id, name FROM users WHERE role = 'user' AND is_active = true ORDER BY name");
    const regularUsers = usersResult.rows;

    console.log(`Found admin: ${adminId}`);
    console.log(`Found ${regularUsers.length} regular users`);

    // ============ WORKFLOW 1: CNC Manufacturing ============
    const wf1 = await client.query(
      `INSERT INTO workflows (name, description, workflow_type, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['CNC Manufacturing', 'Standard CNC machining workflow from raw material to delivery', 'cnc_manufacturing', adminId]
    );
    const wf1Id = wf1.rows[0].id;
    console.log(`Created workflow: CNC Manufacturing (${wf1Id})`);

    const wf1Stages = [
      { name: 'Backlog',            order: 0, color: '#ef4444' },
      { name: 'Material Prep',      order: 1, color: '#f97316' },
      { name: 'CNC Machining',      order: 2, color: '#eab308' },
      { name: 'Quality Inspection',  order: 3, color: '#3b82f6' },
      { name: 'Finishing',          order: 4, color: '#8b5cf6' },
      { name: 'Ready for Delivery', order: 5, color: '#22c55e' },
    ];

    const wf1StageIds = [];
    for (const s of wf1Stages) {
      const r = await client.query(
        `INSERT INTO workflow_stages (workflow_id, stage_name, stage_order, color)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [wf1Id, s.name, s.order, s.color]
      );
      wf1StageIds.push(r.rows[0].id);
      console.log(`  Stage: ${s.name}`);
    }

    // ============ WORKFLOW 2: Sheet Metal Fabrication ============
    const wf2 = await client.query(
      `INSERT INTO workflows (name, description, workflow_type, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Sheet Metal Fabrication', 'Sheet metal cutting, bending, and assembly workflow', 'cnc_manufacturing', adminId]
    );
    const wf2Id = wf2.rows[0].id;
    console.log(`Created workflow: Sheet Metal Fabrication (${wf2Id})`);

    const wf2Stages = [
      { name: 'Backlog',       order: 0, color: '#ef4444' },
      { name: 'Laser Cutting', order: 1, color: '#f97316' },
      { name: 'Bending',       order: 2, color: '#eab308' },
      { name: 'Welding',       order: 3, color: '#06b6d4' },
      { name: 'Painting',      order: 4, color: '#8b5cf6' },
      { name: 'Assembly',      order: 5, color: '#3b82f6' },
      { name: 'QC & Dispatch', order: 6, color: '#22c55e' },
    ];

    const wf2StageIds = [];
    for (const s of wf2Stages) {
      const r = await client.query(
        `INSERT INTO workflow_stages (workflow_id, stage_name, stage_order, color)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [wf2Id, s.name, s.order, s.color]
      );
      wf2StageIds.push(r.rows[0].id);
      console.log(`  Stage: ${s.name}`);
    }

    // ============ CNC JOB CARDS (Workflow 1: CNC Manufacturing) ============
    const cncJobs = [
      {
        job_name: 'Motor Housing Casting',
        job_card_number: 'CNC-2026-001',
        subjob_card_number: 'CNC-2026-001-A',
        machine_name: 'Haas VF-2SS',
        client_name: 'Tata Motors',
        part_number: 'MH-4521-R3',
        manufacturing_type: 'internal',
        quantity: 25,
        priority: 'high',
        stage_index: 2, // CNC Machining
        notes: 'Aluminum 6061-T6, tight tolerance ±0.01mm on bore diameter',
      },
      {
        job_name: 'Hydraulic Valve Block',
        job_card_number: 'CNC-2026-002',
        subjob_card_number: null,
        machine_name: 'DMG Mori NHX 5000',
        client_name: 'Bosch Rexroth',
        part_number: 'HVB-7890-X1',
        manufacturing_type: 'external',
        quantity: 10,
        priority: 'high',
        stage_index: 3, // Quality Inspection
        notes: 'SS316, cross-drilled ports, pressure test required at 350 bar',
      },
      {
        job_name: 'Gear Shaft Assembly',
        job_card_number: 'CNC-2026-003',
        subjob_card_number: 'CNC-2026-003-B',
        machine_name: 'Mazak QT-250',
        client_name: 'Siemens India',
        part_number: 'GS-3344-V2',
        manufacturing_type: 'internal',
        quantity: 50,
        priority: 'medium',
        stage_index: 0, // Backlog
        notes: 'EN24 steel, heat treatment required after machining',
      },
      {
        job_name: 'Pump Impeller',
        job_card_number: 'CNC-2026-004',
        subjob_card_number: null,
        machine_name: 'Haas VF-2SS',
        client_name: 'Kirloskar Pumps',
        part_number: 'PI-5567-M4',
        manufacturing_type: 'internal',
        quantity: 15,
        priority: 'low',
        stage_index: 1, // Material Prep
        notes: 'Bronze casting, 5-axis machining required for blade profile',
      },
      {
        job_name: 'Turbine Blade',
        job_card_number: 'CNC-2026-005',
        subjob_card_number: 'CNC-2026-005-C',
        machine_name: 'DMG Mori NHX 5000',
        client_name: 'BHEL',
        part_number: 'TB-9901-H7',
        manufacturing_type: 'external',
        quantity: 8,
        priority: 'high',
        stage_index: 4, // Finishing
        notes: 'Inconel 718, surface finish Ra 0.4 required',
      },
      {
        job_name: 'Flange Connector',
        job_card_number: 'CNC-2026-006',
        subjob_card_number: null,
        machine_name: 'Mazak QT-250',
        client_name: 'L&T Hydrocarbon',
        part_number: 'FC-2233-P5',
        manufacturing_type: 'internal',
        quantity: 100,
        priority: 'medium',
        stage_index: 5, // Ready for Delivery
        notes: 'ASME B16.5 standard, NDT inspection certificate needed',
      },
    ];

    for (const job of cncJobs) {
      const assignee = regularUsers.length > 0
        ? regularUsers[Math.floor(Math.random() * regularUsers.length)].id
        : null;

      const jobDate = new Date();
      jobDate.setDate(jobDate.getDate() - Math.floor(Math.random() * 14));
      const estEnd = new Date();
      estEnd.setDate(estEnd.getDate() + Math.floor(Math.random() * 30) + 7);

      await client.query(
        `INSERT INTO cnc_job_cards (
          job_name, job_card_number, subjob_card_number, job_date,
          machine_name, client_name, part_number, manufacturing_type,
          quantity, estimate_end_date, workflow_id, current_stage_id,
          assigned_to, created_by, priority, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          job.job_name, job.job_card_number, job.subjob_card_number, jobDate,
          job.machine_name, job.client_name, job.part_number, job.manufacturing_type,
          job.quantity, estEnd, wf1Id, wf1StageIds[job.stage_index],
          assignee, adminId, job.priority, job.notes,
        ]
      );
      console.log(`  Job Card: ${job.job_card_number} - ${job.job_name} → ${wf1Stages[job.stage_index].name}`);
    }

    // ============ CNC JOB CARDS (Workflow 2: Sheet Metal) ============
    const sheetMetalJobs = [
      {
        job_name: 'Control Panel Enclosure',
        job_card_number: 'SM-2026-001',
        subjob_card_number: null,
        machine_name: 'Trumpf TruLaser 3030',
        client_name: 'ABB India',
        part_number: 'CPE-1122-S3',
        manufacturing_type: 'internal',
        quantity: 20,
        priority: 'high',
        stage_index: 1, // Laser Cutting
        notes: 'SS304, 2mm thickness, powder coating RAL 7035',
      },
      {
        job_name: 'HVAC Duct Section',
        job_card_number: 'SM-2026-002',
        subjob_card_number: 'SM-2026-002-A',
        machine_name: 'Amada HFE-1003',
        client_name: 'Blue Star',
        part_number: 'HD-7788-G2',
        manufacturing_type: 'internal',
        quantity: 40,
        priority: 'medium',
        stage_index: 3, // Welding
        notes: 'Galvanized steel 1.2mm, TIG welding required',
      },
      {
        job_name: 'Electrical Bus Bar',
        job_card_number: 'SM-2026-003',
        subjob_card_number: null,
        machine_name: 'Trumpf TruLaser 3030',
        client_name: 'Schneider Electric',
        part_number: 'EBB-4455-C1',
        manufacturing_type: 'external',
        quantity: 60,
        priority: 'high',
        stage_index: 0, // Backlog
        notes: 'Copper busbar, tin plating after fabrication',
      },
      {
        job_name: 'Server Rack Frame',
        job_card_number: 'SM-2026-004',
        subjob_card_number: 'SM-2026-004-B',
        machine_name: 'Amada HFE-1003',
        client_name: 'Dell Technologies',
        part_number: 'SRF-6677-K4',
        manufacturing_type: 'internal',
        quantity: 12,
        priority: 'medium',
        stage_index: 5, // Assembly
        notes: '42U rack, CRCA 1.6mm, black powder coat',
      },
    ];

    for (const job of sheetMetalJobs) {
      const assignee = regularUsers.length > 0
        ? regularUsers[Math.floor(Math.random() * regularUsers.length)].id
        : null;

      const jobDate = new Date();
      jobDate.setDate(jobDate.getDate() - Math.floor(Math.random() * 10));
      const estEnd = new Date();
      estEnd.setDate(estEnd.getDate() + Math.floor(Math.random() * 21) + 7);

      await client.query(
        `INSERT INTO cnc_job_cards (
          job_name, job_card_number, subjob_card_number, job_date,
          machine_name, client_name, part_number, manufacturing_type,
          quantity, estimate_end_date, workflow_id, current_stage_id,
          assigned_to, created_by, priority, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          job.job_name, job.job_card_number, job.subjob_card_number, jobDate,
          job.machine_name, job.client_name, job.part_number, job.manufacturing_type,
          job.quantity, estEnd, wf2Id, wf2StageIds[job.stage_index],
          assignee, adminId, job.priority, job.notes,
        ]
      );
      console.log(`  Job Card: ${job.job_card_number} - ${job.job_name} → ${wf2Stages[job.stage_index].name}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Sample data seeded successfully!');
    console.log(`   2 Workflows, ${wf1Stages.length + wf2Stages.length} Stages, ${cncJobs.length + sheetMetalJobs.length} Job Cards`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
