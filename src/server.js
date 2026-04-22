require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');       
const supabase = require('./supabaseClient');
const cron = require('node-cron');
const { generateDailyReports } = require('./utils/reportService');

const app = express();
const jobOrdersRouter = require('./routes/jobOrders');
const usersRouter = require('./routes/users');
const workOrdersRouter = require('./routes/workOrders');
const authRouter = require('./routes/auth');
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public'))); 

// Routes
app.use('/api/job-orders', jobOrdersRouter);
app.use('/api/users', usersRouter);
app.use('/api/work-orders', workOrdersRouter);
app.use('/api/auth', authRouter);

// Clock Sync Endpoint
app.get('/api/time', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({ time: Date.now() });
});

// Root route - Serve premium landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Daily Report Cron and Test API
cron.schedule('25 9 * * *', () => {
    console.log('Running scheduled daily report...');
    generateDailyReports().catch(err => console.error('Cron report failed:', err));
});

app.post('/api/test-email', async (req, res) => {
    try {
        const result = await generateDailyReports();
        res.json(result);
    } catch (error) {
        console.error('Test email failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export the app for Vercel serverless functions
module.exports = app;

// Start server for local development
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}
