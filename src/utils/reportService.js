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
        
        // If still paused at the time of calculation, subtract the ongoing pause duration
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
    
    // Final interval (if currently active)
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
    
    // 1. Get current date range (start and end of today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    try {
        // 2. Fetch all work orders active today (started before tomorrow and either open or finished today)
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

        // Calculate durations for today and filter out 0 activity
        const activeWorkOrders = (workOrders || [])
            .map(order => {
                const dailyMs = calculateDailyDuration(order.time_in, order.time_out, order.pause_history, dayStartMs, dayEndMs);
                return { ...order, _dailyMs: dailyMs };
            })
            .filter(order => order._dailyMs > 0);

        // 3. Fetch all admins
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
                
                // Prepare logo attachment
                const logoPath = path.join(__dirname, '../../public/assets/a360b.png');
                const attachments = [];
                if (fs.existsSync(logoPath)) {
                    attachments.push({
                        filename: 'a360b.png',
                        path: logoPath,
                        cid: 'a360logo'
                    });
                }
                
                await sendEmail(adminEmail, subject, noActivityHtml, attachments);
                return { success: true, message: 'No work orders found with activity. Admin notified.' };
            }
            
            return { success: true, message: 'No work orders with activity for today.' };
        }

        // 4. Fetch all users for lookup (names and emails of tagged users)
        const { data: allUsers, error: usersError } = await supabase
            .from('users')
            .select('id, name, username');
        
        if (usersError) throw usersError;

        const userMap = {};
        allUsers.forEach(u => { userMap[u.id] = u; });

        // 5. Group work orders by user (Lead or Tagged)
        const userReports = {};
        
        // Prepare logo attachment for CID embedding
        const logoPath = path.join(__dirname, '../../public/assets/a360b.png');
        const attachments = [];
        if (fs.existsSync(logoPath)) {
            attachments.push({
                filename: 'a360b.png',
                path: logoPath,
                cid: 'a360logo' // matches src="cid:a360logo" in template
            });
        }

        activeWorkOrders.forEach(order => {
            const leadId = order.user_id;
            const taggedIds = Array.isArray(order.tagged_user_ids) ? order.tagged_user_ids : [];
            
            const leadName = userMap[leadId]?.name || 'Unknown';
            const taggedNames = taggedIds.map(id => userMap[id]?.name).filter(Boolean);

            // Add to Lead's report
            if (leadId && userMap[leadId]) {
                const user = userMap[leadId];
                if (!userReports[leadId]) {
                    userReports[leadId] = { name: user.name, email: user.username, orders: [] };
                }
                userReports[leadId].orders.push({ 
                    ...order, 
                    _isTagged: false,
                    _leadName: leadName,
                    _taggedNames: taggedNames
                });
            }

            // Add to Tagged users' reports
            taggedIds.forEach(tId => {
                if (tId && userMap[tId]) {
                    const user = userMap[tId];
                    if (!userReports[tId]) {
                        userReports[tId] = { name: user.name, email: user.username, orders: [] };
                    }
                    // Avoid duplicates if user is both lead and tagged
                    if (!userReports[tId].orders.find(o => o.id === order.id)) {
                        userReports[tId].orders.push({ 
                            ...order, 
                            _isTagged: true,
                            _leadName: leadName,
                            _taggedNames: taggedNames
                        });
                    }
                }
            });
        });

        // 5. Send individual reports to users and admin
        console.log(`Target Admin Email: "${adminEmail}"`);
        
        for (const userId in userReports) {
            const report = userReports[userId];
            const html = generateUserHtml(report);
            const subject = `Daily Work Summary - ${report.name} - ${new Date().toLocaleDateString()}`;

            // Send to user
            if (report.email && report.email.includes('@')) {
                console.log(`Sending report to user: ${report.email}`);
                await sendEmail(report.email, subject, html, attachments);
            }

            // Send copy to admin (as separate email per user)
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
            <!-- Header Table -->
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
            <!-- Header Table -->
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
    calculateDuration,
    calculateDailyDuration,
    formatDuration 
};
