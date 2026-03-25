-- Manufacturing Orders Migration for Render PostgreSQL
-- This script creates the necessary tables for the manufacturing orders feature
-- Run this directly in your Render database console or via psql

-- 1. Create UUID extension if not already exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- 3. Create machines table if not exists
CREATE TABLE IF NOT EXISTS machines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    machine_name VARCHAR(255) NOT NULL,
    machine_code VARCHAR(100) NOT NULL UNIQUE,
    machine_type VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes on machines
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
CREATE INDEX IF NOT EXISTS idx_machines_code ON machines(machine_code);

-- Add trigger for machines updated_at
DROP TRIGGER IF EXISTS update_machines_updated_at ON machines CASCADE;
CREATE TRIGGER update_machines_updated_at
    BEFORE UPDATE ON machines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Create manufacturing_orders table
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
);

-- Create indexes on manufacturing_orders
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_job_card_id ON manufacturing_orders(job_card_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_machine_id ON manufacturing_orders(machine_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_sequence ON manufacturing_orders(order_sequence);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_status ON manufacturing_orders(status);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_assigned_operator ON manufacturing_orders(assigned_operator);

-- Add trigger for manufacturing_orders updated_at
DROP TRIGGER IF EXISTS update_manufacturing_orders_updated_at ON manufacturing_orders CASCADE;
CREATE TRIGGER update_manufacturing_orders_updated_at
    BEFORE UPDATE ON manufacturing_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Create manufacturing_order_history table
CREATE TABLE IF NOT EXISTS manufacturing_order_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manufacturing_order_id UUID NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes on manufacturing_order_history
CREATE INDEX IF NOT EXISTS idx_manufacturing_order_history_mo_id ON manufacturing_order_history(manufacturing_order_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_order_history_user_id ON manufacturing_order_history(user_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_order_history_created_at ON manufacturing_order_history(created_at);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Manufacturing Orders tables created successfully!';
  RAISE NOTICE 'Tables: machines, manufacturing_orders, manufacturing_order_history';
END $$;
