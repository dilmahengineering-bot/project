require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./db');
const bcrypt = require('bcryptjs');
const http = require('http');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', credentials: true },
  transports: ['websocket', 'polling']
});

// Socket.io JWT authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// Store active socket connections per user
const userSockets = new Map();

io.on('connection', (socket) => {
  const userId = socket.user.id;
  if (!userSockets.has(userId)) {
    userSockets.set(userId, []);
  }
  userSockets.get(userId).push(socket.id);
  
  console.log(`✅ User ${socket.user.name} connected (${socket.id})`);

  socket.on('disconnect', () => {
    const sockets = userSockets.get(userId) || [];
    userSockets.set(userId, sockets.filter(id => id !== socket.id));
    if (userSockets.get(userId).length === 0) {
      userSockets.delete(userId);
    }
    console.log(`👋 User ${socket.user.name} disconnected`);
  });

  // CNC Job Card events
  socket.on('cnc-job-card:created', (data) => {
    io.emit('cnc-job-card:created', data);
    console.log(`📋 New CNC job card created: ${data.job_card_number}`);
  });

  socket.on('cnc-job-card:updated', (data) => {
    io.emit('cnc-job-card:updated', data);
    console.log(`✏️ CNC job card updated: ${data.id}`);
  });

  socket.on('cnc-job-card:stage-moved', (data) => {
    io.emit('cnc-job-card:stage-moved', data);
    console.log(`🔄 CNC job card moved to stage: ${data.stage_name}`);
  });

  socket.on('cnc-job-card:completed', (data) => {
    io.emit('cnc-job-card:completed', data);
    console.log(`✅ CNC job card completed: ${data.id}`);
  });

  socket.on('workflow:updated', (data) => {
    io.emit('workflow:updated', data);
    console.log(`🔧 Workflow updated: ${data.id}`);
  });
});

// Make io accessible to routes
app.locals.io = io;
app.locals.userSockets = userSockets;

app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ 
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://123.231.13.189:3000',
      'https://taskflow-frontend.onrender.com'
    ];
    if (!origin || allowedOrigins.includes(origin) || (origin && origin.endsWith('.onrender.com'))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true 
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Request logging for debugging
app.use((req, res, next) => {
  if (req.path.includes('bulk-import')) {
    console.log('\n=== BULK IMPORT REQUEST ===');
    console.log('Path:', req.path);
    console.log('Content-Type:', req.get('content-type'));
    console.log('Headers:', req.headers);
    console.log('Method:', req.method);
  }
  next();
});

// Logging for file uploads
app.use((req, res, next) => {
  if (req.is('multipart/form-data')) {
    console.log(`📤 Multipart request: ${req.method} ${req.path}`);
    console.log('   Content-Type:', req.get('content-type'));
  }
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/workflows', require('./routes/workflows'));
app.use('/api/cnc-jobs', require('./routes/cnc-jobs'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Initialize DB and seed admin
const initDB = async () => {
  try {
    // Create tables
    await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
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
    await db.query(`
      CREATE TABLE IF NOT EXISTS tasks (
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
    await db.query(`
      CREATE TABLE IF NOT EXISTS task_history (
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
    await db.query(`
      CREATE TABLE IF NOT EXISTS deadline_extensions (
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

    // Workflows table for CNC manufacturing
    await db.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        workflow_type VARCHAR(50) DEFAULT 'cnc_manufacturing',
        is_active BOOLEAN DEFAULT true,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Add missing columns if table already exists
    await db.query(`ALTER TABLE workflows ADD COLUMN IF NOT EXISTS workflow_type VARCHAR(50) DEFAULT 'cnc_manufacturing'`).catch(() => {});
    await db.query(`ALTER TABLE workflows ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`).catch(() => {});

    // Workflow stages table
    await db.query(`
      CREATE TABLE IF NOT EXISTS workflow_stages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
        stage_name VARCHAR(255) NOT NULL,
        stage_order INTEGER NOT NULL,
        color VARCHAR(7) DEFAULT '#6366f1',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Rename column if table already exists with old name
    await db.query(`ALTER TABLE workflow_stages RENAME COLUMN name TO stage_name`).catch(() => {});
    await db.query(`ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => {});

    // CNC Job Cards table
    await db.query(`
      CREATE TABLE IF NOT EXISTS cnc_job_cards (
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
        actual_end_date TIMESTAMP,
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(50) DEFAULT 'active',
        notes TEXT,
        material VARCHAR(255),
        drawing_number VARCHAR(255),
        tolerance VARCHAR(100),
        surface_finish VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Add new columns to existing cnc_job_cards table
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS material VARCHAR(255)`).catch(() => {});
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS drawing_number VARCHAR(255)`).catch(() => {});
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS tolerance VARCHAR(100)`).catch(() => {});
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS surface_finish VARCHAR(100)`).catch(() => {});
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS actual_end_date TIMESTAMP`).catch(() => {});

    // Procurement detail columns
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS item_code VARCHAR(255)`).catch(() => {});
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS dimension VARCHAR(255)`).catch(() => {});
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS pr_number VARCHAR(100)`).catch(() => {});
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS po_number VARCHAR(100)`).catch(() => {});
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS estimated_delivery_date TIMESTAMP`).catch(() => {});

    // CNC Job Card Attachments table
    await db.query(`
      CREATE TABLE IF NOT EXISTS cnc_job_attachments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_card_id UUID REFERENCES cnc_job_cards(id) ON DELETE CASCADE,
        file_name VARCHAR(500) NOT NULL,
        original_name VARCHAR(500) NOT NULL,
        file_type VARCHAR(100),
        file_size INTEGER,
        uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // CNC Job Card History table
    await db.query(`
      CREATE TABLE IF NOT EXISTS cnc_job_card_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_card_id UUID REFERENCES cnc_job_cards(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        from_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
        to_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        old_value TEXT,
        new_value TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // CNC Deadline Extensions table
    await db.query(`
      CREATE TABLE IF NOT EXISTS cnc_deadline_extensions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_card_id UUID REFERENCES cnc_job_cards(id) ON DELETE CASCADE,
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

    // Add columns to cnc_job_cards for extension support
    await db.query(`ALTER TABLE cnc_job_cards ADD COLUMN IF NOT EXISTS extended_estimate_end_date TIMESTAMP`).catch(() => {});

    // Add columns to cnc_job_card_history for field change tracking
    await db.query(`ALTER TABLE cnc_job_card_history ADD COLUMN IF NOT EXISTS old_value TEXT`).catch(() => {});
    await db.query(`ALTER TABLE cnc_job_card_history ADD COLUMN IF NOT EXISTS new_value TEXT`).catch(() => {});

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active);
      CREATE INDEX IF NOT EXISTS idx_workflow_stages_workflow ON workflow_stages(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_cnc_job_workflow ON cnc_job_cards(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_cnc_job_stage ON cnc_job_cards(current_stage_id);
      CREATE INDEX IF NOT EXISTS idx_cnc_job_status ON cnc_job_cards(status);
      CREATE INDEX IF NOT EXISTS idx_cnc_history_job ON cnc_job_card_history(job_card_id);
    `);

    // Add kanban_order column if it doesn't exist (for existing databases)
    try {
      await db.query(`ALTER TABLE users ADD COLUMN kanban_order INTEGER DEFAULT 0`);
    } catch (err) {
      // Column might already exist, ignore error
    }

    // Update role CHECK constraint to include 'guest'
    try {
      const constraintRes = await db.query(`
        SELECT con.conname FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'users' AND att.attname = 'role' AND con.contype = 'c'
      `);
      for (const row of constraintRes.rows) {
        await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${row.conname}"`);
      }
      await db.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'guest'))`);
    } catch (err) {
      console.log('Role constraint migration note:', err.message);
    }

    // Seed admin
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@taskflow.com';
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (!existing.rows[0]) {
      const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 12);
      await db.query(
        "INSERT INTO users (name, email, password, role, avatar_color) VALUES ($1, $2, $3, 'admin', '#1e1b4b')",
        ['System Admin', adminEmail, hashed]
      );
      console.log(`✅ Admin created: ${adminEmail}`);
    }
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
};

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${PORT} at http://0.0.0.0:${PORT}`);
  await initDB();
});
