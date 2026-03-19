const { Pool } = require('pg');

const adminPool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres', // Connect to default postgres db
  user: 'postgres',
  password: '2452955',
});

const dataPool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'taskflow_db',
  user: 'postgres',
  password: '2452955',
});

async function resetDatabase() {
  try {
    console.log('Step 1: Connecting to PostgreSQL...');
    const client = await adminPool.connect();
    
    console.log('Step 2: Terminating existing connections...');
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = 'taskflow_db'
      AND pid <> pg_backend_pid();
    `);
    
    console.log('Step 3: Dropping database taskflow_db...');
    try {
      await client.query('DROP DATABASE IF EXISTS taskflow_db');
      console.log('✓ Database dropped');
    } catch (err) {
      console.log('✓ Database dropped (or did not exist)');
    }
    
    console.log('Step 4: Creating new database...');
    await client.query('CREATE DATABASE taskflow_db');
    console.log('✓ Database created');
    
    client.release();
    
    console.log('\nStep 5: Initializing schema...');
    const dataClient = await dataPool.connect();
    
    // Create extension
    await dataClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    
    // Create users table
    await dataClient.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'guest')),
        avatar_color VARCHAR(7) DEFAULT '#6366f1',
        is_active BOOLEAN DEFAULT true,
        kanban_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Users table created');
    
    // Create tasks table
    await dataClient.query(`
      CREATE TABLE tasks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'archived')),
        priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        deadline TIMESTAMP NOT NULL,
        extended_deadline TIMESTAMP,
        completion_confirmed BOOLEAN DEFAULT false,
        completion_confirmed_by UUID REFERENCES users(id),
        completion_confirmed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Tasks table created');
    
    // Create task_history table
    await dataClient.query(`
      CREATE TABLE task_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        old_value TEXT,
        new_value TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Task history table created');
    
    // Create deadline_extensions table
    await dataClient.query(`
      CREATE TABLE deadline_extensions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        requested_by UUID REFERENCES users(id),
        previous_deadline TIMESTAMP NOT NULL,
        new_deadline TIMESTAMP NOT NULL,
        reason TEXT,
        approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
        approved_by UUID REFERENCES users(id),
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Deadline extensions table created');
    
    // Create workflows table
    await dataClient.query(`
      CREATE TABLE workflows (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Workflows table created');
    
    // Create workflow_stages table
    await dataClient.query(`
      CREATE TABLE workflow_stages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        stage_order INTEGER NOT NULL,
        color VARCHAR(7) DEFAULT '#6366f1',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Workflow stages table created');
    
    // Create cnc_job_cards table
    await dataClient.query(`
      CREATE TABLE cnc_job_cards (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
        current_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
        job_name VARCHAR(255) NOT NULL,
        job_card_number VARCHAR(100) UNIQUE,
        subjob_card_number VARCHAR(100),
        job_date TIMESTAMP,
        machine_name VARCHAR(255),
        client_name VARCHAR(255),
        part_number VARCHAR(255),
        manufacturing_type VARCHAR(50),
        quantity INTEGER DEFAULT 1,
        estimate_end_date TIMESTAMP,
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(50) DEFAULT 'active',
        notes TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ CNC job cards table created');
    
    // Create cnc_job_card_history table
    await dataClient.query(`
      CREATE TABLE cnc_job_card_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_card_id UUID REFERENCES cnc_job_cards(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        from_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
        to_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ CNC job card history table created');
    
    console.log('\nStep 6: Loading sample data...');
    
    // Insert sample users with bcrypt hashed passwords
    const bcrypt = require('bcryptjs');
    const adminHash = await bcrypt.hash('Admin@123', 12);
    const userHash = await bcrypt.hash('User@123', 12);
    
    // Admin user
    const adminResult = await dataClient.query(
      `INSERT INTO users (name, email, password, role, avatar_color, kanban_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['System Admin', 'admin@taskflow.com', adminHash, 'admin', '#4f46e5', 1]
    );
    const adminId = adminResult.rows[0].id;
    console.log('✓ Admin user created');
    
    // Sample users
    const user1Result = await dataClient.query(
      `INSERT INTO users (name, email, password, role, avatar_color, kanban_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['John Developer', 'john@example.com', userHash, 'user', '#3b82f6', 2]
    );
    const user1Id = user1Result.rows[0].id;
    console.log('✓ User 1 (John) created');
    
    const user2Result = await dataClient.query(
      `INSERT INTO users (name, email, password, role, avatar_color, kanban_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['Sarah Manager', 'sarah@example.com', userHash, 'user', '#ec4899', 3]
    );
    const user2Id = user2Result.rows[0].id;
    console.log('✓ User 2 (Sarah) created');
    
    const user3Result = await dataClient.query(
      `INSERT INTO users (name, email, password, role, avatar_color, kanban_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['Mike Designer', 'mike@example.com', userHash, 'user', '#f59e0b', 4]
    );
    const user3Id = user3Result.rows[0].id;
    console.log('✓ User 3 (Mike) created');
    
    // Sample tasks
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    
    await dataClient.query(
      `INSERT INTO tasks (title, description, assigned_to, created_by, status, priority, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['Design Login Page', 'Create a modern login UI with email/password fields', user3Id, adminId, 'in_progress', 'high', tomorrow]
    );
    console.log('✓ Task 1 created');
    
    await dataClient.query(
      `INSERT INTO tasks (title, description, assigned_to, created_by, status, priority, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['Setup Database', 'Initialize PostgreSQL and create schema', user1Id, adminId, 'completed', 'high', tomorrow]
    );
    console.log('✓ Task 2 created');
    
    await dataClient.query(
      `INSERT INTO tasks (title, description, assigned_to, created_by, status, priority, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['API Integration', 'Connect frontend with backend REST API', user1Id, adminId, 'in_progress', 'medium', nextWeek]
    );
    console.log('✓ Task 3 created');
    
    await dataClient.query(
      `INSERT INTO tasks (title, description, assigned_to, created_by, status, priority, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['Test Suite Setup', 'Write unit and integration tests', user1Id, adminId, 'pending', 'medium', twoWeeks]
    );
    console.log('✓ Task 4 created');
    
    await dataClient.query(
      `INSERT INTO tasks (title, description, assigned_to, created_by, status, priority, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['Documentation', 'Write technical documentation for API', user2Id, adminId, 'pending', 'low', twoWeeks]
    );
    console.log('✓ Task 5 created');
    
    dataClient.release();
    
    console.log('\n✅ DATABASE RESET COMPLETE');
    console.log('════════════════════════════════');
    console.log('\nSample Data Loaded:');
    console.log('  Users: 4 (1 admin + 3 users)');
    console.log('  Tasks: 5 (various statuses)');
    console.log('\nTest Credentials:');
    console.log('  Email: admin@taskflow.com');
    console.log('  Password: Admin@123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetDatabase();
