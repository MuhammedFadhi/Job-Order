import { Hono } from 'hono';
import { cors } from 'hono/cors';
import jobOrdersRouter from './routes/jobOrders.js';
import usersRouter from './routes/users.js';
import workOrdersRouter from './routes/workOrders.js';
import authRouter from './routes/auth.js';
import customersRouter from './routes/customers.js';
import { generateDailyReports, generateReportForUser } from './utils/reportService.js';

const app = new Hono();

app.use('*', cors());

// Routes
app.route('/api/job-orders', jobOrdersRouter);
app.route('/api/users', usersRouter);
app.route('/api/work-orders', workOrdersRouter);
app.route('/api/auth', authRouter);
app.route('/api/customers', customersRouter);

// Clock Sync Endpoint
app.get('/api/time', (c) => {
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    return c.json({ time: Date.now() });
});

// Manually trigger the daily report (same job the Cron Trigger runs on schedule)
app.get('/api/cron/daily-reports', async (c) => {
    try {
        console.log('Manual trigger: Generating daily reports...');
        const result = await generateDailyReports(c.env);
        return c.json({ success: true, result });
    } catch (error) {
        console.error('Daily report generation failed:', error);
        return c.json({ error: error.message }, 500);
    }
});

app.post('/api/test-email', async (c) => {
    try {
        const result = await generateDailyReports(c.env);
        return c.json(result);
    } catch (error) {
        console.error('Test email failed:', error);
        return c.json({ error: error.message }, 500);
    }
});

// Send a work report for a single user on a single date — goes only to that
// user's own email, no admin copy and no blast to everyone else.
app.post('/api/test-email/user', async (c) => {
    try {
        const { user_id, date } = await c.req.json();
        if (!user_id || !date) {
            return c.json({ error: 'user_id and date are required' }, 400);
        }
        const result = await generateReportForUser(c.env, user_id, date);
        return c.json(result);
    } catch (error) {
        console.error('Targeted test email failed:', error);
        return c.json({ error: error.message }, 500);
    }
});

export default {
    fetch: app.fetch,

    // Runs on the schedule configured in wrangler.jsonc (replaces the old node-cron job)
    async scheduled(event, env, ctx) {
        console.log('Cron Trigger fired: generating daily reports...');
        ctx.waitUntil(
            generateDailyReports(env).catch(err => console.error('Scheduled daily report failed:', err))
        );
    },
};
