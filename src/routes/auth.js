const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // Lookup user by username
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (error || !user) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Verify Password (Plaintext for prototype - use bcrypt in production)
    if (user.password !== password) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Remove password from the response object
    const { password: _, ...userProfile } = user;

    res.json({
        message: 'Login successful',
        user: userProfile
    });
});

module.exports = router;
