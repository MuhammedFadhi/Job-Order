const API_BASE = 'http://localhost:3001/api';

async function testSync() {
    // 1. Get work orders
    const res = await fetch(`${API_BASE}/work-orders`);
    const workOrders = await res.json();
    if (workOrders.length === 0) {
        console.log('No work orders found.');
        return;
    }
    const wo = workOrders[0];
    console.log('Testing sync for WO:', wo.id);

    // 2. Create dummy history
    const dummyHistory = [
        { type: 'pause', at: Date.now() - 10000 },
        { type: 'resume', at: Date.now() - 5000 }
    ];

    // 3. Sync to server
    console.log('Syncing history...');
    const putRes = await fetch(`${API_BASE}/work-orders/${wo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pause_history: dummyHistory })
    });

    if (putRes.ok) {
        console.log('Sync successful.');
        // 4. Verify
        const getRes = await fetch(`${API_BASE}/work-orders/${wo.id}`);
        const updatedWo = await getRes.json();
        console.log('Retrieved history:', updatedWo.pause_history);
        if (JSON.stringify(updatedWo.pause_history) === JSON.stringify(dummyHistory)) {
            console.log('VERIFICATION SUCCESSFUL');
        } else {
            console.log('VERIFICATION FAILED: history mismatch');
        }
    } else {
        console.error('Sync failed:', await putRes.text());
    }
}

testSync();
