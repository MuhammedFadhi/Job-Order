const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Helper to generate WIP-XXXX ID
async function generateWorkOrderID() {
    // Get the work order with the highest ID string
    const { data, error } = await supabase
        .from('work_orders')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
        
    if (error) throw error;
    
    let nextNum = 1;
    if (data && data.length > 0) {
        // Extract number from 'WIP-XXXX'
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

// POST new work order
router.post('/', async (req, res) => {
    const { status, description, user_id, ref_id_jo } = req.body;

    if (!ref_id_jo) {
        return res.status(400).json({ error: 'Job Order Reference ID is required' });
    }

    try {
        const id = await generateWorkOrderID();
        
        const { data, error } = await supabase
            .from('work_orders')
            .insert([{ 
                id,
                status: status || 'started', 
                description, 
                user_id, 
                ref_id_jo,
                tagged_user_ids: req.body.tagged_user_ids || [],
                time_in: new Date()
            }])
            .select();

        if (error) return res.status(500).json({ error: error.message });
        res.status(201).json(data[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate ID or create work order' });
    }
});

// PUT update work order
router.put('/:id', async (req, res) => {
    const { status, description, time_out, pause_history } = req.body;
    
    // Auto-set time_out if status is completed and no time_out provided
    let updatedTimeOut = time_out;
    if (status === 'completed' && !time_out) {
        updatedTimeOut = new Date();
    }

    const { data, error } = await supabase
        .from('work_orders')
        .update({ 
            status, 
            description, 
            time_out: updatedTimeOut,
            pause_history,
            updated_at: new Date() 
        })
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
