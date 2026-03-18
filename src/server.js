require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');       
const supabase = require('./supabaseClient');

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

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
