const supabase = require('./src/supabaseClient');

async function testQuery() {
    console.log('Testing job_orders query...');
    const { data, error } = await supabase
        .from('job_orders')
        .select('*, assigned_by:users!job_orders_assigned_by_fkey(name), assigned_to:users!job_orders_assigned_to_fkey(name)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching job orders:', error);
    } else {
        console.log('Success! Fetched data:', data);
    }
}

testQuery();
