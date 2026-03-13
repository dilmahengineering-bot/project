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
