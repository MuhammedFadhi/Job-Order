const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Helper to generate JB-XXXX ID
async function generateJobOrderID() {
    // Get the job order with the highest ID string
    const { data, error } = await supabase
        .from('job_orders')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
        
    if (error) throw error;
    
    let nextNum = 1;
    if (data && data.length > 0) {
        // Extract number from 'JB-XXXX'
        const lastId = data[0].id;
        const lastNum = parseInt(lastId.split('-')[1]);
        if (!isNaN(lastNum)) {
            nextNum = lastNum + 1;
        }
    }
    
    return `JB-${nextNum.toString().padStart(4, '0')}`;
}

// Helper: attach user objects to work_orders by user_id
async function attachUsersToWorkOrders(jobOrders) {
    const { data: users } = await supabase.from('users').select('id, name, username');
    const userMap = {};
    if (users) users.forEach(u => { userMap[u.id] = u; });

    const list = Array.isArray(jobOrders) ? jobOrders : [jobOrders];
    list.forEach(job => {
        if (job.work_orders) {
            job.work_orders = job.work_orders.map(wo => ({
                ...wo,
                user: userMap[wo.user_id] || null
            }));
        }
    });
    return Array.isArray(jobOrders) ? list : list[0];
}

// GET all job orders
router.get('/', async (req, res) => {
    const { data, error } = await supabase
        .from('job_orders')
        .select('*, assigned_by_user:users!job_orders_assigned_by_fkey(name), assigned_to_user:users!job_orders_assigned_to_fkey(name), work_orders(*)')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    const result = await attachUsersToWorkOrders(data);
    res.json(result);
});

// GET single job order
router.get('/:id', async (req, res) => {
    const { data, error } = await supabase
        .from('job_orders')
        .select('*, assigned_by_user:users!job_orders_assigned_by_fkey(name), assigned_to_user:users!job_orders_assigned_to_fkey(name), work_orders(*)')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Job order not found' });
    const result = await attachUsersToWorkOrders(data);
    res.json(result);
});

// POST new job order
router.post('/', async (req, res) => {
    const { title, description, customer_name, status, assigned_by, assigned_to, priority } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }

    try {
        const id = await generateJobOrderID();

        const { data, error } = await supabase
            .from('job_orders')
            .insert([{ 
                id,
                title, 
                description, 
                customer_name, 
                status: status || 'open',
                assigned_by,
                assigned_to,
                priority
            }])
            .select();

        if (error) return res.status(500).json({ error: error.message });
        res.status(201).json(data[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate ID or create job order' });
    }
});

// PUT update job order
router.put('/:id', async (req, res) => {
    const { title, description, customer_name, status, assigned_by, assigned_to, priority } = req.body;

    const { data, error } = await supabase
        .from('job_orders')
        .update({ 
            title, 
            description, 
            customer_name, 
            status, 
            assigned_by,
            assigned_to,
            priority,
            updated_at: new Date() 
        })
        .eq('id', req.params.id)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data.length) return res.status(404).json({ error: 'Job order not found' });
    res.json(data[0]);
});

// DELETE job order and its associated work orders
router.delete('/:id', async (req, res) => {
    // 1. Delete associated work orders first to satisfy foreign key constraints
    const { error: woError } = await supabase
        .from('work_orders')
        .delete()
        .eq('ref_id_jo', req.params.id);

    if (woError) {
        console.error('Work Order deletion error:', woError.message);
        return res.status(500).json({ error: 'Failed to delete associated work orders' });
    }

    // 2. Delete the job order
    const { error: joError } = await supabase
        .from('job_orders')
        .delete()
        .eq('id', req.params.id);

    if (joError) {
        console.error('Job Order deletion error:', joError.message);
        return res.status(500).json({ error: 'Failed to delete job order' });
    }

    res.json({ message: 'Job order and associated work orders deleted successfully' });
});

module.exports = router;
