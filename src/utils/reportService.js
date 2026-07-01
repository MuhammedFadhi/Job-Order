const supabase = require('../supabaseClient');
const { sendEmail } = require('./emailService');
const path = require('path');
const fs = require('fs');

/**
 * Calculates the total duration in milliseconds, excluding pauses.
 */
function calculateDuration(timeIn, timeOut, pauseHistory) {
    if (!timeIn) return 0;

    const start = new Date(timeIn).getTime();
    const end = timeOut ? new Date(timeOut).getTime() : Date.now();

    let totalPauseTime = 0;
    let lastPauseAt = null;

    if (Array.isArray(pauseHistory)) {
        pauseHistory.forEach(event => {
            if (event.type === 'pause') {
                lastPauseAt = event.at;
            } else if ((event.type === 'resume' || event.type === 'end') && lastPauseAt) {
                totalPauseTime += (event.at - lastPauseAt);
                lastPauseAt = null;
            }
        });

        if (lastPauseAt) {
            totalPauseTime += (end - lastPauseAt);
        }
    }

    const duration = (end - start) - totalPauseTime;
    return Math.max(0, duration);
}

/**
 * Calculates the duration in milliseconds that falls within a specific day.
 */
function calculateDailyDuration(timeIn, timeOut, pauseHistory, dayStartMs, dayEndMs) {
    if (!timeIn) return 0;

    const intervals = [];
    let currentStart = new Date(timeIn).getTime();

    if (Array.isArray(pauseHistory)) {
        pauseHistory.forEach(event => {
            if (event.type === 'pause') {
                if (currentStart) {
                    intervals.push([currentStart, event.at]);
                    currentStart = null;
                }
            } else if (event.type === 'resume' || event.type === 'end') {
                currentStart = event.at;
            }
        });
    }

    if (currentStart) {
        const end = timeOut ? new Date(timeOut).getTime() : Date.now();
        intervals.push([currentStart, end]);
    }

    let totalMsForDay = 0;
    intervals.forEach(([start, stop]) => {
        const overlapStart = Math.max(start, dayStartMs);
        const overlapEnd = Math.min(stop, dayEndMs);
        if (overlapStart < overlapEnd) {
            totalMsForDay += (overlapEnd - overlapStart);
        }
    });

    return totalMsForDay;
}

/**
 * Formats duration in ms to "Xh Ym"
 */
function formatDuration(ms) {
    if (!ms || ms < 0) return '0m';
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/**
 * Generates and sends daily work reports to users and administrators.
 */
async function generateDailyReports() {
    console.log('Generating daily work reports...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    try {
        const { data: workOrders, error: woError } = await supabase
            .from('work_orders')
            .select(`
                *,
                users (name, username),
                job_orders (title)
            `)
            .lt('time_in', tomorrow.toISOString())
            .or(`time_out.is.null,time_out.gte.${today.toISOString()}`);

        if (woError) throw woError;

        const dayStartMs = today.getTime();
        const dayEndMs = tomorrow.getTime();

        const activeWorkOrders = (workOrders || [])
            .map(order => {
                const dailyMs = calculateDailyDuration(order.time_in, order.time_out, order.pause_history, dayStartMs, dayEndMs);
                return { ...order, _dailyMs: dailyMs };
            })
            .filter(order => order._dailyMs > 0);

        const { data: admins, error: adminError } = await supabase
            .from('users')
            .select('name, username')
            .eq('role', 'Admin');

        if (adminError) throw adminError;

        const adminEmail = (process.env.ADMIN_EMAIL || '').trim();

        if (!activeWorkOrders || activeWorkOrders.length === 0) {
            console.log('No work orders found with activity today. Sending "No Activity" report to admin...');

            if (adminEmail) {
                const noActivityHtml = generateNoActivityHtml();
                const subject = `Daily Work Summary - No Activity - ${new Date().toLocaleDateString()}`;

                const logoPath = path.join(__dirname, '../../public/assets/a360b.png');
                const attachments = [];
                if (fs.existsSync(logoPath)) {
                    attachments.push({ filename: 'a360b.png', path: logoPath, cid: 'a360logo' });
                }

                await sendEmail(adminEmail, subject, noActivityHtml, attachments);
                return { success: true, message: 'No work orders found with activity. Admin notified.' };
            }

            return { success: true, message: 'No work orders with activity for today.' };
        }

        const { data: allUsers, error: usersError } = await supabase
            .from('users')
            .select('id, name, username');

        if (usersError) throw usersError;

        const userMap = {};
        allUsers.forEach(u => { userMap[u.id] = u; });

        const userReports = {};

        const logoPath = path.join(__dirname, '../../public/assets/a360b.png');
        const attachments = [];
        if (fs.existsSync(logoPath)) {
            attachments.push({ filename: 'a360b.png', path: logoPath, cid: 'a360logo' });
        }

        activeWorkOrders.forEach(order => {
            const leadId = order.user_id;
            const taggedIds = Array.isArray(order.tagged_user_ids) ? order.tagged_user_ids : [];

            const leadName = userMap[leadId]?.name || 'Unknown';
            const taggedNames = taggedIds.map(id => userMap[id]?.name).filter(Boolean);

            if (leadId && userMap[leadId]) {
                const user = userMap[leadId];
                if (!userReports[leadId]) {
                    userReports[leadId] = { name: user.name, email: user.username, orders: [] };
                }
                userReports[leadId].orders.push({ ...order, _isTagged: false, _leadName: leadName, _taggedNames: taggedNames });
            }

            taggedIds.forEach(tId => {
                if (tId && userMap[tId]) {
                    const user = userMap[tId];
                    if (!userReports[tId]) {
                        userReports[tId] = { name: user.name, email: user.username, orders: [] };
                    }
                    if (!userReports[tId].orders.find(o => o.id === order.id)) {
                        userReports[tId].orders.push({ ...order, _isTagged: true, _leadName: leadName, _taggedNames: taggedNames });
                    }
                }
            });
        });

        console.log(`Target Admin Email: "${adminEmail}"`);

        for (const userId in userReports) {
            const report = userReports[userId];
            const html = generateUserHtml(report);
            const subject = `Daily Work Summary - ${report.name} - ${new Date().toLocaleDateString()}`;

            if (report.email && report.email.includes('@')) {
                console.log(`Sending report to user: ${report.email}`);
                await sendEmail(report.email, subject, html, attachments);
            }

            if (adminEmail && adminEmail !== report.email) {
                console.log(`Sending copy to admin: ${adminEmail}`);
                await sendEmail(adminEmail, ` ${subject}`, html, attachments);
            }
        }

        return { success: true, totalUsers: Object.keys(userReports).length, totalOrders: activeWorkOrders.length };

    } catch (error) {
        console.error('Error generating reports:', error);
        throw error;
    }
}

/**
 * Sends a project progress report for a specific Job Order.
 * Recipients: customer emails + all workers on the JO + the person who triggered it.
 */
async function sendProgressReport(jobOrderId, requesterId) {
    // 1. Fetch job order with work orders
    const { data: jobOrder, error: joError } = await supabase
        .from('job_orders')
        .select('*, work_orders(*)')
        .eq('id', jobOrderId)
        .single();

    if (joError || !jobOrder) throw new Error('Job order not found');

    // 2. Fetch all users for lookup
    const { data: allUsers } = await supabase.from('users').select('id, name, username, color_code');
    const userMap = {};
    if (allUsers) allUsers.forEach(u => { userMap[u.id] = u; });

    // 3. Collect all recipient emails (deduplicated)
    const recipientEmails = new Set();

    // Add requester's email
    if (requesterId && userMap[requesterId]?.username) {
        recipientEmails.add(userMap[requesterId].username);
    }

    // Add all workers (lead + tagged) from each work order
    (jobOrder.work_orders || []).forEach(wo => {
        if (wo.user_id && userMap[wo.user_id]?.username) {
            recipientEmails.add(userMap[wo.user_id].username);
        }
        if (Array.isArray(wo.tagged_user_ids)) {
            wo.tagged_user_ids.forEach(tId => {
                if (userMap[tId]?.username) recipientEmails.add(userMap[tId].username);
            });
        }
    });

    // 4. Add customer emails from the customers table
    if (jobOrder.customer_name) {
        const { data: customer } = await supabase
            .from('customers')
            .select('emails')
            .eq('name', jobOrder.customer_name)
            .single();

        if (customer && Array.isArray(customer.emails)) {
            customer.emails.forEach(email => {
                if (email && email.includes('@')) recipientEmails.add(email.trim());
            });
        }
    }

    const validRecipients = [...recipientEmails].filter(e => e && e.includes('@'));
    if (validRecipients.length === 0) {
        throw new Error('No valid recipient email addresses found');
    }

    // 5. Build the email
    const logoPath = path.join(__dirname, '../../public/assets/a360b.png');
    const attachments = [];
    if (fs.existsSync(logoPath)) {
        attachments.push({ filename: 'a360b.png', path: logoPath, cid: 'a360logo' });
    }

    const allCompleted = (jobOrder.work_orders || []).length > 0 &&
        (jobOrder.work_orders || []).every(wo => wo.status === 'completed');

    const html = allCompleted
        ? generateSignOffHtml(jobOrder, userMap)
        : generateProgressReportHtml(jobOrder, userMap, false);
    const subject = allCompleted
        ? `Job Sign-Off: ${jobOrder.title} [${jobOrder.id}]`
        : `Project Progress Report: ${jobOrder.title} [${jobOrder.id}]`;

    // Send to all recipients
    for (const email of validRecipients) {
        console.log(`Sending progress report to: ${email}`);
        await sendEmail(email, subject, html, attachments);
    }

    return { success: true, recipientCount: validRecipients.length, recipients: validRecipients };
}

function generateSignOffHtml(jobOrder, userMap) {
    const testedLabel = { not_tested: 'Not Tested', testing: 'Testing', pass: 'Pass', needs_fix: 'Needs Fix' };
    const testedColor = { not_tested: '#94a3b8', testing: '#f59e0b', pass: '#22c55e', needs_fix: '#ef4444' };

    const workOrders = (jobOrder.work_orders || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const totalMs = workOrders.reduce((sum, wo) => sum + calculateDuration(wo.time_in, wo.time_out, wo.pause_history), 0);
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const rows = workOrders.map(wo => {
        const workedMs = calculateDuration(wo.time_in, wo.time_out, wo.pause_history);
        const workedStr = wo.status === 'pending' ? '—' : formatDuration(workedMs);
        const estimateStr = wo.estimate_time
            ? (Math.floor(wo.estimate_time / 60) > 0
                ? `${Math.floor(wo.estimate_time / 60)}h ${wo.estimate_time % 60 > 0 ? wo.estimate_time % 60 + 'm' : ''}`.trim()
                : `${wo.estimate_time}m`)
            : '—';
        const assignedUser = wo.user_id && userMap[wo.user_id] ? userMap[wo.user_id].name : 'Open';
        const tested = wo.tested || 'not_tested';

        return `
        <tr>
            <td style="padding:10px 8px; border-bottom:1px solid #eee; font-size:12px; color:#666;">${wo.id}</td>
            <td style="padding:10px 8px; border-bottom:1px solid #eee; font-size:13px;">${wo.description || '—'}</td>
            <td style="padding:10px 8px; border-bottom:1px solid #eee; font-size:12px; text-align:center;">${estimateStr}</td>
            <td style="padding:10px 8px; border-bottom:1px solid #eee; font-size:13px; text-align:center; font-weight:700;">${workedStr}</td>
            <td style="padding:10px 8px; border-bottom:1px solid #eee; font-size:12px; text-align:center;">
                <span style="padding:2px 8px; background:${testedColor[tested]}22; color:${testedColor[tested]}; border-radius:4px;">${testedLabel[tested]}</span>
            </td>
            <td style="padding:10px 8px; border-bottom:1px solid #eee; font-size:12px; text-align:center;">
                <span style="padding:2px 8px; background:#22c55e22; color:#22c55e; border-radius:4px;">Completed</span>
            </td>
            <td style="padding:10px 8px; border-bottom:1px solid #eee; font-size:13px;">${assignedUser}</td>
        </tr>`;
    }).join('');

    return `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; color:#333; max-width:700px; margin:auto; background:#fff; padding:36px; border:1px solid #e5e7eb; border-radius:12px;">

        <!-- Header -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
            <tr>
                <td style="vertical-align:top;">
                    <h2 style="color:#6366f1; margin:0; font-size:26px; font-weight:700;">Job Sign-Off</h2>
                    <p style="margin:6px 0 0; color:#888; font-size:14px;">${dateStr}</p>
                </td>
                <td style="vertical-align:top; text-align:right;">
                    <img src="cid:a360logo" alt="a360" style="height:42px; width:auto;">
                </td>
            </tr>
        </table>

        <!-- Job Order Info -->
        <div style="background:#f8f9fb; border-radius:8px; padding:16px 20px; margin-bottom:24px; border-left:4px solid #6366f1;">
            <div style="font-size:12px; color:#aaa; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Job Order</div>
            <div style="font-size:18px; font-weight:700; color:#111;">${jobOrder.title} <span style="color:#aaa; font-size:14px; font-weight:normal;">[${jobOrder.id}]</span></div>
            ${jobOrder.customer_name ? `<div style="font-size:13px; color:#555; margin-top:6px;"><strong>Customer:</strong> ${jobOrder.customer_name}</div>` : ''}
            <div style="margin-top:10px; font-size:13px; color:#22c55e; font-weight:600;">${workOrders.length} of ${workOrders.length} work orders completed</div>
        </div>

        <!-- Scope of Work -->
        <div style="margin-bottom:12px;">
            <span style="font-size:12px; font-weight:700; color:#6366f1; text-transform:uppercase; letter-spacing:0.07em;">Scope of Work</span>
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:8px 0 0;">
        </div>

        <table style="width:100%; border-collapse:collapse; border:1px solid #f0f2f5; border-radius:8px; overflow:hidden;">
            <thead>
                <tr style="background:#f8f9fb;">
                    <th style="text-align:left; padding:9px 8px; font-size:11px; color:#7b809a; text-transform:uppercase; border-bottom:1px solid #eee;">ID</th>
                    <th style="text-align:left; padding:9px 8px; font-size:11px; color:#7b809a; text-transform:uppercase; border-bottom:1px solid #eee;">Description</th>
                    <th style="text-align:center; padding:9px 8px; font-size:11px; color:#7b809a; text-transform:uppercase; border-bottom:1px solid #eee;">Est. Time</th>
                    <th style="text-align:center; padding:9px 8px; font-size:11px; color:#7b809a; text-transform:uppercase; border-bottom:1px solid #eee;">Time Taken</th>
                    <th style="text-align:center; padding:9px 8px; font-size:11px; color:#7b809a; text-transform:uppercase; border-bottom:1px solid #eee;">Tested</th>
                    <th style="text-align:center; padding:9px 8px; font-size:11px; color:#7b809a; text-transform:uppercase; border-bottom:1px solid #eee;">Status</th>
                    <th style="text-align:left; padding:9px 8px; font-size:11px; color:#7b809a; text-transform:uppercase; border-bottom:1px solid #eee;">Assigned To</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>

        <!-- Total Time -->
        <table style="width:100%; border-collapse:collapse; margin-top:16px; background:#fdfdff; border:1px solid #edf0f5; border-radius:8px;">
            <tr>
                <td style="padding:14px 16px; font-size:15px; font-weight:600; color:#111;">Total Time Worked</td>
                <td style="padding:14px 16px; text-align:right; font-size:15px; font-weight:700; color:#6366f1;">${formatDuration(totalMs)}</td>
            </tr>
        </table>

        <!-- Footer -->
        <div style="margin-top:28px; padding-top:20px; border-top:1px solid #eee; text-align:center;">
            <p style="font-size:12px; color:#999; margin:0;">This report was generated from the Job Order System</p>
            <p style="font-size:11px; color:#bbb; margin:4px 0 0;">&copy; ${new Date().getFullYear()} a360. All rights reserved.</p>
        </div>

    </div>`;
}

function generateProgressReportHtml(jobOrder, userMap, allCompleted) {
    const testedLabel = { not_tested: 'Not Tested', testing: 'Testing', pass: 'Pass', needs_fix: 'Needs Fix' };
    const testedColor = { not_tested: '#94a3b8', testing: '#f59e0b', pass: '#22c55e', needs_fix: '#ef4444' };

    const workOrders = (jobOrder.work_orders || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const rows = workOrders.map(wo => {
        const workedMs = calculateDuration(wo.time_in, wo.time_out, wo.pause_history);
        const workedStr = wo.status === 'pending' ? '—' : formatDuration(workedMs);
        const estimateStr = wo.estimate_time
            ? (Math.floor(wo.estimate_time / 60) > 0
                ? `${Math.floor(wo.estimate_time / 60)}h ${wo.estimate_time % 60 > 0 ? wo.estimate_time % 60 + 'm' : ''}`.trim()
                : `${wo.estimate_time}m`)
            : '—';
        const assignedUser = wo.user_id && userMap[wo.user_id] ? userMap[wo.user_id].name : 'Open';
        const tested = wo.tested || 'not_tested';
        const statusColor = { pending: '#94a3b8', started: '#6366f1', ongoing: '#6366f1', paused: '#6366f1', completed: '#22c55e' };
        const statusLabel = { pending: 'Pending', started: 'In Progress', ongoing: 'In Progress', paused: 'In Progress', completed: 'Completed' };

        return `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; color: #666;">${wo.id}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 14px;">${wo.description || '—'}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; text-align: center;">${estimateStr}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; text-align: center; font-weight: 600;">${workedStr}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; text-align: center;">
                <span style="padding: 2px 8px; background: ${testedColor[tested]}22; color: ${testedColor[tested]}; border-radius: 4px; font-size: 12px;">${testedLabel[tested]}</span>
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 13px;">
                <span style="padding: 2px 8px; background: ${(statusColor[wo.status] || '#94a3b8')}22; color: ${statusColor[wo.status] || '#94a3b8'}; border-radius: 4px; font-size: 12px;">${statusLabel[wo.status] || wo.status}</span>
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 13px;">${assignedUser}</td>
        </tr>`;
    }).join('');

    const totalMs = workOrders.reduce((sum, wo) => sum + calculateDuration(wo.time_in, wo.time_out, wo.pause_history), 0);
    const completedCount = workOrders.filter(wo => wo.status === 'completed').length;
    const statusBannerColor = allCompleted ? '#22c55e' : '#6366f1';
    const statusBannerText = allCompleted ? 'All work orders completed!' : `${completedCount} of ${workOrders.length} work orders completed`;

    return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 700px; margin: auto; border: 1px solid #eef0f2; border-radius: 12px; padding: 30px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
            <tr>
                <td style="vertical-align: top;">
                    <h2 style="color: #6366f1; margin: 0; font-size: 22px;">${allCompleted ? 'Project Completed' : 'Project Progress Report'}</h2>
                    <p style="margin: 6px 0 0; color: #666; font-size: 15px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </td>
                <td style="vertical-align: top; text-align: right;">
                    <img src="cid:a360logo" alt="a360" style="height: 45px; width: auto;">
                </td>
            </tr>
        </table>

        <div style="background: #f8f9fb; border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 4px solid ${statusBannerColor};">
            <div style="font-size: 13px; color: #888; margin-bottom: 4px;">Job Order</div>
            <div style="font-size: 18px; font-weight: 700; color: #111;">${jobOrder.title} <span style="color: #aaa; font-size: 14px; font-weight: normal;">[${jobOrder.id}]</span></div>
            ${jobOrder.customer_name ? `<div style="font-size: 13px; color: #666; margin-top: 4px;"><strong>Customer:</strong> ${jobOrder.customer_name}</div>` : ''}
            ${jobOrder.description ? `<div style="font-size: 13px; color: #666; margin-top: 4px;">${jobOrder.description}</div>` : ''}
            <div style="margin-top: 10px; font-size: 13px; color: ${statusBannerColor}; font-weight: 600;">${statusBannerText}</div>
        </div>

        <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 13px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.05em;">Scope of Work</span>
            <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
        </div>

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #f0f2f5; border-radius: 8px; overflow: hidden;">
            <thead>
                <tr style="background: #f8f9fb;">
                    <th style="text-align: left; padding: 10px; font-size: 12px; color: #7b809a; text-transform: uppercase;">ID</th>
                    <th style="text-align: left; padding: 10px; font-size: 12px; color: #7b809a; text-transform: uppercase;">Description</th>
                    <th style="text-align: center; padding: 10px; font-size: 12px; color: #7b809a; text-transform: uppercase;">Est. Time</th>
                    <th style="text-align: center; padding: 10px; font-size: 12px; color: #7b809a; text-transform: uppercase;">Time Taken</th>
                    <th style="text-align: center; padding: 10px; font-size: 12px; color: #7b809a; text-transform: uppercase;">Tested</th>
                    <th style="text-align: center; padding: 10px; font-size: 12px; color: #7b809a; text-transform: uppercase;">Status</th>
                    <th style="text-align: left; padding: 10px; font-size: 12px; color: #7b809a; text-transform: uppercase;">Assigned To</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; background: #fdfdff; border: 1px solid #edf0f5; border-radius: 10px;">
            <tr>
                <td style="padding: 16px; font-size: 16px; font-weight: 600; color: #111;">Total Time Worked</td>
                <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 600; color: #6366f1;">${formatDuration(totalMs)}</td>
            </tr>
        </table>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
            <p style="font-size: 13px; color: #999; margin: 0;">This report was generated from the Job Order System.</p>
            <p style="font-size: 12px; color: #bbb; margin: 5px 0 0;">&copy; ${new Date().getFullYear()} a360. All rights reserved.</p>
        </div>
    </div>`;
}

function generateUserHtml(report) {
    const totalMs = report.orders.reduce((sum, o) => sum + o._dailyMs, 0);
    const rows = report.orders.map(o => `
        <tr>
            <td style="padding: 12px 10px; border-bottom: 1px solid #eee; font-size: 14px;">${o.id}</td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #eee; font-size: 14px; font-weight: 500;">
                ${o.job_orders?.title || 'N/A'}
                ${o._isTagged
                    ? `<br><span style="font-size: 11px; color: #6366f1; background: #f0f1ff; padding: 1px 6px; border-radius: 4px; font-weight: normal;">Lead: ${o._leadName}</span>`
                    : (o._taggedNames && o._taggedNames.length > 0
                        ? `<br><span style="font-size: 11px; color: #6366f1; background: #f0f1ff; padding: 1px 6px; border-radius: 4px; font-weight: normal;">Tagged: ${o._taggedNames.join(', ')}</span>`
                        : '')}
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #eee; font-size: 14px; color: #666;">${o.description || 'No description'}</td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #eee; font-size: 13px;">
                <span style="padding: 2px 8px; background: #f0f0f0; border-radius: 4px; color: #555;">${o.status}</span>
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #eee; font-size: 14px; font-weight: bold; color: #333;">${formatDuration(o._dailyMs)}</td>
        </tr>
    `).join('');

    return `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #eef0f2; border-radius: 12px; padding: 30px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr>
                    <td style="vertical-align: top;">
                        <h2 style="color: #6366f1; margin: 0; font-size: 24px;">Hello, ${report.name}!</h2>
                        <p style="margin: 8px 0 0; color: #666; font-size: 15px;">Here is your daily work summary for today:</p>
                        <p style="margin: 4px 0 0; color: #111; font-weight: bold; font-size: 15px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </td>
                    <td style="vertical-align: top; text-align: right;">
                        <img src="cid:a360logo" alt="a360" style="height: 45px; width: auto;">
                    </td>
                </tr>
            </table>

            <table style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #f0f2f5; border-radius: 8px; overflow: hidden;">
                <thead>
                    <tr style="background: #f8f9fb;">
                        <th style="text-align: left; padding: 12px 10px; font-size: 13px; color: #7b809a; text-transform: uppercase;">ID</th>
                        <th style="text-align: left; padding: 12px 10px; font-size: 13px; color: #7b809a; text-transform: uppercase;">Job Title</th>
                        <th style="text-align: left; padding: 12px 10px; font-size: 13px; color: #7b809a; text-transform: uppercase;">Description</th>
                        <th style="text-align: left; padding: 12px 10px; font-size: 13px; color: #7b809a; text-transform: uppercase;">Status</th>
                        <th style="text-align: left; padding: 12px 10px; font-size: 13px; color: #7b809a; text-transform: uppercase;">Duration Today</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <table style="width: 100%; border-collapse: collapse; margin-top: 25px; background: #fdfdff; border: 1px solid #edf0f5; border-radius: 10px;">
                <tr>
                    <td style="padding: 20px; font-size: 18px; font-weight: 600; color: #000000ff;">Total Hours Today</td>
                    <td style="padding: 20px; text-align: right; font-size: 18px; font-weight: 600; color: #000000ff;">${formatDuration(totalMs)}</td>
                </tr>
            </table>

            <div style="margin-top: 35px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
                <p style="font-size: 13px; color: #999; margin: 0;">This is an automated report from the Job Order System.</p>
                <p style="font-size: 12px; color: #bbb; margin: 5px 0 0;">&copy; ${new Date().getFullYear()} a360. All rights reserved.</p>
            </div>
        </div>
    `;
}

function generateNoActivityHtml() {
    return `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #eef0f2; border-radius: 12px; padding: 30px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr>
                    <td style="vertical-align: top;">
                        <h2 style="color: #6366f1; margin: 0; font-size: 24px;">Daily Summary</h2>
                        <p style="margin: 8px 0 0; color: #666; font-size: 15px;">Status report for today:</p>
                        <p style="margin: 4px 0 0; color: #111; font-weight: bold; font-size: 15px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </td>
                    <td style="vertical-align: top; text-align: right;">
                        <img src="cid:a360logo" alt="a360" style="height: 45px; width: auto;">
                    </td>
                </tr>
            </table>

            <div style="padding: 40px 20px; text-align: center; background: #f8f9fb; border-radius: 8px; border: 1px dashed #cbd5e1; margin-bottom: 25px;">
                <p style="font-size: 16px; color: #64748b; margin: 0;">No work orders were logged for today.</p>
            </div>

            <div style="margin-top: 35px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
                <p style="font-size: 13px; color: #999; margin: 0;">This is an automated report from the Job Order System.</p>
                <p style="font-size: 12px; color: #bbb; margin: 5px 0 0;">&copy; ${new Date().getFullYear()} a360. All rights reserved.</p>
            </div>
        </div>
    `;
}

module.exports = {
    generateDailyReports,
    sendProgressReport,
    calculateDuration,
    calculateDailyDuration,
    formatDuration
};
