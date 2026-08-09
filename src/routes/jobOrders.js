import { Hono } from 'hono';
import { getSupabase } from '../supabaseClient.js';
import { sendProgressReport } from '../utils/reportService.js';

const jobOrders = new Hono();

// Helper to generate JB-XXXX ID
async function generateJobOrderID(supabase) {
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
async function attachUsersToWorkOrders(supabase, jobOrdersData) {
    const { data: users } = await supabase.from('users').select('id, name, username, color_code');
    const userMap = {};
    if (users) users.forEach(u => { userMap[u.id] = u; });

    const list = Array.isArray(jobOrdersData) ? jobOrdersData : [jobOrdersData];
    list.forEach(job => {
        if (job.work_orders) {
            job.work_orders = job.work_orders.map(wo => ({
                ...wo,
                user: userMap[wo.user_id] || null
            }));
        }
    });
    return Array.isArray(jobOrdersData) ? list : list[0];
}

// GET all job orders
jobOrders.get('/', async (c) => {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
        .from('job_orders')
        .select('*, assigned_by_user:users!job_orders_assigned_by_fkey(name), work_orders(*)')
        .order('created_at', { ascending: false });

    if (error) return c.json({ error: error.message }, 500);
    const result = await attachUsersToWorkOrders(supabase, data);
    return c.json(result);
});

// GET single job order
jobOrders.get('/:id', async (c) => {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
        .from('job_orders')
        .select('*, assigned_by_user:users!job_orders_assigned_by_fkey(name), work_orders(*)')
        .eq('id', c.req.param('id'))
        .single();

    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: 'Job order not found' }, 404);
    const result = await attachUsersToWorkOrders(supabase, data);
    return c.json(result);
});

// POST new job order
jobOrders.post('/', async (c) => {
    const supabase = getSupabase(c.env);
    const { title, description, customer_name, status, assigned_by, assigned_to_ids, priority } = await c.req.json();

    if (!title) {
        return c.json({ error: 'Title is required' }, 400);
    }

    try {
        const id = await generateJobOrderID(supabase);

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

        if (error) return c.json({ error: error.message }, 500);
        return c.json(data[0], 201);
    } catch (err) {
        return c.json({ error: 'Failed to generate ID or create job order' }, 500);
    }
});

// POST send progress report email for a job order
jobOrders.post('/:id/send-report', async (c) => {
    const { requester_id } = await c.req.json();

    try {
        const result = await sendProgressReport(c.env, c.req.param('id'), requester_id);
        return c.json(result);
    } catch (err) {
        console.error('Failed to send progress report:', err);
        return c.json({ error: err.message || 'Failed to send report' }, 500);
    }
});

// POST mark job complete — bulk-completes all work orders + closes job
jobOrders.post('/:id/complete', async (c) => {
    const supabase = getSupabase(c.env);
    const jobId = c.req.param('id');

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

        if (woError) return c.json({ error: woError.message }, 500);

        // 2. Close the job order
        const { data, error: joError } = await supabase
            .from('job_orders')
            .update({ status: 'closed', updated_at: now })
            .eq('id', jobId)
            .select();

        if (joError) return c.json({ error: joError.message }, 500);
        if (!data.length) return c.json({ error: 'Job order not found' }, 404);

        return c.json({ success: true, job: data[0] });
    } catch (err) {
        return c.json({ error: err.message || 'Failed to complete job' }, 500);
    }
});

// PUT update job order
jobOrders.put('/:id', async (c) => {
    const supabase = getSupabase(c.env);
    const { title, description, customer_name, status, assigned_by, assigned_to_ids, priority } = await c.req.json();

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
        .eq('id', c.req.param('id'))
        .select();

    if (error) return c.json({ error: error.message }, 500);
    if (!data.length) return c.json({ error: 'Job order not found' }, 404);
    return c.json(data[0]);
});

// DELETE job order and its associated work orders
jobOrders.delete('/:id', async (c) => {
    const supabase = getSupabase(c.env);
    const id = c.req.param('id');

    const { error: woError } = await supabase
        .from('work_orders')
        .delete()
        .eq('ref_id_jo', id);

    if (woError) {
        console.error('Work Order deletion error:', woError.message);
        return c.json({ error: 'Failed to delete associated work orders' }, 500);
    }

    const { error: joError } = await supabase
        .from('job_orders')
        .delete()
        .eq('id', id);

    if (joError) {
        console.error('Job Order deletion error:', joError.message);
        return c.json({ error: 'Failed to delete job order' }, 500);
    }

    return c.json({ message: 'Job order and associated work orders deleted successfully' });
});

export default jobOrders;
