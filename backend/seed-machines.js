require('dotenv').config();
const db = require('./db');

async function seedMachines() {
  try {
    console.log('⏳ Seeding machines for CNC manufacturing Kanban...\n');

    const machines = [
      { machine_name: 'CNC Mill 01', machine_code: 'CNC-MILL-01', machine_type: 'mill', description: 'Haas UMC-500 CNC Mill' },
      { machine_name: 'CNC Lathe 01', machine_code: 'CNC-LATHE-01', machine_type: 'lathe', description: 'Mazak LX-200 CNC Lathe' },
      { machine_name: 'Drill Press 01', machine_code: 'DRILL-01', machine_type: 'drill', description: 'Industrial Drill Press' },
      { machine_name: 'Surface Grinder', machine_code: 'GRIND-01', machine_type: 'grinder', description: 'Surface Grinding Machine' },
      { machine_name: 'Wire EDM', machine_code: 'EDM-WIRE-01', machine_type: 'edm', description: 'Wire Erosion Machine' },
      { machine_name: 'Laser Cutter', machine_code: 'LASER-01', machine_type: 'laser', description: 'CO2 Laser Cutting System' },
      { machine_name: 'CNC Mill 02', machine_code: 'CNC-MILL-02', machine_type: 'mill', description: 'Haas VF-2 CNC Mill' },
      { machine_name: 'CNC Lathe 02', machine_code: 'CNC-LATHE-02', machine_type: 'lathe', description: 'Okuma LU-300M CNC Lathe' }
    ];

    let createdCount = 0;
    let skippedCount = 0;

    for (const machine of machines) {
      try {
        // Check if machine already exists
        const existCheck = await db.query(
          'SELECT id FROM machines WHERE machine_code = $1',
          [machine.machine_code]
        );

        if (existCheck.rows.length > 0) {
          console.log(`⊘ Machine "${machine.machine_name}" already exists`);
          skippedCount++;
          continue;
        }

        // Insert machine
        await db.query(
          `INSERT INTO machines (machine_name, machine_code, machine_type, description, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [machine.machine_name, machine.machine_code, machine.machine_type, machine.description, 'active']
        );

        console.log(`✓ Created machine: ${machine.machine_name}`);
        createdCount++;
      } catch (err) {
        console.error(`✗ Error creating machine ${machine.machine_name}:`, err.message);
      }
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   Created: ${createdCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding machines:', error.message);
    process.exit(1);
  }
}

seedMachines();
