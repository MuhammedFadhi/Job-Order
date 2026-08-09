import { Hono } from 'hono';
import { getSupabase } from '../supabaseClient.js';

const customers = new Hono();

// GET all customers
customers.get('/', async (c) => {
    const supabase = getSupabase(c.env);
    try {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        return c.json(data);
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

// POST new customer
customers.post('/', async (c) => {
    const supabase = getSupabase(c.env);
    const { name, emails } = await c.req.json();
    if (!name) return c.json({ error: 'Customer name is required' }, 400);

    const emailList = Array.isArray(emails) ? emails.filter(e => e && e.trim()) : [];

    try {
        const { data, error } = await supabase
            .from('customers')
            .insert([{ name, emails: emailList }])
            .select();

        if (error) throw error;
        return c.json(data[0], 201);
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

// PUT update customer
customers.put('/:id', async (c) => {
    const supabase = getSupabase(c.env);
    const { name, emails } = await c.req.json();
    const id = c.req.param('id');

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
        if (!data.length) return c.json({ error: 'Customer not found' }, 404);
        return c.json(data[0]);
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

// DELETE customer
customers.delete('/:id', async (c) => {
    const supabase = getSupabase(c.env);
    const id = c.req.param('id');

    try {
        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return c.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

export default customers;
