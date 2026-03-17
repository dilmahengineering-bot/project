-- Migration: Add kanban_order column to users table for kanban user reordering

-- Check if column exists and add if not
ALTER TABLE users ADD COLUMN IF NOT EXISTS kanban_order INTEGER DEFAULT 0;

-- Create an index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_kanban_order ON users(kanban_order);

-- Initialize kanban_order for existing users (set order based on creation date)
UPDATE users 
SET kanban_order = (
  SELECT COUNT(*) 
  FROM users u2 
  WHERE u2.role = users.role 
  AND u2.created_at <= users.created_at
) - 1
WHERE kanban_order = 0 AND role = 'user';

-- ========================================
-- Migration: Workflow Master & CNC Job Cards
-- ========================================

-- Workflows Master Table
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    workflow_type VARCHAR(50) NOT NULL CHECK (workflow_type IN ('cnc_manufacturing', 'regular_tasks', 'custom')),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(name, workflow_type)
);

-- Workflow Stages Table
CREATE TABLE IF NOT EXISTS workflow_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    stage_name VARCHAR(100) NOT NULL,
    stage_order INTEGER NOT NULL,
    color VARCHAR(7) DEFAULT '#6366f1',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workflow_id, stage_name)
);

-- CNC Job Cards Table
CREATE TABLE IF NOT EXISTS cnc_job_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_name VARCHAR(255) NOT NULL,
    job_card_number VARCHAR(100) NOT NULL UNIQUE,
    subjob_card_number VARCHAR(100),
    job_date TIMESTAMP NOT NULL,
    machine_name VARCHAR(255),
    client_name VARCHAR(255),
    part_number VARCHAR(255) NOT NULL,
    manufacturing_type VARCHAR(20) NOT NULL CHECK (manufacturing_type IN ('internal', 'external')),
    quantity INTEGER NOT NULL DEFAULT 1,
    estimate_end_date TIMESTAMP,
    actual_end_date TIMESTAMP,
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE RESTRICT,
    current_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- CNC Job Card History
CREATE TABLE IF NOT EXISTS cnc_job_card_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_card_id UUID NOT NULL REFERENCES cnc_job_cards(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    from_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
    to_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflows_type ON workflows(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflow_stages_workflow_id ON workflow_stages(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_stages_order ON workflow_stages(workflow_id, stage_order);
CREATE INDEX IF NOT EXISTS idx_cnc_job_cards_workflow_id ON cnc_job_cards(workflow_id);
CREATE INDEX IF NOT EXISTS idx_cnc_job_cards_current_stage ON cnc_job_cards(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_cnc_job_cards_assigned_to ON cnc_job_cards(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cnc_job_cards_job_card_number ON cnc_job_cards(job_card_number);
CREATE INDEX IF NOT EXISTS idx_cnc_job_card_history_job_card_id ON cnc_job_card_history(job_card_id);

-- Update trigger for workflows table
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_stages_updated_at BEFORE UPDATE ON workflow_stages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cnc_job_cards_updated_at BEFORE UPDATE ON cnc_job_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
