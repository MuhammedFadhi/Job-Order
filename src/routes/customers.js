const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// GET all customers
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new customer
router.post('/', async (req, res) => {
    const { name, emails } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });

    const emailList = Array.isArray(emails) ? emails.filter(e => e && e.trim()) : [];

    try {
        const { data, error } = await supabase
            .from('customers')
            .insert([{ name, emails: emailList }])
            .select();

        if (error) throw error;
        res.status(201).json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update customer
router.put('/:id', async (req, res) => {
    const { name, emails } = req.body;
    const { id } = req.params;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (emails !== undefined) {
        updateData.emails = Array.isArray(emails) ? emails.filter(e => e && e.trim()) : [];
    }

    try {
        const { data, error } = await supabase
            .from('customers')
            .update(updateData)
            .eq('id', id)
            .select();

        if (error) throw error;
        if (!data.length) return res.status(404).json({ error: 'Customer not found' });
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE customer
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
