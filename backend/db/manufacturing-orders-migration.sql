-- ========================================
-- Migration: Manufacturing Orders & Machines
-- ========================================

-- Machines Table (if not exists)
CREATE TABLE IF NOT EXISTS machines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    machine_name VARCHAR(255) NOT NULL,
    machine_code VARCHAR(100) NOT NULL UNIQUE,
    machine_type VARCHAR(50) NOT NULL, -- e.g., 'cnc', 'lathe', 'mill', 'drill', 'grinder', 'edm', 'laser'
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Manufacturing Orders/Routes Table
-- Tracks the sequence of machines needed for each job card
CREATE TABLE IF NOT EXISTS manufacturing_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_card_id UUID NOT NULL REFERENCES cnc_job_cards(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
    order_sequence INTEGER NOT NULL, -- Position in manufacturing sequence (1, 2, 3, etc.)
    estimated_duration_minutes INTEGER, -- Estimated time in minutes for this machine operation
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
    quality_check_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_check_status IN ('pending', 'passed', 'failed', 'rework')),
    notes TEXT,
    assigned_operator UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Manufacturing Order History (tracking changes)
CREATE TABLE IF NOT EXISTS manufacturing_order_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manufacturing_order_id UUID NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- 'created', 'status_changed', 'duration_updated', etc.
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_job_card_id ON manufacturing_orders(job_card_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_machine_id ON manufacturing_orders(machine_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_sequence ON manufacturing_orders(job_card_id, order_sequence);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_status ON manufacturing_orders(status);
CREATE INDEX IF NOT EXISTS idx_manufacturing_order_history_mo_id ON manufacturing_order_history(manufacturing_order_id);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);

-- Update trigger for machines (function created in schema.sql)
CREATE TRIGGER update_machines_updated_at BEFORE UPDATE ON machines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_manufacturing_orders_updated_at BEFORE UPDATE ON manufacturing_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add trigger to log manufacturing order changes
CREATE OR REPLACE FUNCTION log_manufacturing_order_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
        INSERT INTO manufacturing_order_history (manufacturing_order_id, action_type, from_status, to_status)
        VALUES (NEW.id, 'status_changed', OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_log_manufacturing_order_change 
AFTER UPDATE ON manufacturing_orders 
FOR EACH ROW EXECUTE FUNCTION log_manufacturing_order_change();
