import { Hono } from 'hono';
import { getSupabase } from '../supabaseClient.js';

const workOrders = new Hono();

// Helper to generate WIP-XXXX ID
async function generateWorkOrderID(supabase) {
    const { data, error } = await supabase
        .from('work_orders')
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

    return `WIP-${nextNum.toString().padStart(4, '0')}`;
}

// GET all work orders with joined data
workOrders.get('/', async (c) => {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
        .from('work_orders')
        .select(`
            *,
            user:users!user_id(id, name, role, color_code),
            job_order:job_orders!ref_id_jo(id, title, customer_name)
        `)
        .order('created_at', { ascending: false });

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
});

// GET single work order
workOrders.get('/:id', async (c) => {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
        .from('work_orders')
        .select('*')
        .eq('id', c.req.param('id'))
        .single();

    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: 'Work order not found' }, 404);
    return c.json(data);
});

// POST new work order (admin creates as pending, or user creates and starts immediately)
workOrders.post('/', async (c) => {
    const supabase = getSupabase(c.env);
    const { description, user_id, ref_id_jo, tagged_user_ids, estimate_time } = await c.req.json();

    if (!ref_id_jo) {
        return c.json({ error: 'Job Order Reference ID is required' }, 400);
    }

    try {
        const id = await generateWorkOrderID(supabase);

        // If user_id provided, start immediately; otherwise create as pending
        const isPending = !user_id;

        const { data, error } = await supabase
            .from('work_orders')
            .insert([{
                id,
                status: isPending ? 'pending' : 'started',
                description,
                user_id: user_id || null,
                ref_id_jo,
                tagged_user_ids: tagged_user_ids || [],
                estimate_time: estimate_time || null,
                time_in: isPending ? null : new Date()
            }])
            .select();

        if (error) return c.json({ error: error.message }, 500);
        return c.json(data[0], 201);
    } catch (err) {
        return c.json({ error: 'Failed to generate ID or create work order' }, 500);
    }
});

// PUT /:id/start — user claims and starts a pending work order
workOrders.put('/:id/start', async (c) => {
    const supabase = getSupabase(c.env);
    const { user_id } = await c.req.json();
    const id = c.req.param('id');

    if (!user_id) {
        return c.json({ error: 'user_id is required to start a work order' }, 400);
    }

    try {
        // Verify the WO is still pending
        const { data: existing, error: fetchErr } = await supabase
            .from('work_orders')
            .select('status, user_id')
            .eq('id', id)
            .single();

        if (fetchErr || !existing) return c.json({ error: 'Work order not found' }, 404);
        if (existing.status !== 'pending') {
            return c.json({ error: 'Work order is not in pending state' }, 400);
        }

        const { data, error } = await supabase
            .from('work_orders')
            .update({
                status: 'started',
                user_id,
                time_in: new Date(),
                updated_at: new Date()
            })
            .eq('id', id)
            .select();

        if (error) return c.json({ error: error.message }, 500);
        return c.json(data[0]);
    } catch (err) {
        return c.json({ error: 'Failed to start work order' }, 500);
    }
});

// PUT update work order
workOrders.put('/:id', async (c) => {
    const supabase = getSupabase(c.env);
    const { status, description, time_in, time_out, pause_history, estimate_time, tested, user_id } = await c.req.json();

    let updatedTimeOut = time_out;
    if (status === 'completed' && !time_out) {
        updatedTimeOut = new Date();
    }

    const updateFields = {
        status,
        description,
        time_out: updatedTimeOut,
        pause_history,
        updated_at: new Date()
    };

    if (time_in !== undefined) updateFields.time_in = time_in;
    if (estimate_time !== undefined) updateFields.estimate_time = estimate_time;
    if (tested !== undefined) updateFields.tested = tested;
    if (user_id !== undefined) updateFields.user_id = user_id;

    const { data, error } = await supabase
        .from('work_orders')
        .update(updateFields)
        .eq('id', c.req.param('id'))
        .select();

    if (error) return c.json({ error: error.message }, 500);
    if (!data.length) return c.json({ error: 'Work order not found' }, 404);
    return c.json(data[0]);
});

// DELETE work order
workOrders.delete('/:id', async (c) => {
    const supabase = getSupabase(c.env);
    const { error } = await supabase
        .from('work_orders')
        .delete()
        .eq('id', c.req.param('id'));

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ message: 'Work order deleted successfully' });
});

export default workOrders;
