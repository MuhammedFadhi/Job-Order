const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// GET all users
router.get('/', async (req, res) => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// GET single user
router.get('/:id', async (req, res) => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'User not found' });
    res.json(data);
});

// POST new user
router.post('/', async (req, res) => {
    const { name, role } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }

    const { data, error } = await supabase
        .from('users')
        .insert([{ name, role: role || 'User' }])
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data[0]);
});

module.exports = router;
