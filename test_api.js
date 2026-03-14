async function testAPI() {
    const baseUrl = 'http://localhost:3001/api';

    console.log('--- Testing Workflow Data Model API ---');

    try {
        // 1. Create a User
        console.log('\n1. Creating a User...');
        const userRes = await fetch(`${baseUrl}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Engineer',
                role: 'User'
            })
        });
        const newUser = await userRes.json();
        console.log('Created User:', newUser);

        if (!newUser.id) throw new Error('User creation failed');

        // 2. Create a Job Order assigned to the User
        console.log('\n2. Creating a Job Order...');
        const jobRes = await fetch(`${baseUrl}/job-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Server Maintenance',
                description: 'Routine updates and patches',
                customer_name: 'Acme Corp',
                status: 'open',
                priority: 3,
                assigned_to: newUser.id
            })
        });
        const newJob = await jobRes.json();
        console.log('Created Job Order:', newJob);

        if (!newJob.id) throw new Error('Job order creation failed');

        // 3. Create a Work Order linked to the Job Order
        console.log('\n3. Creating a Work Order...');
        const workRes = await fetch(`${baseUrl}/work-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: 'Starting backup procedure',
                status: 'started',
                user_id: newUser.id,
                ref_id_jo: newJob.id
            })
        });
        const newWork = await workRes.json();
        console.log('Created Work Order:', newWork);

        if (!newWork.id) throw new Error('Work order creation failed');

        // 4. Update the Work Order to 'completed'
        console.log('\n4. Updating Work Order to "completed"...');
        const updateWorkRes = await fetch(`${baseUrl}/work-orders/${newWork.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'completed',
                description: 'Backup procedure finished successfully'
            })
        });
        const updatedWork = await updateWorkRes.json();
        console.log('Updated Work Order:', updatedWork);

    } catch (err) {
        console.error('\nError testing API:', err.message);
        console.log('Make sure your server is running (npm run dev) and you have run the schema.sql in Supabase.');
    }
}

testAPI();
