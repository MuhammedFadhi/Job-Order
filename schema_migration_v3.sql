-- Migration v3: multi-assignee support for job orders

-- 1. Add assigned_to_ids array column
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS assigned_to_ids UUID[] DEFAULT '{}';

-- 2. Backfill from the old single assigned_to column
UPDATE job_orders
SET assigned_to_ids = ARRAY[assigned_to]
WHERE assigned_to IS NOT NULL
  AND (assigned_to_ids IS NULL OR array_length(assigned_to_ids, 1) IS NULL);
