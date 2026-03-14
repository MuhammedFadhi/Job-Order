-- Supabase SQL Migration: Add Authentication Fields
-- Adds username and password columns to the existing users table

-- 1. Add columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS password TEXT;

-- 2. Ensure usernames are unique
ALTER TABLE users
ADD CONSTRAINT unique_username UNIQUE (username);

-- 3. Seed some dummy passwords for existing users so we can log in right away
-- 3. Seed passwords safely (avoiding unique violations if multiple users have the same name)
WITH NumberedUsers AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
    FROM users
    WHERE name = 'Test Engineer'
)
UPDATE users    
SET 
    username = 'testuser' || NumberedUsers.rn::text, 
    password = 'password123'
FROM NumberedUsers
WHERE users.id = NumberedUsers.id;

-- If no users exist, insert a default one
INSERT INTO users (name, role, username, password)
SELECT 'Admin User', 'Admin', 'admin', 'admin123'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
