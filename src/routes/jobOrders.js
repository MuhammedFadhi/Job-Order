const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { sendProgressReport } = require('../utils/reportService');

// Helper to generate JB-XXXX ID
async function generateJobOrderID() {
    const { data, error } = await supabase
        .from('job_orders')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);

    if (error) throw error;

    let nextNum = 1;
    if (data && data.length > 0) {
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
    const { data: users } = await supabase.from('users').select('id, name, username, color_code');
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
        .select('*, assigned_by_user:users!job_orders_assigned_by_fkey(name), work_orders(*)')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    const result = await attachUsersToWorkOrders(data);
    res.json(result);
});

// GET single job order
router.get('/:id', async (req, res) => {
    const { data, error } = await supabase
        .from('job_orders')
        .select('*, assigned_by_user:users!job_orders_assigned_by_fkey(name), work_orders(*)')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Job order not found' });
    const result = await attachUsersToWorkOrders(data);
    res.json(result);
});

// POST new job order
router.post('/', async (req, res) => {
    const { title, description, customer_name, status, assigned_by, assigned_to_ids, priority } = req.body;

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
                assigned_to_ids: assigned_to_ids || [],
                priority
            }])
            .select();

        if (error) return res.status(500).json({ error: error.message });
        res.status(201).json(data[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate ID or create job order' });
    }
});

// POST send progress report email for a job order
router.post('/:id/send-report', async (req, res) => {
    const { requester_id } = req.body;

    try {
        const result = await sendProgressReport(req.params.id, requester_id);
        res.json(result);
    } catch (err) {
        console.error('Failed to send progress report:', err);
        res.status(500).json({ error: err.message || 'Failed to send report' });
    }
});

// POST mark job complete — bulk-completes all work orders + closes job
router.post('/:id/complete', async (req, res) => {
    const jobId = req.params.id;

    try {
        // 1. Mark all work orders for this job as completed + tested: pass
        const now = new Date().toISOString();
        const { error: woError } = await supabase
            .from('work_orders')
            .update({
                status: 'completed',
                tested: 'pass',
                time_out: now,
                updated_at: now
            })
            .eq('ref_id_jo', jobId)
            .neq('status', 'completed'); // skip already-completed ones

        if (woError) return res.status(500).json({ error: woError.message });

        // 2. Close the job order
        const { data, error: joError } = await supabase
            .from('job_orders')
            .update({ status: 'closed', updated_at: now })
            .eq('id', jobId)
            .select();

        if (joError) return res.status(500).json({ error: joError.message });
        if (!data.length) return res.status(404).json({ error: 'Job order not found' });

        res.json({ success: true, job: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to complete job' });
    }
});

// PUT update job order
router.put('/:id', async (req, res) => {
    const { title, description, customer_name, status, assigned_by, assigned_to_ids, priority } = req.body;

    const { data, error } = await supabase
        .from('job_orders')
        .update({
            title,
            description,
            customer_name,
            status,
            assigned_by,
            assigned_to_ids,
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
    const { error: woError } = await supabase
        .from('work_orders')
        .delete()
        .eq('ref_id_jo', req.params.id);

    if (woError) {
        console.error('Work Order deletion error:', woError.message);
        return res.status(500).json({ error: 'Failed to delete associated work orders' });
    }

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
