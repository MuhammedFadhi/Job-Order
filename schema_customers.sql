-- Create Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optional: Insert some initial data from existing job_orders to populate the list
-- This ensures that current customers are already in the system
INSERT INTO customers (name)
SELECT DISTINCT customer_name 
FROM job_orders 
WHERE customer_name IS NOT NULL AND customer_name != ''
ON CONFLICT (name) DO NOTHING;
