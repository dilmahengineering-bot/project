require('dotenv').config();
const db = require('./db');

async function applyMigration() {
  try {
    console.log('⏳ Applying manufacturing orders migration...\n');

    // 0. Create update_updated_at_column function if it doesn't exist
    console.log('Ensuring update_updated_at_column function exists...');
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE 'plpgsql'
    `);
    console.log('✓ Update function ready');

    // 1. Create machines table
    console.log('Creating machines table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS machines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        machine_name VARCHAR(255) NOT NULL,
        machine_code VARCHAR(100) NOT NULL UNIQUE,
        machine_type VARCHAR(50) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Machines table created');

    // 2. Create manufacturing_orders table
    console.log('Creating manufacturing_orders table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS manufacturing_orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_card_id UUID NOT NULL REFERENCES cnc_job_cards(id) ON DELETE CASCADE,
        machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
        order_sequence INTEGER NOT NULL,
        estimated_duration_minutes INTEGER,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
        quality_check_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_check_status IN ('pending', 'passed', 'failed', 'rework')),
        notes TEXT,
        assigned_operator UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Manufacturing orders table created');

    // 3. Create manufacturing_order_history table
    console.log('Creating manufacturing_order_history table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS manufacturing_order_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        manufacturing_order_id UUID NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        from_status VARCHAR(20),
        to_status VARCHAR(20),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Manufacturing order history table created');

    // 4. Create indexes
    console.log('Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_job_card_id ON manufacturing_orders(job_card_id)',
      'CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_machine_id ON manufacturing_orders(machine_id)',
      'CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_sequence ON manufacturing_orders(job_card_id, order_sequence)',
      'CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_status ON manufacturing_orders(status)',
      'CREATE INDEX IF NOT EXISTS idx_manufacturing_order_history_mo_id ON manufacturing_order_history(manufacturing_order_id)',
      'CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status)'
    ];
    for (const idx of indexes) {
      await db.query(idx);
    }
    console.log('✓ Indexes created');

    // 5. Create triggers
    console.log('Creating triggers...');
    try {
      await db.query(`
        CREATE TRIGGER update_machines_updated_at 
        BEFORE UPDATE ON machines 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `);
      console.log('✓ Machines update trigger created');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Machines update trigger already exists');
      } else {
        throw e;
      }
    }

    try {
      await db.query(`
        CREATE TRIGGER update_manufacturing_orders_updated_at 
        BEFORE UPDATE ON manufacturing_orders 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `);
      console.log('✓ Manufacturing orders update trigger created');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Manufacturing orders update trigger already exists');
      } else {
        throw e;
      }
    }

    // 6. Create logging function and trigger
    console.log('Creating manufacturing order logging trigger...');
    await db.query(`
      CREATE OR REPLACE FUNCTION log_manufacturing_order_change()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
          INSERT INTO manufacturing_order_history (manufacturing_order_id, action_type, from_status, to_status)
          VALUES (NEW.id, 'status_changed', OLD.status, NEW.status);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE 'plpgsql'
    `);

    try {
      await db.query(`
        CREATE TRIGGER trg_log_manufacturing_order_change 
        AFTER UPDATE ON manufacturing_orders 
        FOR EACH ROW EXECUTE FUNCTION log_manufacturing_order_change()
      `);
      console.log('✓ Manufacturing order logging trigger created');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Manufacturing order logging trigger already exists');
      } else {
        throw e;
      }
    }

    console.log('\n✅ Manufacturing orders migration completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  }
}

applyMigration();
