const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Helper to generate WIP-XXXX ID
async function generateWorkOrderID() {
    // Get count of existing work orders to determine next ID
    const { count, error } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true });
        
    if (error) throw error;
    
    // Simple incremental logic for the prototype (WIP-0001, WIP-0002)
    const nextNum = (count || 0) + 1;
    return `WIP-${nextNum.toString().padStart(4, '0')}`;
}

// GET all work orders
router.get('/', async (req, res) => {
    const { data, error } = await supabase
        .from('work_orders')
        .select('*')
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
    const { status, description, time_out } = req.body;
    
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
