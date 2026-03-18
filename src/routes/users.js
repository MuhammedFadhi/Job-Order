const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// GET all users (only properly registered users with a username, no duplicates)
router.get('/', async (req, res) => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .not('username', 'is', null)
        .order('created_at', { ascending: true }); // oldest first so we keep the original

    if (error) return res.status(500).json({ error: error.message });

    // Deduplicate by username - keep the first (oldest) entry
    const seen = new Set();
    const unique = data.filter(user => {
        if (seen.has(user.username)) return false;
        seen.add(user.username);
        return true;
    });

    res.json(unique);
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
