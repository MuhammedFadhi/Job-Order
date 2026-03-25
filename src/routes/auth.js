const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const bcrypt = require('bcryptjs');

// POST /api/auth/register
router.post('/register', async (req, req_res) => { // Use res as req_res inside to bypass variable shadowing
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
        return req_res.status(400).json({ error: 'Name, username, and password are required' });
    }

    try {
        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (existingUser) {
            return req_res.status(400).json({ error: 'Username is already taken' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new user
        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{ 
                name, 
                username, 
                password: hashedPassword,
                role: 'User' // default role
            }])
            .select();

        if (error) {
            console.error('Registration Error:', error);
            return req_res.status(500).json({ error: error.message || 'Database error' });
        }

        req_res.status(201).json({
            message: 'Registration successful'
        });
    } catch (err) {
        console.error(err);
        req_res.status(500).json({ error: 'Server error during registration' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        // Lookup user by username
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Verify Password
        let isMatch = false;
        // fallback for plain text if password isn't hashed yet (for prototyping/migration)
        if (user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
            isMatch = (user.password === password);
        } else if (user.password) {
            isMatch = await bcrypt.compare(password, user.password);
        }
        
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Remove password from the response object
        const { password: _, ...userProfile } = user;

        res.json({
            message: 'Login successful',
            user: userProfile
        });
    } catch (err) {
        console.error('Login Server Error:', err);
        res.status(500).json({ error: err.message || 'Server error during login' });
    }
});

module.exports = router;
