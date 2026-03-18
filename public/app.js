/**
 * Nexus Job Management - Frontend Logic
 */

// State
let currentUser = null;
let currentJobOrder = null;
let allUsers = [];

// API Configuration
const API_BASE = '/api';

// Clock Sync
let serverOffset = 0;
    
async function syncServerTime() {
    try {
        const start = Date.now();
        // Add cache-busting query parameter
        const res = await fetch(`${API_BASE}/time?t=${start}`);
        const { time: serverTime } = await res.json();
        const end = Date.now();
        // serverOffset = average server time - average client time
        const rtt = end - start;
        serverOffset = serverTime - (start + rtt / 2);
        console.log(`[Clock Sync] Server Time: ${new Date(serverTime).toLocaleTimeString()}`);
        console.log(`[Clock Sync] Server Offset: ${serverOffset}ms (RTT: ${rtt}ms)`);
    } catch (err) {
        console.error('Failed to sync server time:', err);
    }
}

function getServerNow() {
    return Date.now() + serverOffset;
}

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    register: document.getElementById('register-view'),
    dashboard: document.getElementById('dashboard-view'),
    admin: document.getElementById('admin-view')
};

const modals = {
    newJob: document.getElementById('new-job-modal'),
    jobDetail: document.getElementById('job-detail-modal'),
    editJob: document.getElementById('edit-job-modal'),
    editWork: document.getElementById('edit-work-modal')
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

async function initApp() {
    // 0. Synchronize time with server
    await syncServerTime();

    // 1. Restore session from localStorage if available (ASAP)
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            // Update Top Nav
            document.getElementById('current-user-name').textContent = currentUser.name;
            document.getElementById('current-user-role').textContent = currentUser.role;
            document.getElementById('current-user-avatar').textContent = currentUser.name.charAt(0);
            switchView('dashboard');
            loadDashboard();
            
            // Show Admin Nav if user is Admin
            if (currentUser && currentUser.role === 'Admin') {
                const adminNavLink = document.getElementById('admin-nav-link');
                if (adminNavLink) adminNavLink.classList.remove('hidden');
            }
        } catch (e) {
            localStorage.removeItem('currentUser');
            switchView('login');
        }
    } else {
        switchView('login');
    }

    // 2. Fetch Users for dropdowns (Job Assignment) in background
    try {
        const res = await fetch(`${API_BASE}/users`);
        allUsers = await res.json();
    } catch (err) {
        showToast('Error loading users for dropdowns.', 'error');
    }
}

function setupEventListeners() {
    // Nav 
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    
    // Stopwatch Pause
    const btnPause = document.getElementById('btn-pause-stopwatch');
    if (btnPause) {
        btnPause.addEventListener('click', togglePauseStopwatch);
    }
    
    // Auth Forms
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', handleAuthLogin);
    }
    
    const regForm = document.getElementById('register-form');
    if (regForm) {
        regForm.addEventListener('submit', handleAuthRegister);
    }

    const linkToRegister = document.getElementById('link-to-register');
    if (linkToRegister) {
        linkToRegister.addEventListener('click', (e) => {
            e.preventDefault();
            switchView('register');
        });
    }

    const linkToLogin = document.getElementById('link-to-login');
    if (linkToLogin) {
        linkToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            switchView('login');
        });
    }

    // Modals
    document.getElementById('btn-new-job').addEventListener('click', () => {
        populateUserDropdown('nj-assigned');
        openModal(modals.newJob);
    });

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            if (modal) closeModal(modal);
        });
    });

    // Forms
    document.getElementById('new-job-form').addEventListener('submit', handleCreateJob);
    
    // Work Orders
    document.getElementById('btn-new-work').addEventListener('click', () => {
        document.getElementById('new-work-form').classList.remove('hidden');
        document.getElementById('btn-new-work').classList.add('hidden');
    });

    document.getElementById('btn-edit-job').addEventListener('click', () => {
        if (currentJobOrder) openEditJobModal(currentJobOrder.id);
    });

    document.getElementById('btn-cancel-work').addEventListener('click', () => {
        document.getElementById('new-work-form').classList.add('hidden');
        document.getElementById('new-work-form').reset();
        document.getElementById('btn-new-work').classList.remove('hidden');
    });

    document.getElementById('new-work-form').addEventListener('submit', handleCreateWorkOrder);
    document.getElementById('edit-job-form').addEventListener('submit', handleUpdateJob);
    document.getElementById('edit-work-form').addEventListener('submit', handleUpdateWorkOrder);
    document.getElementById('btn-close-job').addEventListener('click', handleCloseJobOrder);

    // Admin Navigation
    const btnGotoAdmin = document.getElementById('btn-goto-admin');
    if (btnGotoAdmin) {
        btnGotoAdmin.addEventListener('click', () => {
            switchView('admin');
            loadAdminDashboard();
        });
    }

    const btnBackToJobs = document.getElementById('btn-back-to-jobs');
    if (btnBackToJobs) {
        btnBackToJobs.addEventListener('click', () => {
            switchView('dashboard');
            loadDashboard();
            
            // Show Admin Nav if user is Admin
            if (currentUser && currentUser.role === 'Admin') {
                const adminNavLink = document.getElementById('admin-nav-link');
                if (adminNavLink) adminNavLink.classList.remove('hidden');
            }
        });
    }

    // Admin Tab Switching
    const adminTabs = document.getElementById('admin-tabs');
    if (adminTabs) {
        adminTabs.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                const filter = e.target.dataset.tab;
                loadAdminDashboard(filter);
            }
        });
    }

    const adminDateFilter = document.getElementById('admin-date-filter');
    const adminDatePickerGroup = document.getElementById('admin-date-picker-group');
    if (adminDateFilter && adminDatePickerGroup) {
        adminDatePickerGroup.addEventListener('click', () => {
            try {
                if (typeof adminDateFilter.showPicker === 'function') {
                    adminDateFilter.showPicker();
                } else {
                    adminDateFilter.focus();
                    adminDateFilter.click();
                }
            } catch (err) {
                adminDateFilter.focus();
                adminDateFilter.click();
            }
        });

        adminDateFilter.addEventListener('change', (e) => {
            // Stop propagation to prevent re-opening on selection in some browsers
            e.stopPropagation();
            const activeTab = document.querySelector('.admin-tabs .tab-btn.active')?.dataset.tab || 'all';
            loadAdminDashboard(activeTab);
        });
    }
}

// --- View Management ---

function switchView(viewName) {
    Object.values(views).forEach(view => {
        view.classList.remove('active-view');
        view.classList.add('hidden-view');
    });
    views[viewName].classList.remove('hidden-view');
    // small timeout to allow display:block to apply before animating opacity
    setTimeout(() => views[viewName].classList.add('active-view'), 50);
}

function openModal(modalEl) {
    modalEl.classList.remove('hidden');
}

function closeModal(modalEl) {
    modalEl.classList.add('hidden');
}

// --- Login Logic ---

async function handleAuthLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-auth');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;

    const usernameInput = document.getElementById('auth-username').value;
    const passwordInput = document.getElementById('auth-password').value;

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        
        const data = await res.json();
        
        btn.innerHTML = 'Sign In <i class="fa-solid fa-arrow-right"></i>';
        btn.disabled = false;

        if(res.ok) {
            currentUser = data.user;
            // Save session to localStorage
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Update Top Nav
            document.getElementById('current-user-name').textContent = currentUser.name;
            document.getElementById('current-user-role').textContent = currentUser.role;
            document.getElementById('current-user-avatar').textContent = currentUser.name.charAt(0);
            
            showToast(`Welcome back, ${currentUser.name}!`, 'success');
            document.getElementById('auth-form').reset();
            
            switchView('dashboard');
            loadDashboard();
            
            // Show Admin Nav if user is Admin
            if (currentUser && currentUser.role === 'Admin') {
                const adminNavLink = document.getElementById('admin-nav-link');
                if (adminNavLink) adminNavLink.classList.remove('hidden');
            }
        } else {
            showToast(data.error || 'Authentication failed', 'error');
        }
    } catch (err) {
        btn.innerHTML = 'Sign In <i class="fa-solid fa-arrow-right"></i>';
        btn.disabled = false;
        showToast('Network error during login.', 'error');
    }
}

async function handleAuthRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-reg');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;

    const nameInput = document.getElementById('reg-name').value;
    const usernameInput = document.getElementById('reg-username').value;
    const passwordInput = document.getElementById('reg-password').value;

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: nameInput, 
                username: usernameInput, 
                password: passwordInput 
            })
        });
        
        const data = await res.json();
        
        btn.innerHTML = 'Sign Up <i class="fa-solid fa-user-plus"></i>';
        btn.disabled = false;

        if(res.ok) {
            showToast('Registration successful! Please sign in.', 'success');
            document.getElementById('register-form').reset();
            switchView('login');
        } else {
            showToast(data.error || 'Registration failed', 'error');
        }
    } catch (err) {
        btn.innerHTML = 'Sign Up <i class="fa-solid fa-user-plus"></i>';
        btn.disabled = false;
        showToast('Network error during registration.', 'error');
    }
}

function handleLogout() {
    currentUser = null;
    currentJobOrder = null;
    localStorage.removeItem('currentUser');
    stopStopwatch();
    const adminNavLink = document.getElementById('admin-nav-link');
    if (adminNavLink) adminNavLink.classList.add('hidden');
    
    switchView('login');
}

// --- Dashboard Logic ---

async function loadDashboard() {
    const activeContainer = document.getElementById('active-job-orders-container');
    const completedContainer = document.getElementById('completed-job-orders-container');
    
    activeContainer.innerHTML = '<div class="line-loader w-full"></div>';
    completedContainer.innerHTML = '';

    try {
        const res = await fetch(`${API_BASE}/job-orders`);
        const jobs = await res.json();
        
        activeContainer.innerHTML = ''; // Clear loader
        
        if(jobs.length === 0) {
            activeContainer.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">No job orders available. Create one to get started.</p>';
            completedContainer.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">No completed job orders.</p>';
            return;
        }

        const activeJobs = jobs.filter(j => j.status === 'open');
        const completedJobs = jobs.filter(j => j.status === 'closed' || j.status === 'completed');

        // Sort completed jobs so the most recently completed are at the bottom
        completedJobs.sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at);
            const dateB = new Date(b.updated_at || b.created_at);
            return dateA - dateB;
        });

        if (activeJobs.length === 0) {
            activeContainer.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">No active job orders.</p>';
        } else {
            activeJobs.forEach(job => activeContainer.appendChild(createJobCard(job)));
        }

        if (completedJobs.length === 0) {
            completedContainer.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">No completed job orders.</p>';
        } else {
            completedJobs.forEach(job => completedContainer.appendChild(createJobCard(job)));
        }

        updateStopwatchState(activeJobs);

    } catch (err) {
        showToast('Failed to load job orders.', 'error');
        activeContainer.innerHTML = '<p>Error loading data.</p>';
    }
}

function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'job-card';
    
    const badgeClass = job.status === 'open' ? 'status-open' : 'status-completed';
    
    card.innerHTML = `
        <div class="job-card-header">
            <div>
                <span class="job-id">${job.id}</span>
                <h3 class="job-title">${job.title}</h3>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="badge ${badgeClass}">${job.status}</span>
                <button class="btn btn-outline btn-sm btn-delete-job" title="Delete Job" onclick="event.stopPropagation(); deleteJobOrder('${job.id}')" style="padding: 0.25rem 0.5rem; color: #f87171; border-color: rgba(248, 113, 113, 0.2);">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
        <div class="job-card-meta">
            <span><i class="fa-solid fa-building"></i> ${job.customer_name}</span>
            <span><i class="fa-solid fa-flag"></i> P${job.priority || 3}</span>
        </div>
        <div class="job-card-meta">
            <span><i class="fa-regular fa-user"></i> ${job.assigned_to_user ? job.assigned_to_user.name : 'Unassigned'}</span>
        </div>
    `;

    // Check for active work orders
    if (job.work_orders && job.work_orders.length > 0) {
        const activeWorkOrders = job.work_orders.filter(wo => wo.status !== 'completed');
        if (activeWorkOrders.length > 0) {
            const localPauseState = getPauseState();
            // Sort by time_in ascending (oldest first)
            activeWorkOrders.sort((a, b) => new Date(a.time_in) - new Date(b.time_in));
            activeWorkOrders.forEach(wo => {
                const timeIn = new Date(wo.time_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const userName = wo.user ? wo.user.name : 'Unknown';
                const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                // Read pause state from localStorage (backend status stays 'started' while paused)
                const isPaused = !!(localPauseState[wo.id] && localPauseState[wo.id].isPaused);
                const dotClass = isPaused ? 'pulse-dot-paused' : 'pulse-dot';
                const statusText = isPaused ? `Work paused` : `Work started at ${timeIn}`;
                
                card.innerHTML += `
                    <div class="work-status-indicator ${isPaused ? 'indicator-paused' : ''}" title="${wo.description || 'Work'} — ${userName}">
                        <span class="${dotClass}"></span>
                        <span style="flex:1;">${statusText}</span>
                        <span class="worker-avatar" title="${userName}">${initials}</span>
                    </div>
                `;
            });
        }

        // Aggregate total hours by each user for this job
        const userStatsMap = {};
        job.work_orders.forEach(wo => {
            const workedMs = calcWorkedTime(wo.id, wo.time_in, wo.time_out);
            const uId = wo.user_id;
            const uName = wo.user ? wo.user.name : 'Unknown';
            if (!userStatsMap[uId]) {
                userStatsMap[uId] = { name: uName, totalMs: 0 };
            }
            userStatsMap[uId].totalMs += workedMs;
        });

        const statsEntries = Object.values(userStatsMap);
        if (statsEntries.length > 0) {
            let statsHTML = '<div class="job-card-breakdown">';
            statsEntries.forEach(s => {
                const initials = s.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                statsHTML += `
                    <div class="mini-user-stat" title="${s.name}">
                        <div class="mini-avatar">${initials}</div>
                        <span class="mini-time">${formatDuration(s.totalMs)}</span>
                    </div>
                `;
            });
            statsHTML += '</div>';
            card.innerHTML += statsHTML;
        }
    }
    card.addEventListener('click', () => openJobDetail(job.id));
    return card;
}

function populateUserDropdown(selectId) {
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">-- Select Assignee --</option>';
    allUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.name} (${u.role})`;
        // Default assignment to self
        if(currentUser && u.id === currentUser.id) opt.selected = true;
        select.appendChild(opt);
    });
}

// --- Job Order CRUD ---

async function handleCreateJob(e) {
    e.preventDefault();
    
    const payload = {
        title: document.getElementById('nj-title').value,
        customer_name: document.getElementById('nj-customer').value,
        priority: parseInt(document.getElementById('nj-priority').value),
        assigned_to: document.getElementById('nj-assigned').value,
        assigned_by: currentUser.id,
        description: document.getElementById('nj-desc').value,
        status: 'open'
    };

    try {
        const res = await fetch(`${API_BASE}/job-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if(res.ok) {
            showToast('Job order created successfully!', 'success');
            closeModal(modals.newJob);
            document.getElementById('new-job-form').reset();
            loadDashboard(); // Refresh grid
        } else {
            throw new Error('Failed to create');
        }
    } catch {
        showToast('Failed to create job order.', 'error');
    }
}

// --- Detail View & Work Orders ---

async function openJobDetail(jobId) {
    try {
        const res = await fetch(`${API_BASE}/job-orders/${jobId}`);
        currentJobOrder = await res.json();
        
        // Populate Header
        document.getElementById('jd-title').textContent = currentJobOrder.title;
        document.getElementById('jd-id').textContent = currentJobOrder.id;
        
        const statusEl = document.getElementById('jd-status');
        statusEl.textContent = currentJobOrder.status;
        statusEl.className = `badge ${currentJobOrder.status === 'open' ? 'status-open' : 'status-closed'}`;

        // Populate Meta
        document.getElementById('jd-customer').textContent = currentJobOrder.customer_name;
        document.getElementById('jd-priority').textContent = currentJobOrder.priority || 'N/A';
        document.getElementById('jd-assigned').textContent = currentJobOrder.assigned_to_user ? currentJobOrder.assigned_to_user.name : 'Unassigned';
        document.getElementById('jd-desc').textContent = currentJobOrder.description || 'No description provided.';
        
        // Render Work Orders
        renderWorkOrders(currentJobOrder.work_orders || []);

        // Reset forms
        document.getElementById('new-work-form').classList.add('hidden');
        document.getElementById('btn-new-work').classList.remove('hidden');

        // Toggle Mark Complete Button
        const btnClose = document.getElementById('btn-close-job');
        if(currentJobOrder.status === 'closed') {
            btnClose.style.display = 'none';
        } else {
            btnClose.style.display = 'block';
        }

        openModal(modals.jobDetail);
    } catch (err) {
        showToast('Error fetching job details.', 'error');
    }
}

async function openEditJobModal(jobId) {
    try {
        const res = await fetch(`${API_BASE}/job-orders/${jobId}`);
        const job = await res.json();
        
        document.getElementById('ej-id').value = job.id;
        document.getElementById('ej-title').value = job.title;
        document.getElementById('ej-customer').value = job.customer_name;
        document.getElementById('ej-priority').value = job.priority || 3;
        document.getElementById('ej-desc').value = job.description || '';
        
        populateUserDropdown('ej-assigned');
        if (job.assigned_to) {
            document.getElementById('ej-assigned').value = job.assigned_to;
        }

        openModal(modals.editJob);
    } catch (err) {
        showToast('Error loading job details for editing.', 'error');
    }
}

async function handleUpdateJob(e) {
    e.preventDefault();
    const jobId = document.getElementById('ej-id').value;
    
    const payload = {
        title: document.getElementById('ej-title').value,
        customer_name: document.getElementById('ej-customer').value,
        priority: parseInt(document.getElementById('ej-priority').value),
        assigned_to: document.getElementById('ej-assigned').value,
        description: document.getElementById('ej-desc').value,
        status: currentJobOrder.status // Keep current status
    };

    try {
        const res = await fetch(`${API_BASE}/job-orders/${jobId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if(res.ok) {
            showToast('Job order updated successfully!', 'success');
            closeModal(modals.editJob);
            openJobDetail(jobId); // Refresh detail view
            loadDashboard(); // Refresh dashboard
        } else {
            throw new Error('Failed to update');
        }
    } catch {
        showToast('Failed to update job order.', 'error');
    }
}

// --- Helper: format milliseconds to Xh Ym Zs ---
function formatDuration(ms) {
    if (!ms || ms < 0) ms = 0;
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// --- Helper: calculate total worked time from history ---
function calcWorkedTime(woId, timeIn, timeOut) {
    const localPauseState = getPauseState();
    const woState = localPauseState[woId] || {};
    const history = woState.history || [];
    
    // Fallback for simple calculation if no history exists (legacy or direct API data)
    if (history.length === 0) {
        if (timeOut) return Math.max(0, new Date(timeOut).getTime() - new Date(timeIn).getTime());
        if (woState.accumulatedTime) {
            let total = woState.accumulatedTime;
            if (!woState.isPaused && woState.lastResumedAt) {
                total += getServerNow() - woState.lastResumedAt;
            }
            return Math.max(0, total);
        }
        return Math.max(0, getServerNow() - new Date(timeIn).getTime());
    }
    
    let totalWorked = 0;
    let lastEventTime = new Date(timeIn).getTime();
    let isCurrentlyRunning = true; // Work always starts in "running" state
    
    for (const entry of history) {
        const entryTime = entry.at;
        
        // Only accumulate time if we were in a running state before this event
        if (isCurrentlyRunning) {
            totalWorked += (entryTime - lastEventTime);
        }
        
        // Update state based on event type
        if (entry.type === 'pause') {
            isCurrentlyRunning = false;
        } else if (entry.type === 'resume') {
            isCurrentlyRunning = true;
        } else if (entry.type === 'end') {
            // Already accumulated time until this end event, so return the total
            return totalWorked;
        }
        
        lastEventTime = entryTime;
    }
    
    // If it hasn't ended and is still running, add time from last event until now
    if (isCurrentlyRunning && !timeOut) {
        totalWorked += (getServerNow() - lastEventTime);
    }
    
    return totalWorked;
}

// --- Helper: build timeline HTML from history ---
function buildTimelineHTML(woId, timeIn, timeOut) {
    const localPauseState = getPauseState();
    const woState = localPauseState[woId] || {};
    const history = woState.history || [];
    
    if (history.length === 0 && !timeOut) return '';
    
    const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    
    let html = '<div class="time-pipeline">';
    
    // Start event
    html += `<div class="pipeline-event pipeline-start">
        <span class="pipeline-dot dot-start"></span>
        <span class="pipeline-label">Started</span>
        <span class="pipeline-time">${fmtTime(new Date(timeIn).getTime())}</span>
    </div>`;
    
    for (const entry of history) {
        if (entry.type === 'pause') {
            html += `<div class="pipeline-event pipeline-pause">
                <span class="pipeline-dot dot-pause"></span>
                <span class="pipeline-label">Paused</span>
                <span class="pipeline-time">${fmtTime(entry.at)}</span>
            </div>`;
        } else if (entry.type === 'resume') {
            html += `<div class="pipeline-event pipeline-resume">
                <span class="pipeline-dot dot-resume"></span>
                <span class="pipeline-label">Resumed</span>
                <span class="pipeline-time">${fmtTime(entry.at)}</span>
            </div>`;
        } else if (entry.type === 'end') {
            html += `<div class="pipeline-event pipeline-end">
                <span class="pipeline-dot dot-end"></span>
                <span class="pipeline-label">Finished</span>
                <span class="pipeline-time">${fmtTime(entry.at)}</span>
            </div>`;
        }
    }
    
    html += '</div>';
    return html;
}

function renderWorkOrders(workOrders) {
    const list = document.getElementById('work-orders-list');
    list.innerHTML = '';
    
    if(workOrders.length === 0) {
        list.innerHTML = '<p class="text-muted" style="margin-top:0.5rem;">No work orders currently active. Add one to begin tracking time.</p>';
        return;
    }

    // Sort by created_at desc (newest first)
    workOrders.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

    const localPauseState = getPauseState();

    workOrders.forEach(wo => {
        const isCompleted = wo.status === 'completed';
        const localWoState = localPauseState[wo.id] || {};
        const isPaused = !isCompleted && !!localWoState.isPaused;
        const isActive = !isCompleted && !isPaused;

        const item = document.createElement('div');
        item.className = `work-item ${isActive ? 'active-work' : ''}`;

        let badgeClass = 'status-started';
        let badgeLabel = 'IN PROGRESS'; // Updated from STARTED for better flow
        if (isCompleted) { badgeClass = 'status-completed'; badgeLabel = 'COMPLETED'; }
        else if (isPaused) { badgeClass = 'status-paused'; badgeLabel = 'PAUSED'; }

        const timeIn = new Date(wo.time_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const timeOut = wo.time_out
            ? new Date(wo.time_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            : (isPaused ? 'Paused' : 'Ongoing');

        // Calculate actual worked time
        const workedMs = calcWorkedTime(wo.id, wo.time_in, wo.time_out);
        const workedStr = formatDuration(workedMs);

        const woUserId = wo.user_id || (wo.user ? wo.user.id : null);
        const canAct = currentUser && (woUserId === currentUser.id);

        // Build timeline
        const timelineHTML = buildTimelineHTML(wo.id, wo.time_in, wo.time_out);

        item.innerHTML = `
            <div class="work-item-top">
                <div class="work-info">
                    <span class="work-desc">${wo.description}</span>
                    <span class="work-meta">${wo.id} | ${timeIn} &rarr; ${timeOut}</span>
                    <span class="work-hours"><i class="fa-regular fa-clock"></i> Worked: <strong>${workedStr}</strong></span>
                    <span class="work-user"><i class="fa-solid fa-user"></i> ${wo.user ? wo.user.name : (currentUser ? currentUser.name : 'Unknown User')}</span>
                </div>
                <div class="work-item-actions">
                    <span class="badge ${badgeClass}">${badgeLabel}</span>
                    <button class="btn btn-icon btn-sm" onclick="openEditWorkModal('${wo.id}', '${wo.description.replace(/'/g, "\\'")}')" title="Edit Description">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    ${!isCompleted ? `<button class="btn btn-outline btn-sm" onclick="toggleWorkOrderPause('${wo.id}', '${wo.status}')" ${!canAct ? 'disabled title="Only the user who started this work can pause/resume"' : ''}>${isPaused ? '<i class="fa-solid fa-play"></i> Resume' : '<i class="fa-solid fa-pause"></i> Pause'}</button>` : ''}
                    ${!isCompleted ? `<button class="btn btn-outline btn-sm" onclick="completeWorkOrder('${wo.id}')" ${!canAct ? 'disabled title="Only the user who started this work can finish it"' : ''}>Finish</button>` : ''}
                </div>
            </div>
            ${timelineHTML}
        `;
        list.appendChild(item);
    });
}

async function handleCreateWorkOrder(e) {
    e.preventDefault();
    if(!currentJobOrder) return;
    
    const desc = document.getElementById('nw-desc').value;
    
    try {
        const res = await fetch(`${API_BASE}/work-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: desc,
                user_id: currentUser.id,
                ref_id_jo: currentJobOrder.id
            })
        });
        
        if(res.ok) {
            showToast('Work order started.', 'success');
            openJobDetail(currentJobOrder.id); // Refresh modal data
            loadDashboard(); // Refresh dashboard card to show latest work time
        } else {
            throw new Error('Failed');
        }
    } catch {
        showToast('Failed to start work.', 'error');
    }
}

window.openEditWorkModal = function(woId, description) {
    document.getElementById('ew-id').value = woId;
    document.getElementById('ew-desc').value = description;
    openModal(modals.editWork);
};

async function handleUpdateWorkOrder(e) {
    e.preventDefault();
    const woId = document.getElementById('ew-id').value;
    const desc = document.getElementById('ew-desc').value;

    try {
        const res = await fetch(`${API_BASE}/work-orders/${woId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: desc })
        });
        
        if(res.ok) {
            showToast('Work order updated.', 'success');
            closeModal(modals.editWork);
            if (currentJobOrder) openJobDetail(currentJobOrder.id);
            loadDashboard();
        } else {
            throw new Error('Failed to update');
        }
    } catch {
        showToast('Failed to update work order.', 'error');
    }
}

// Globally exposed for inline onclick
window.completeWorkOrder = async function(workOrderId) {
    try {
        const res = await fetch(`${API_BASE}/work-orders/${workOrderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' })
        });
        
        if(res.ok) {
            // Record end event in history (don't delete state)
            const pauseState = getPauseState();
            const woState = pauseState[workOrderId] || { accumulatedTime: 0, isPaused: false, lastResumedAt: null, history: [] };
            if (!woState.history) woState.history = [];
            const now = getServerNow();
            // If it was running, accumulate final segment
            if (!woState.isPaused && woState.lastResumedAt) {
                woState.accumulatedTime += (now - woState.lastResumedAt);
            }
            woState.isPaused = false;
            woState.lastResumedAt = null;
            woState.history.push({ type: 'end', at: now });
            pauseState[workOrderId] = woState;
            savePauseState(pauseState);
            
            showToast('Work order completed.', 'success');
            openJobDetail(currentJobOrder.id);
            loadDashboard();
        } else {
            throw new Error('Failed');
        }
    } catch {
        showToast('Failed to complete work.', 'error');
    }
}

window.toggleWorkOrderPause = function(workOrderId, currentStatus) {
    const pauseState = getPauseState();
    const woState = pauseState[workOrderId] || { accumulatedTime: 0, isPaused: false, lastResumedAt: null, history: [] };
    if (!woState.history) woState.history = [];
    const now = getServerNow();
    const isPaused = woState.isPaused || currentStatus === 'paused';

    if (isPaused) {
        // Resuming
        woState.isPaused = false;
        woState.lastResumedAt = now;
        woState.history.push({ type: 'resume', at: now });
        showToast('Work order resumed.', 'success');
    } else {
        // Pausing
        woState.isPaused = true;
        if (woState.lastResumedAt) {
            woState.accumulatedTime += (now - woState.lastResumedAt);
        }
        woState.lastResumedAt = null;
        woState.history.push({ type: 'pause', at: now });
        showToast('Work order paused.', 'success');
    }

    pauseState[workOrderId] = woState;
    savePauseState(pauseState);

    if (currentJobOrder) openJobDetail(currentJobOrder.id);
    if (typeof loadDashboard === 'function') loadDashboard();
}

async function handleCloseJobOrder() {
    if(!currentJobOrder) return;
    
    try {
        const res = await fetch(`${API_BASE}/job-orders/${currentJobOrder.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'closed' })
        });
        
        if(res.ok) {
            showToast('Job marked as Closed.', 'success');
            closeModal(modals.jobDetail);
            loadDashboard(); // Refresh background list
        } else {
            throw new Error('Failed');
        }
    } catch {
        showToast('Error updating job order.', 'error');
    }
}

// Globally exposed for inline onclick on dashboard cards
window.deleteJobOrder = async function(jobId) {
    if(!confirm(`Are you sure you want to permanently delete Job Order ${jobId}? This will also delete any associated Work Orders.`)) {
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/job-orders/${jobId}`, {
            method: 'DELETE'
        });
        
        if(res.ok) {
            showToast(`Job Order ${jobId} deleted successfully.`, 'success');
            loadDashboard(); // Refresh background list out the deleted card
        } else {
            throw new Error('Failed to delete');
        }
    } catch {
        showToast('Error deleting job order. Ensure the server is online.', 'error');
    }
}

// --- Stopwatch Logic ---

let stopwatchInterval = null;
let currentActiveWorkOrderId = null;
let currentActiveJobId = null;
let stopwatchStartTime = null;

// Local pause state: { [woId]: { accumulatedTime: ms, isPaused: boolean, lastPausedAt: timestamp } }
function getPauseState() {
    try {
        return JSON.parse(localStorage.getItem('stopwatchPauseState')) || {};
    } catch {
        return {};
    }
}

function savePauseState(state) {
    localStorage.setItem('stopwatchPauseState', JSON.stringify(state));
}

function updateStopwatchState(activeJobs) {
    if (!currentUser) return stopStopwatch();

    let activeUserWorkOrder = null;
    let associatedJobId = null;

    for (const job of activeJobs) {
        if (job.work_orders) {
            const wo = job.work_orders.find(w => w.status !== 'completed' && ((w.user_id && w.user_id === currentUser.id) || (w.user && w.user.id === currentUser.id)));
            if (wo) {
                if (!activeUserWorkOrder || new Date(wo.time_in) > new Date(activeUserWorkOrder.time_in)) {
                    activeUserWorkOrder = wo;
                    associatedJobId = job.id;
                }
            }
        }
    }

    if (activeUserWorkOrder) {
        currentActiveWorkOrderId = activeUserWorkOrder.id;
        currentActiveJobId = associatedJobId;
        startStopwatch(associatedJobId, activeUserWorkOrder.id, activeUserWorkOrder.description, activeUserWorkOrder.time_in);
    } else {
        currentActiveWorkOrderId = null;
        currentActiveJobId = null;
        stopStopwatch();
    }
}

function startStopwatch(jobId, woId, woDesc, timeInDateString) {
    if (stopwatchInterval) clearInterval(stopwatchInterval);
    
    const container = document.getElementById('active-work-stopwatch');
    const jobSpan = document.getElementById('stopwatch-job');
    const woSpan = document.getElementById('stopwatch-wo');
    const descSpan = document.getElementById('stopwatch-desc');
    const timeSpan = document.getElementById('stopwatch-time');
    const btnPause = document.getElementById('btn-pause-stopwatch');
    
    container.classList.remove('hidden');
    jobSpan.textContent = jobId;
    if (woSpan) woSpan.textContent = `WO-${woId}`;
    if (descSpan) descSpan.textContent = woDesc;
    
    const serverStartTime = new Date(timeInDateString).getTime();
    const pauseState = getPauseState();
    const woState = pauseState[woId] || { accumulatedTime: 0, isPaused: false, lastPausedAt: null };
    
    if (btnPause) {
        btnPause.innerHTML = woState.isPaused ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-pause"></i>';
    }

    function renderTime(diff) {
        const safeDiff = Math.max(0, diff);
        const hours = Math.floor(safeDiff / 3600000);
        const mins = Math.floor((safeDiff % 3600000) / 60000);
        const secs = Math.floor((safeDiff % 60000) / 1000);
        timeSpan.textContent = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function update() {
        if (woState.isPaused) {
            // Display static accumulated time if paused
            renderTime(woState.accumulatedTime);
            return;
        }
        
        const now = getServerNow();
        // Calculate total elapsed excluding any time spent paused (this assumes serverStartTime is the total start, but since we didn't store all intervals, we simplify by just using the accumulatedTime + diff from last unpause. If there was no pause, it's just now - serverStartTime)
        // A better approach for purely client-side pause:
        // accumulatedTime = total time we were running.
        // lastResumedAt = time we last pressed play.
        let elapsed = woState.accumulatedTime;
        if (woState.lastResumedAt) {
            elapsed += (now - woState.lastResumedAt);
        } else {
            // First time running without interruptions
            elapsed = Math.max(0, now - serverStartTime);
        }
        renderTime(elapsed);
    }
    
    // Initialize lastResumedAt if we're not paused and haven't recorded a resume time
    if (!woState.isPaused && !woState.lastResumedAt) {
        woState.lastResumedAt = serverStartTime;
        pauseState[woId] = woState;
        savePauseState(pauseState);
    }

    update();
    stopwatchInterval = setInterval(update, 1000);
}

function togglePauseStopwatch() {
    if (!currentActiveWorkOrderId) return;

    const pauseState = getPauseState();
    const woState = pauseState[currentActiveWorkOrderId] || { accumulatedTime: 0, isPaused: false, lastResumedAt: null, history: [] };
    if (!woState.history) woState.history = [];
    const now = getServerNow();
    const btnPause = document.getElementById('btn-pause-stopwatch');

    if (woState.isPaused) {
        // Resume
        woState.isPaused = false;
        woState.lastResumedAt = now;
        woState.history.push({ type: 'resume', at: now });
        if (btnPause) btnPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
        showToast('Stopwatch resumed.', 'success');
    } else {
        // Pause
        woState.isPaused = true;
        if (woState.lastResumedAt) {
            woState.accumulatedTime += (now - woState.lastResumedAt);
        }
        woState.lastResumedAt = null;
        woState.history.push({ type: 'pause', at: now });
        if (btnPause) btnPause.innerHTML = '<i class="fa-solid fa-play"></i>';
        showToast('Stopwatch paused.', 'success');
    }

    pauseState[currentActiveWorkOrderId] = woState;
    savePauseState(pauseState);

    // Refresh dashboard cards to reflect paused indicator
    if (typeof loadDashboard === 'function') loadDashboard();
}

function stopStopwatch() {
    if (stopwatchInterval) {
        clearInterval(stopwatchInterval);
        stopwatchInterval = null;
    }
    currentActiveJobId = null;
    currentActiveWorkOrderId = null;
    const container = document.getElementById('active-work-stopwatch');
    if (container) container.classList.add('hidden');
}

// --- Utilities ---

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    
    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'toast-out 0.3s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Admin Dashboard Functions ---

async function loadAdminDashboard(filter = 'all') {
    const listContainer = document.getElementById('admin-work-orders-list');
    const statCount = document.getElementById('admin-stat-count');
    
    listContainer.innerHTML = '<div class="line-loader w-full"></div>';
    
    try {
        const res = await fetch(`${API_BASE}/work-orders`);
        let workOrders = await res.json();
        
        // Apply Date Filter if set
        const dateFilter = document.getElementById('admin-date-filter').value;
        if (dateFilter) {
            const filterDate = new Date(dateFilter).toDateString();
            workOrders = workOrders.filter(wo => new Date(wo.time_in).toDateString() === filterDate);
        }

        // Filter based on tab
        if (filter === 'jobs') {
            document.getElementById('admin-work-orders-list').classList.add('hidden');
            document.getElementById('admin-job-summaries-list').classList.remove('hidden');
            renderAdminJobSummaries(workOrders);
            return;
        } else {
            document.getElementById('admin-work-orders-list').classList.remove('hidden');
            document.getElementById('admin-job-summaries-list').classList.add('hidden');
        }

        if (filter === 'ongoing') {
            workOrders = workOrders.filter(wo => wo.status !== 'completed');
        } else if (filter === 'completed') {
            workOrders = workOrders.filter(wo => wo.status === 'completed');
        }
        
        statCount.textContent = `${workOrders.length} ${workOrders.length === 1 ? 'Order' : 'Orders'}`;
        renderAdminWorkOrders(workOrders);
        
    } catch (err) {
        showToast('Failed to load admin dashboard data.', 'error');
        listContainer.innerHTML = '<p class="text-center p-4">Error loading data.</p>';
    }
}

function renderAdminWorkOrders(workOrders) {
    const container = document.getElementById('admin-work-orders-list');
    container.innerHTML = '';
    
    if (workOrders.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-4">No work orders found for this criteria.</p>';
        return;
    }
    
    workOrders.forEach(wo => {
        const row = document.createElement('div');
        row.className = 'admin-list-row';
        
        const timeLapsed = calculateAdminTimeLapsed(wo);
        const userName = wo.user ? wo.user.name : 'Unknown';
        const userInitials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        const badgeClass = wo.status === 'completed' ? 'status-completed' : 'status-started';
        const badgeLabel = wo.status === 'completed' ? 'COMPLETED' : 'IN PROGRESS';
        
        row.innerHTML = `
            <div class="col-id">${wo.id}</div>
            <div class="col-info">
                <span class="admin-desc">${wo.description || 'No description'}</span>
                <span class="admin-meta">Started ${new Date(wo.time_in).toLocaleString()}</span>
            </div>
            <div class="col-user">
                <div class="admin-user-info">
                    <div class="admin-avatar">${userInitials}</div>
                    <span class="admin-username">${userName}</span>
                </div>
            </div>
            <div class="col-job">
                <div class="admin-job-link">
                    <span class="admin-job-id">${wo.ref_id_jo}</span>
                    <span class="admin-job-title" title="${wo.job_order ? wo.job_order.title : 'N/A'}">${wo.job_order ? wo.job_order.title : 'N/A'}</span>
                </div>
            </div>
            <div class="col-time">
                <span class="admin-time-val">${timeLapsed}</span>
            </div>
            <div class="col-status">
                <span class="badge ${badgeClass}">${badgeLabel}</span>
            </div>
        `;
        
        container.appendChild(row);
    });
}


function calculateAdminTimeLapsed(wo) {
    // If it has a pause history, use the calcWorkedTime logic
    // For the admin view, we'll try to use calcWorkedTime if available in pauseState,
    // otherwise fallback to simple duration since we don't sync all pause histories to the server (client-only feature)
    
    // Attempt to use local pause state if available (for the current admin's own work)
    const workedMs = calcWorkedTime(wo.id, wo.time_in, wo.time_out);
    return formatDuration(workedMs);
}

// --- Job Order Analytics ---

function renderAdminJobSummaries(workOrders) {
    const container = document.getElementById('admin-job-summaries-list');
    const statCount = document.getElementById('admin-stat-count');
    container.innerHTML = '';
    
    if (workOrders.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-4">No data available for job summaries.</p>';
        statCount.textContent = '0 Jobs';
        return;
    }

    // Group by Job Order id
    const jobsMap = {};
    
    workOrders.forEach(wo => {
        const jobId = wo.ref_id_jo;
        if (!jobsMap[jobId]) {
            jobsMap[jobId] = {
                id: jobId,
                title: wo.job_order ? wo.job_order.title : 'Unknown Job',
                customer: wo.job_order ? wo.job_order.customer_name : 'N/A',
                totalWorkedMs: 0,
                woCount: 0,
                userBreakdown: {} // userId -> { name, timeMs }
            };
        }
        
        const job = jobsMap[jobId];
        const workedMs = calcWorkedTime(wo.id, wo.time_in, wo.time_out);
        
        job.totalWorkedMs += workedMs;
        job.woCount += 1;
        
        const userId = wo.user_id;
        const userName = wo.user ? wo.user.name : 'Unknown User';
        if (!job.userBreakdown[userId]) {
            job.userBreakdown[userId] = { name: userName, timeMs: 0 };
        }
        job.userBreakdown[userId].timeMs += workedMs;
    });

    const jobs = Object.values(jobsMap);
    statCount.textContent = `${jobs.length} ${jobs.length === 1 ? 'Job' : 'Jobs'}`;

    jobs.forEach(job => {
        const card = document.createElement('div');
        card.className = 'job-summary-card';
        
        // Format breakdown
        let breakdownHTML = '';
        Object.values(job.userBreakdown).forEach(u => {
            const initials = u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            breakdownHTML += `
                <div class="user-breakdown-item">
                    <div class="user-meta">
                        <div class="user-breakdown-avatar">${initials}</div>
                        <span>${u.name}</span>
                    </div>
                    <span class="user-breakdown-time">${formatDuration(u.timeMs)}</span>
                </div>
            `;
        });

        card.innerHTML = `
            <div class="job-info-main">
                <span class="job-id-link">${job.id}</span>
                <h3 class="mt-2">${job.title}</h3>
                <p class="text-muted small">${job.customer}</p>
            </div>
            <div class="job-stats-summary">
                <div class="mb-3">
                    <div class="stat-label">Total Time Spent</div>
                    <div class="stat-value hours">${formatDuration(job.totalWorkedMs)}</div>
                </div>
                <div>
                    <div class="stat-label">Work Orders</div>
                    <div class="stat-value">${job.woCount}</div>
                </div>
            </div>
            <div class="job-user-breakdown">
                <div class="stat-label mb-2">User Contributions</div>
                ${breakdownHTML}
            </div>
        `;
        
        container.appendChild(card);
    });
}
