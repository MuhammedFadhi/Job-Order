import { Hono } from 'hono';
import { getSupabase } from '../supabaseClient.js';

const users = new Hono();

// GET all users (only properly registered users with a username, no duplicates)
users.get('/', async (c) => {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .not('username', 'is', null)
        .order('created_at', { ascending: true }); // oldest first so we keep the original

    if (error) return c.json({ error: error.message }, 500);

    // Deduplicate by username - keep the first (oldest) entry
    const seen = new Set();
    const unique = data.filter(user => {
        if (seen.has(user.username)) return false;
        seen.add(user.username);
        return true;
    });

    return c.json(unique);
});

// GET single user
users.get('/:id', async (c) => {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', c.req.param('id'))
        .single();

    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: 'User not found' }, 404);
    return c.json(data);
});

// POST new user
users.post('/', async (c) => {
    const supabase = getSupabase(c.env);
    const { name, role } = await c.req.json();

    if (!name) {
        return c.json({ error: 'Name is required' }, 400);
    }

    const { data, error } = await supabase
        .from('users')
        .insert([{ name, role: role || 'User' }])
        .select();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data[0], 201);
});

// PUT update user (color_code and/or name)
users.put('/:id', async (c) => {
    const supabase = getSupabase(c.env);
    const { color_code, name } = await c.req.json();

    const updateFields = {};
    if (color_code !== undefined) updateFields.color_code = color_code;
    if (name !== undefined) {
        if (!name.trim()) return c.json({ error: 'Name cannot be empty' }, 400);
        updateFields.name = name.trim();
    }

    if (Object.keys(updateFields).length === 0) {
        return c.json({ error: 'No valid fields to update' }, 400);
    }

    const { data, error } = await supabase
        .from('users')
        .update(updateFields)
        .eq('id', c.req.param('id'))
        .select();

    if (error) return c.json({ error: error.message }, 500);
    if (!data.length) return c.json({ error: 'User not found' }, 404);
    return c.json(data[0]);
});

export default users;
