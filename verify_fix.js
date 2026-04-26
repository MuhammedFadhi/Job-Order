// Simple test script to verify calculateDuration fix
const { calculateDuration } = require('./src/utils/reportService');

function test() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const thirtyMinutesAgo = now - (30 * 60 * 1000);

    // Case 1: Work started 1 hour ago, paused 30 minutes ago, still paused.
    // Expected work duration: 30 minutes.
    const pauseHistory = [
        { type: 'pause', at: thirtyMinutesAgo }
    ];
    
    // timeIn: oneHourAgo, timeOut: null (running), pauseHistory: [...]
    const durationMs = calculateDuration(oneHourAgo, null, pauseHistory);
    const durationMinutes = Math.round(durationMs / (1000 * 60));

    console.log(`Test Case: Task started 60 mins ago, paused 30 mins ago, still paused.`);
    console.log(`Calculated Duration: ${durationMinutes} minutes`);
    
    if (durationMinutes === 30) {
        console.log('✅ TEST PASSED');
    } else {
        console.log('❌ TEST FAILED');
        process.exit(1);
    }

    // Case 2: Work started 2 hours ago, paused 1.5 hours ago, resumed 1 hour ago.
    // Expected work duration: 1.5 hours (90 minutes).
    const twoHoursAgo = now - (120 * 60 * 1000);
    const ninetyMinsAgo = now - (90 * 60 * 1000);
    const sixtyMinsAgo = now - (60 * 60 * 1000);

    const pauseHistory2 = [
        { type: 'pause', at: ninetyMinsAgo },
        { type: 'resume', at: sixtyMinsAgo }
    ];

    const durationMs2 = calculateDuration(twoHoursAgo, null, pauseHistory2);
    const durationMinutes2 = Math.round(durationMs2 / (1000 * 60));

    console.log(`\nTest Case: Task started 120 mins ago, paused for 30 mins, currently running for 60 mins.`);
    console.log(`Calculated Duration: ${durationMinutes2} minutes`);

    if (durationMinutes2 === 90) {
        console.log('✅ TEST PASSED');
    } else {
        console.log('❌ TEST FAILED');
        process.exit(1);
    }
}

test();
