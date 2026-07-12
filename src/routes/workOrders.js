const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Helper to generate WIP-XXXX ID
async function generateWorkOrderID() {
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
router.get('/', async (req, res) => {
    const { data, error } = await supabase
        .from('work_orders')
        .select(`
            *,
            user:users!user_id(id, name, role, color_code),
            job_order:job_orders!ref_id_jo(id, title, customer_name)
        `)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// GET single work order
router.get('/:id', async (req, res) => {
    const { data, error } = await supabase
        .from('work_orders')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Work order not found' });
    res.json(data);
});

// POST new work order (admin creates as pending, or user creates and starts immediately)
router.post('/', async (req, res) => {
    const { description, user_id, ref_id_jo, tagged_user_ids, estimate_time } = req.body;

    if (!ref_id_jo) {
        return res.status(400).json({ error: 'Job Order Reference ID is required' });
    }

    try {
        const id = await generateWorkOrderID();

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

        if (error) return res.status(500).json({ error: error.message });
        res.status(201).json(data[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate ID or create work order' });
    }
});

// PUT /:id/start — user claims and starts a pending work order
router.put('/:id/start', async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required to start a work order' });
    }

    try {
        // Verify the WO is still pending
        const { data: existing, error: fetchErr } = await supabase
            .from('work_orders')
            .select('status, user_id')
            .eq('id', req.params.id)
            .single();

        if (fetchErr || !existing) return res.status(404).json({ error: 'Work order not found' });
        if (existing.status !== 'pending') {
            return res.status(400).json({ error: 'Work order is not in pending state' });
        }

        const { data, error } = await supabase
            .from('work_orders')
            .update({
                status: 'started',
                user_id,
                time_in: new Date(),
                updated_at: new Date()
            })
            .eq('id', req.params.id)
            .select();

        if (error) return res.status(500).json({ error: error.message });
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to start work order' });
    }
});

// PUT update work order
router.put('/:id', async (req, res) => {
    const { status, description, time_in, time_out, pause_history, estimate_time, tested, user_id } = req.body;

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
        .eq('id', req.params.id)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data.length) return res.status(404).json({ error: 'Work order not found' });
    res.json(data[0]);
});

// DELETE work order
router.delete('/:id', async (req, res) => {
    const { error } = await supabase
        .from('work_orders')
        .delete()
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Work order deleted successfully' });
});

module.exports = router;
