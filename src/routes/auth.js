import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getSupabase } from '../supabaseClient.js';

const auth = new Hono();

// POST /api/auth/register
auth.post('/register', async (c) => {
    const supabase = getSupabase(c.env);
    const { name, username, password } = await c.req.json();

    if (!name || !username || !password) {
        return c.json({ error: 'Name, username, and password are required' }, 400);
    }

    try {
        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (existingUser) {
            return c.json({ error: 'Username is already taken' }, 400);
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate Random Premium Color
        const brandColors = ['#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#f97316', '#eab308', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6'];
        const randomColor = brandColors[Math.floor(Math.random() * brandColors.length)];

        // Insert new user
        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{
                name,
                username,
                password: hashedPassword,
                role: 'User', // default role
                color_code: randomColor
            }])
            .select();

        if (error) {
            console.error('Registration Error:', error);
            return c.json({ error: error.message || 'Database error' }, 500);
        }

        return c.json({ message: 'Registration successful' }, 201);
    } catch (err) {
        console.error(err);
        return c.json({ error: 'Server error during registration' }, 500);
    }
});

// POST /api/auth/login
auth.post('/login', async (c) => {
    const supabase = getSupabase(c.env);
    const { username, password } = await c.req.json();

    if (!username || !password) {
        return c.json({ error: 'Username and password are required' }, 400);
    }

    try {
        // Lookup user by username
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !user) {
            return c.json({ error: 'Invalid username or password' }, 401);
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
            return c.json({ error: 'Invalid username or password' }, 401);
        }

        // Remove password from the response object
        const { password: _, ...userProfile } = user;

        return c.json({
            message: 'Login successful',
            user: userProfile
        });
    } catch (err) {
        console.error('Login Server Error:', err);
        return c.json({ error: err.message || 'Server error during login' }, 500);
    }
});

export default auth;
