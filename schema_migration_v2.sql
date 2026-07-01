-- Migration v2: Customer emails, WO estimate_time, tested status, pending status

-- 1. Add emails array to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS emails TEXT[] DEFAULT '{}';

-- 2. Add estimate_time (in minutes) to work_orders
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS estimate_time INTEGER;

-- 3. Add tested status to work_orders
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS tested TEXT DEFAULT 'not_tested';

-- 4. Update work_orders status CHECK to include 'pending'
--    (Drop old constraint and add new one)
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_status_check
    CHECK (status IN ('pending', 'started', 'ongoing', 'completed', 'paused'));

-- 5. Allow work_orders.user_id to be null (already is by default, but ensure it)
--    No change needed - user_id was already nullable

-- 6. Allow work_orders.time_in to be null for pending orders
ALTER TABLE work_orders ALTER COLUMN time_in DROP NOT NULL;
ALTER TABLE work_orders ALTER COLUMN time_in DROP DEFAULT;

-- 7. Add tested CHECK constraint
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_tested_check;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_tested_check
    CHECK (tested IN ('not_tested', 'testing', 'pass', 'needs_fix'));
