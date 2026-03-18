-- Supabase SQL Migration: Workflow Data Model
-- WARNING: This will drop existing tables if they exist to match the new schema

DROP TABLE IF EXISTS work_orders;
DROP TABLE IF EXISTS job_orders;
DROP TABLE IF EXISTS users;

-- 1. Create Login System (Users/Admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'User' CHECK (role IN ('User', 'Admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Job Orders
CREATE TABLE job_orders (
    id TEXT PRIMARY KEY, -- Stores 'JB-XXXX'
    title TEXT NOT NULL,
    description TEXT,
    customer_name TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending')),
    assigned_by UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    priority INTEGER CHECK (priority BETWEEN 1 AND 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Work Orders
CREATE TABLE work_orders (
    id TEXT PRIMARY KEY, -- Stores 'WIP-XXXX'
    status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'ongoing', 'completed')),
    time_in TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    time_out TIMESTAMP WITH TIME ZONE,
    description TEXT,
    user_id UUID REFERENCES users(id),
    ref_id_jo TEXT REFERENCES job_orders(id),
    pause_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
