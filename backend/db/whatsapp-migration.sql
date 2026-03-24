-- WhatsApp Integration Database Schema

-- Add phone number fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

-- Create WhatsApp logs table for tracking sent messages
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  message_type VARCHAR(50) NOT NULL, -- 'summary_morning', 'summary_evening', 'task_*', 'cnc_*', etc
  message_content TEXT,
  status VARCHAR(20) NOT NULL, -- 'sent', 'failed', 'delivered', 'read'
  error_message TEXT,
  twilio_sid VARCHAR(100), -- Twilio message SID for tracking
  sent_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_user_id ON whatsapp_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_phone_number ON whatsapp_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created_at ON whatsapp_logs(created_at);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whatsapp_logs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS whatsapp_logs_update_timestamp ON whatsapp_logs;
CREATE TRIGGER whatsapp_logs_update_timestamp
BEFORE UPDATE ON whatsapp_logs
FOR EACH ROW
EXECUTE FUNCTION update_whatsapp_logs_timestamp();

-- Create user notification preferences table (optional for future use)
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  whatsapp_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  morning_summary BOOLEAN DEFAULT true,
  evening_summary BOOLEAN DEFAULT true,
  task_notifications BOOLEAN DEFAULT true,
  cnc_notifications BOOLEAN DEFAULT true,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON user_notification_preferences(user_id);

-- Add trigger for notification preferences timestamp
DROP TRIGGER IF EXISTS notification_prefs_update_timestamp ON user_notification_preferences;
CREATE TRIGGER notification_prefs_update_timestamp
BEFORE UPDATE ON user_notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_whatsapp_logs_timestamp();
