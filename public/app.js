/**
 * Nexus Job Management - Frontend Logic
 */

// State
let currentUser = null;
let currentJobOrder = null;
let allUsers = [];
let joViewMode = localStorage.getItem('joViewMode') || 'grid';
let joSearchQuery = '';

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
    admin: document.getElementById('admin-view'),
    myWork: document.getElementById('my-work-view')
};

const modals = {
    newJob: document.getElementById('new-job-modal'),
    jobDetail: document.getElementById('job-detail-modal'),
    editJob: document.getElementById('edit-job-modal'),
    editWork: document.getElementById('edit-work-modal'),
    editTimeEntry: document.getElementById('edit-time-entry-modal')
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
            const avatarSm = document.getElementById('current-user-avatar');
            avatarSm.textContent = currentUser.name.charAt(0);
            if(currentUser.color_code) {
                avatarSm.style.background = currentUser.color_code;
                const picker = document.getElementById('user-color-picker');
                if (picker) picker.value = currentUser.color_code;
            }
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

    // Password Visibility Toggle
    const toggleAuthPass = document.getElementById('toggle-auth-password');
    if (toggleAuthPass) {
        toggleAuthPass.addEventListener('click', () => togglePasswordVisibility('auth-password', 'toggle-auth-password'));
    }

    const toggleRegPass = document.getElementById('toggle-reg-password');
    if (toggleRegPass) {
        toggleRegPass.addEventListener('click', () => togglePasswordVisibility('reg-password', 'toggle-reg-password'));
    }

    // JO Dashboard Controls
    const joSearchInput = document.getElementById('jo-search-input');
    let joSearchTimer;
    if (joSearchInput) {
        joSearchInput.addEventListener('input', () => {
            clearTimeout(joSearchTimer);
            joSearchTimer = setTimeout(() => {
                loadDashboard();
            }, 300);
        });
    }

    const btnViewGrid = document.getElementById('btn-view-grid');
    const btnViewList = document.getElementById('btn-view-list');
    
    if (btnViewGrid && btnViewList) {
        // Init icon state from global joViewMode
        if (joViewMode === 'list') {
            btnViewGrid.classList.remove('active');
            btnViewList.classList.add('active');
        }

        btnViewGrid.addEventListener('click', () => {
            if (joViewMode === 'grid') return;
            joViewMode = 'grid';
            localStorage.setItem('joViewMode', 'grid');
            btnViewList.classList.remove('active');
            btnViewGrid.classList.add('active');
            loadDashboard();
        });

        btnViewList.addEventListener('click', () => {
            if (joViewMode === 'list') return;
            joViewMode = 'list';
            localStorage.setItem('joViewMode', 'list');
            btnViewGrid.classList.remove('active');
            btnViewList.classList.add('active');
            loadDashboard();
        });
    }

    // Color Picker Listener
    const colorPicker = document.getElementById('user-color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('change', async (e) => {
            const newColor = e.target.value;
            if(!currentUser) return;

            document.getElementById('current-user-avatar').style.background = newColor;

            try {
                const res = await fetch(`${API_BASE}/users/${currentUser.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ color_code: newColor })
                });

                if(res.ok) {
                    const updatedUser = await res.json();
                    currentUser.color_code = updatedUser.color_code;
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    showToast('Color updated globally.', 'success');
                    // Refresh current view to apply to active cards
                    if(!document.getElementById('dashboard-view').classList.contains('hidden-view')) loadDashboard();
                    else if(!document.getElementById('admin-view').classList.contains('hidden-view')) loadAdminDashboard(document.querySelector('.admin-tabs .tab-btn.active')?.dataset.tab || 'all');
                    else if(!document.getElementById('my-work-view').classList.contains('hidden-view')) loadMyWorkDashboard(document.querySelector('#mywork-tabs .tab-btn.active')?.dataset.tab || 'all');
                } else {
                    showToast('Failed to update color.', 'error');
                }
            } catch(error) {
                showToast('Network error updating color.', 'error');
            }
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
    const btnNewWork = document.getElementById('btn-new-work');
    if (btnNewWork) {
        btnNewWork.addEventListener('click', () => {
            document.getElementById('new-work-form').classList.remove('hidden');
            btnNewWork.classList.add('hidden');
            populateTaggingList();
        });
    } 
    
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
    document.getElementById('edit-time-entry-form').addEventListener('submit', handleUpdateTimeEntry);
    document.getElementById('btn-close-job').addEventListener('click', handleCloseJobOrder);

    // Admin Navigation
    const btnGotoAdmin = document.getElementById('btn-goto-admin');
    if (btnGotoAdmin) {
        btnGotoAdmin.addEventListener('click', () => {
            switchView('admin');
            populateAdminUserFilter();
            populateAdminJobFilter();
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

    const adminUserFilter = document.getElementById('admin-user-filter');
    if (adminUserFilter) {
        adminUserFilter.addEventListener('change', () => {
            const activeTab = document.querySelector('.admin-tabs .tab-btn.active')?.dataset.tab || 'all';
            loadAdminDashboard(activeTab);
        });
    }

    const adminJobFilter = document.getElementById('admin-jo-filter');
    if (adminJobFilter) {
        adminJobFilter.addEventListener('change', () => {
            const activeTab = document.querySelector('.admin-tabs .tab-btn.active')?.dataset.tab || 'all';
            loadAdminDashboard(activeTab);
        });
    }

    const adminStatusFilter = document.getElementById('admin-status-filter');
    if (adminStatusFilter) {
        adminStatusFilter.addEventListener('change', () => {
            const activeTab = document.querySelector('.admin-tabs .tab-btn.active')?.dataset.tab || 'all';
            loadAdminDashboard(activeTab);
        });
    }

    const adminWOSearch = document.getElementById('admin-wo-search');
    let searchDebounceTimer;
    if (adminWOSearch) {
        adminWOSearch.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                const activeTab = document.querySelector('.admin-tabs .tab-btn.active')?.dataset.tab || 'all';
                loadAdminDashboard(activeTab);
            }, 300); // 300ms debounce
        });
    }

    const btnClearAdminFilters = document.getElementById('btn-clear-admin-filters');
    if (btnClearAdminFilters) {
        btnClearAdminFilters.addEventListener('click', () => {
            document.getElementById('admin-wo-search').value = '';
            document.getElementById('admin-jo-filter').value = 'all';
            document.getElementById('admin-user-filter').value = 'all';
            document.getElementById('admin-date-filter').value = '';
            if (document.getElementById('admin-status-filter')) {
                document.getElementById('admin-status-filter').value = 'all';
            }
            
            const activeTab = document.querySelector('.admin-tabs .tab-btn.active')?.dataset.tab || 'all';
            loadAdminDashboard(activeTab);
            showToast('Filters cleared', 'success');
        });
    }

    // My Work Navigation
    const btnGotoMyWork = document.getElementById('btn-goto-my-work');
    if (btnGotoMyWork) {
        btnGotoMyWork.addEventListener('click', () => {
            switchView('myWork');
            populateMyWorkJobFilter();
            loadMyWorkDashboard();
        });
    }

    const btnDailyReport = document.getElementById('btn-daily-report');
    if (btnDailyReport) {
        btnDailyReport.addEventListener('click', handlePrintDailyReport);
    }

    const btnBackToJobsFromMyWork = document.getElementById('btn-back-to-jobs-from-mywork');
    if (btnBackToJobsFromMyWork) {
        btnBackToJobsFromMyWork.addEventListener('click', () => {
            switchView('dashboard');
            loadDashboard();
        });
    }

    // My Work Tab Switching
    const myWorkTabs = document.getElementById('mywork-tabs');
    if (myWorkTabs) {
        myWorkTabs.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                document.querySelectorAll('#mywork-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                const filter = e.target.dataset.tab;
                loadMyWorkDashboard(filter);
            }
        });
    }

    // My Work Advanced Filters
    const myWorkWOSearch = document.getElementById('mywork-wo-search');
    let myWorkSearchTimer;
    if (myWorkWOSearch) {
        myWorkWOSearch.addEventListener('input', () => {
            clearTimeout(myWorkSearchTimer);
            myWorkSearchTimer = setTimeout(() => {
                const activeTab = document.querySelector('#mywork-tabs .tab-btn.active')?.dataset.tab || 'all';
                loadMyWorkDashboard(activeTab);
            }, 300);
        });
    }

    const myWorkJOFilter = document.getElementById('mywork-jo-filter');
    if (myWorkJOFilter) {
        myWorkJOFilter.addEventListener('change', () => {
            const activeTab = document.querySelector('#mywork-tabs .tab-btn.active')?.dataset.tab || 'all';
            loadMyWorkDashboard(activeTab);
        });
    }

    const myWorkDateFilter = document.getElementById('mywork-date-filter');
    if (myWorkDateFilter) {
        myWorkDateFilter.addEventListener('change', () => {
            const activeTab = document.querySelector('#mywork-tabs .tab-btn.active')?.dataset.tab || 'all';
            loadMyWorkDashboard(activeTab);
        });
    }

    const btnClearMyWorkFilters = document.getElementById('btn-clear-mywork-filters');
    if (btnClearMyWorkFilters) {
        btnClearMyWorkFilters.addEventListener('click', () => {
            document.getElementById('mywork-wo-search').value = '';
            document.getElementById('mywork-jo-filter').value = 'all';
            document.getElementById('mywork-date-filter').value = '';
            const activeTab = document.querySelector('#mywork-tabs .tab-btn.active')?.dataset.tab || 'all';
            loadMyWorkDashboard(activeTab);
            showToast('Filters cleared', 'success');
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

function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input && icon) {
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
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
            const avatarSm = document.getElementById('current-user-avatar');
            avatarSm.textContent = currentUser.name.charAt(0);
            if(currentUser.color_code) {
                avatarSm.style.background = currentUser.color_code;
                const picker = document.getElementById('user-color-picker');
                if (picker) picker.value = currentUser.color_code;
            }
            
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

        const joSearchVal = document.getElementById('jo-search-input').value.toLowerCase();
        
        let activeJobs = jobs.filter(j => j.status === 'open');
        let completedJobs = jobs.filter(j => j.status === 'closed' || j.status === 'completed');

        // Apply Search Filter locally
        if (joSearchVal) {
            const filterFn = j => 
                j.id.toLowerCase().includes(joSearchVal) || 
                j.title.toLowerCase().includes(joSearchVal) || 
                (j.customer_name || '').toLowerCase().includes(joSearchVal);
            
            activeJobs = activeJobs.filter(filterFn);
            completedJobs = completedJobs.filter(filterFn);
        }

        // Apply View Mode Containers
        activeContainer.className = joViewMode === 'grid' ? 'grid-container' : 'list-container';
        completedContainer.className = joViewMode === 'grid' ? 'grid-container' : 'list-container';

        // Sort completed jobs so the most recently completed are at the bottom
        completedJobs.sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at);
            const dateB = new Date(b.updated_at || b.created_at);
            return dateA - dateB;
        });

        if (activeJobs.length === 0) {
            activeContainer.innerHTML = `<p class="text-muted" style="grid-column: 1/-1;">${joSearchVal ? 'No matches found.' : 'No active job orders.'}</p>`;
        } else {
            activeJobs.forEach(job => {
                const el = joViewMode === 'grid' ? createJobCard(job) : createJobListItem(job);
                activeContainer.appendChild(el);
            });
        }

        if (completedJobs.length === 0) {
            completedContainer.innerHTML = `<p class="text-muted" style="grid-column: 1/-1;">${joSearchVal ? 'No matches found.' : 'No completed job orders.'}</p>`;
        } else {
            completedJobs.forEach(job => {
                const el = joViewMode === 'grid' ? createJobCard(job) : createJobListItem(job);
                completedContainer.appendChild(el);
            });
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
            <span>${getPriorityHTML(job.priority)}</span>
        </div>
        <div class="job-card-meta">
            <span><i class="fa-regular fa-user"></i> ${job.assigned_to_user ? job.assigned_to_user.name : 'Unassigned'}</span>
            <span><i class="fa-regular fa-calendar"></i> ${formatDateDDMMYYYY(job.created_at)}</span>
        </div>
        <div class="job-card-meta" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.05);">
            <span style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent-primary);">
                <i class="fa-solid fa-clock"></i> Total Worked: ${formatDuration(job.work_orders ? job.work_orders.reduce((sum, wo) => sum + calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status), 0) : 0)}
            </span>
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
                
                // Use helper to determine pause state consistently across browsers
                const isPaused = isWorkOrderPaused(wo);
                const dotClass = isPaused ? 'pulse-dot-paused' : 'pulse-dot';
                const statusText = isPaused ? `Work paused` : `Work started at ${timeIn}`;
                const userColor = wo.user && wo.user.color_code ? `style="background: ${wo.user.color_code};"` : '';
                
                card.innerHTML += `
                    <div class="work-status-indicator ${isPaused ? 'indicator-paused' : ''}" title="${wo.description || 'Work'} — ${userName}">
                        <span class="${dotClass}"></span>
                        <span style="flex:1;">${statusText}</span>
                        <span class="worker-avatar" title="${userName}" ${userColor}>${initials}</span>
                    </div>
                `;
            });
        }

        // Aggregate total hours by each user for this job
        const userStatsMap = {};
        job.work_orders.forEach(wo => {
            const workedMs = calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status);
            const uId = wo.user_id;
            const uName = wo.user ? wo.user.name : 'Unknown';
            const uColor = wo.user ? wo.user.color_code : null;
            if (!userStatsMap[uId]) {
                userStatsMap[uId] = { name: uName, color_code: uColor, totalMs: 0 };
            }
            userStatsMap[uId].totalMs += workedMs;
        });

        const statsEntries = Object.values(userStatsMap);
        if (statsEntries.length > 0) {
            let statsHTML = '<div class="job-card-breakdown">';
            statsEntries.forEach(s => {
                const initials = s.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                const userColor = s.color_code ? `style="background: ${s.color_code};"` : '';
                statsHTML += `
                    <div class="mini-user-stat" title="${s.name}">
                        <div class="mini-avatar" ${userColor}>${initials}</div>
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

function createJobListItem(job) {
    const row = document.createElement('div');
    row.className = 'job-list-row';
    
    const badgeClass = job.status === 'open' ? 'status-open' : 'status-completed';
    
    // Calculate total time
    let totalMs = 0;
    if (job.work_orders) {
        job.work_orders.forEach(wo => {
            totalMs += calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status);
        });
    }

    row.innerHTML = `
        <div class="list-id">${job.id}</div>
        <div class="list-title" title="${job.title}">${job.title}</div>
        <div class="list-meta">
            <i class="fa-solid fa-building"></i> <span>${job.customer_name}</span>
        </div>
        <div class="list-meta">
            <i class="fa-regular fa-user"></i> <span>${job.assigned_to_user ? job.assigned_to_user.name : 'Unassigned'}</span>
        </div>
        <div class="list-meta" style="font-family: 'JetBrains Mono', monospace; font-weight: 700;">
            <i class="fa-solid fa-clock"></i> <span>${formatDuration(totalMs)}</span>
        </div>
        <div class="list-meta">
            ${getPriorityHTML(job.priority)}
        </div>
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 0.75rem;">
            <span class="badge ${badgeClass}">${job.status}</span>
            <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); deleteJobOrder('${job.id}')" style="color: #f87171;">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `;
    
    row.addEventListener('click', () => openJobDetail(job.id));
    return row;
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

        // Meta Summary
        document.getElementById('jd-customer').textContent = currentJobOrder.customer_name;
        document.getElementById('jd-priority').innerHTML = getPriorityHTML(currentJobOrder.priority);
        document.getElementById('jd-assigned').textContent = currentJobOrder.assigned_to_user ? currentJobOrder.assigned_to_user.name : 'Unassigned';
        document.getElementById('jd-date').textContent = formatDateDDMMYYYY(currentJobOrder.created_at);
        document.getElementById('jd-desc').textContent = currentJobOrder.description || 'No description provided.';
        
        // Calculate Total Duration
        let totalJoMs = 0;
        if (currentJobOrder.work_orders) {
            currentJobOrder.work_orders.forEach(wo => {
                totalJoMs += calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status);
            });
        }
        document.getElementById('jd-total-time').textContent = formatDuration(totalJoMs);

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

function getPriorityHTML(level) {
    const p = parseInt(level) || 3;
    const icons = {
        1: '<i class="fa-solid fa-flag priority-flag prio-1"></i> Low',
        2: '<i class="fa-solid fa-flag priority-flag prio-2"></i> Normal',
        3: '<i class="fa-solid fa-flag priority-flag prio-3"></i> Medium',
        4: '<i class="fa-solid fa-flag priority-flag prio-4"></i> High',
        5: '<i class="fa-solid fa-flag priority-flag prio-5"></i> Critical'
    };
    return `<span class="badge badge-prio prio-${p}">${icons[p] || icons[3]}</span>`;
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

// --- Helper: format date to DD/MM/YYYY ---
function formatDateDDMMYYYY(date) {
    if (!date) return 'N/A';
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

// --- Helper: derive isPaused from work order data ---
function isWorkOrderPaused(wo) {
    if (!wo) return false;
    if (wo.status === 'completed') return false;
    
    // Check local state for potential optimistic updates ONLY if we are the user who owns this WO
    const localPauseState = getPauseState();
    const woState = localPauseState[wo.id];
    
    // Determine which history is more reliable
    const localHistory = (woState && woState.history) ? woState.history : [];
    const serverHistory = wo.pause_history || [];
    
    let history = serverHistory;
    
    // If we have local history that is more "advanced" (longer), trust it (optimistic UI)
    // Only if the current user is the owner of the work order
    const isOwner = currentUser && (wo.user_id === currentUser.id || (wo.user && wo.user.id === currentUser.id));
    
    if (isOwner && localHistory.length > serverHistory.length) {
        history = localHistory;
    } else if (isOwner && localHistory.length === serverHistory.length && localHistory.length > 0) {
        const lastServer = serverHistory[serverHistory.length - 1];
        const lastLocal = localHistory[localHistory.length - 1];
        if (lastLocal.at > lastServer.at) history = localHistory;
    }

    // Source of truth: history events
    if (history.length > 0) {
        const lastEvent = history[history.length - 1];
        return lastEvent.type === 'pause';
    }
    
    // Fallback: rely on the explicit status from the server
    return wo.status === 'paused';
}

// --- Helper: calculate total worked time from history ---
function calcWorkedTime(woId, timeIn, timeOut, serverHistory, woUserId, woStatus) {
    const localPauseState = getPauseState();
    const woState = localPauseState[woId] || {};
    const localHistory = woState.history || [];
    
    // Determine which history is more reliable
    let history = [];
    const isOwner = currentUser && (woUserId === currentUser.id);

    if (isOwner) {
        // For the owner, trust local history if it's more advanced (optimistic)
        if (!serverHistory || serverHistory.length === 0) {
            history = localHistory;
        } else if (localHistory.length === 0) {
            history = serverHistory;
        } else {
            const lastServer = serverHistory[serverHistory.length - 1];
            const lastLocal = localHistory[localHistory.length - 1];
            if (serverHistory.length > localHistory.length || (serverHistory.length === localHistory.length && lastServer.at > lastLocal.at)) {
                history = serverHistory;
            } else {
                history = localHistory;
            }
        }
    } else {
        // For non-owners (including Admins viewing others), trust ONLY the server history
        history = serverHistory || [];
    }
    
    // Fallback for simple calculation if no history exists (legacy or direct API data)
    if (history.length === 0) {
        if (timeOut) return Math.max(0, new Date(timeOut).getTime() - new Date(timeIn).getTime());
        // CRITICAL FIX: If status is paused on server, but we have no history, 
        // DO NOT assume it's running. Return 0 for current segment.
        if (woStatus === 'paused') return 0; 
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
function buildTimelineHTML(woId, timeIn, timeOut, serverHistory) {
    const localPauseState = getPauseState();
    const woState = localPauseState[woId] || {};
    const history = (serverHistory && serverHistory.length > 0) ? serverHistory : (woState.history || []);
    const isAdmin = currentUser && currentUser.role === 'Admin';
    
    if (history.length === 0 && !timeOut) return '';
    
    const fmtTime = (ts) => {
        const d = new Date(ts);
        return `${formatDateDDMMYYYY(d)} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}`;
    };
    
    let html = '<div class="time-pipeline">';
    
    // Helper to generate admin edit button
    const getEditBtn = (type, index, timestamp) => {
        if (!isAdmin) return '';
        return `<button class="btn-timeline-edit" onclick="openEditTimeModal('${woId}', '${type}', ${index}, ${timestamp})" title="Edit Time">
            <i class="fa-solid fa-pencil"></i>
        </button>`;
    };
    
    // Start event
    html += `<div class="pipeline-event pipeline-start">
        <span class="pipeline-dot dot-start"></span>
        <span class="pipeline-label">Started</span>
        <span class="pipeline-time">${fmtTime(new Date(timeIn).getTime())}</span>
        ${getEditBtn('start', -1, new Date(timeIn).getTime())}
    </div>`;
    
    history.forEach((entry, idx) => {
        let label = '';
        let dotClass = '';
        let eventClass = '';
        
        if (entry.type === 'pause') {
            label = 'Paused';
            dotClass = 'dot-pause';
            eventClass = 'pipeline-pause';
        } else if (entry.type === 'resume') {
            label = 'Resumed';
            dotClass = 'dot-resume';
            eventClass = 'pipeline-resume';
        } else if (entry.type === 'end') {
            label = 'Finished';
            dotClass = 'dot-end';
            eventClass = 'pipeline-end';
        }
        
        html += `<div class="pipeline-event ${eventClass}">
            <span class="pipeline-dot ${dotClass}"></span>
            <span class="pipeline-label">${label}</span>
            <span class="pipeline-time">${fmtTime(entry.at)}</span>
            ${getEditBtn('history', idx, entry.at)}
        </div>`;
    });
    
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
        const isPaused = isWorkOrderPaused(wo);
        const isActive = !isCompleted && !isPaused;

        const item = document.createElement('div');
        item.className = `work-item ${isActive ? 'active-work' : ''}`;

        let badgeClass = 'status-started';
        let badgeLabel = 'IN PROGRESS'; // Updated from STARTED for better flow
        if (isCompleted) { badgeClass = 'status-completed'; badgeLabel = 'COMPLETED'; }
        else if (isPaused) { badgeClass = 'status-paused'; badgeLabel = 'PAUSED'; }

        const startDate = new Date(wo.time_in);
        const workDate = formatDateDDMMYYYY(startDate);
        const timeIn = startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const timeOut = wo.time_out
            ? new Date(wo.time_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            : (isPaused ? 'Paused' : 'Ongoing');

        // Calculate actual worked time
        const woUserId = wo.user_id || (wo.user ? wo.user.id : null);
        const workedMs = calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, woUserId, wo.status);
        const workedStr = formatDuration(workedMs);
        const canAct = currentUser && (woUserId === currentUser.id);

        // Build timeline
        const timelineHTML = buildTimelineHTML(wo.id, wo.time_in, wo.time_out, wo.pause_history);

        item.innerHTML = `
            <div class="work-item-top">
                <div class="work-info">
                    <span class="work-desc">${wo.description}</span>
                    <span class="work-meta">${wo.id} | ${workDate} | ${timeIn} &rarr; ${timeOut}</span>
                    <span class="work-hours"><i class="fa-regular fa-clock"></i> Worked: <strong>${workedStr}</strong></span>
                </div>
                <div class="work-item-actions">
                    <div class="worker-group">
                        <span class="work-user" title="Lead"><i class="fa-solid fa-user"></i> ${wo.user ? wo.user.name : (currentUser ? currentUser.name : 'Unknown')}</span>
                        ${(wo.tagged_user_ids || []).map(tId => {
                            const u = allUsers.find(user => user.id === tId);
                            if (!u) return '';
                            const initials = u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                            const userColor = u.color_code ? `style="background: ${u.color_code};"` : '';
                            return `<div class="worker-avatar" title="${u.name}" ${userColor}>${initials}</div>`;
                        }).join('')}
                    </div>
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
    
    // Collect tagged users
    const taggedIds = Array.from(document.querySelectorAll('#nw-tag-list input:checked'))
        .map(cb => cb.value);
    
    try {
        const res = await fetch(`${API_BASE}/work-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: desc,
                user_id: currentUser.id,
                ref_id_jo: currentJobOrder.id,
                tagged_user_ids: taggedIds
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

function populateTaggingList() {
    const list = document.getElementById('nw-tag-list');
    if (!list) return;
    list.innerHTML = '';
    
    // Filter out current user
    const others = allUsers.filter(u => u.id !== currentUser.id);
    
    if (others.length === 0) {
        list.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; font-size: 0.8rem;">No other users to tag.</p>';
        return;
    }
    
    others.forEach(u => {
        const initials = u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const userColor = u.color_code ? `style="background: ${u.color_code};"` : '';
        
        const div = document.createElement('label');
        div.className = 'tag-option';
        div.innerHTML = `
            <input type="checkbox" value="${u.id}">
            <div class="mini-avatar" ${userColor} style="width: 20px; height: 20px; font-size: 9px;">${initials}</div>
            <span>${u.name}</span>
        `;
        list.appendChild(div);
    });
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
            
            // Sync history to server
            await fetch(`${API_BASE}/work-orders/${workOrderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pause_history: woState.history })
            });
            
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

window.toggleWorkOrderPause = async function(workOrderId, currentStatus) {
    const pauseState = getPauseState();
    const woState = pauseState[workOrderId] || { accumulatedTime: 0, isPaused: false, lastResumedAt: null, history: [] };
    if (!woState.history) woState.history = [];
    const now = getServerNow();
    
    // Rely on local state for toggling
    const isCurrentlyPaused = !!woState.isPaused;

    if (isCurrentlyPaused) {
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

    // Sync to server and AWAIT it
    try {
        await fetch(`${API_BASE}/work-orders/${workOrderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                status: woState.isPaused ? 'paused' : 'started',
                pause_history: woState.history 
            })
        });
    } catch (err) {
        console.error('Failed to sync pause state:', err);
    }

    if (currentJobOrder) await openJobDetail(currentJobOrder.id);
    if (typeof loadDashboard === 'function') await loadDashboard();
}

window.openEditTimeModal = function(woId, type, index, timestamp) {
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0]; // HH:MM:SS

    document.getElementById('ete-wo-id').value = woId;
    document.getElementById('ete-type').value = type;
    document.getElementById('ete-index').value = index;
    document.getElementById('ete-date').value = dateStr;
    document.getElementById('ete-time').value = timeStr;

    openModal(modals.editTimeEntry);
};

async function handleUpdateTimeEntry(e) {
    e.preventDefault();
    const woId = document.getElementById('ete-wo-id').value;
    const type = document.getElementById('ete-type').value;
    const index = parseInt(document.getElementById('ete-index').value);
    const dateVal = document.getElementById('ete-date').value;
    const timeVal = document.getElementById('ete-time').value;

    const newTimestamp = new Date(`${dateVal}T${timeVal}`).getTime();
    if (isNaN(newTimestamp)) {
        showToast('Invalid date or time format.', 'error');
        return;
    }

    try {
        // Fetch fresh WO data first
        const woRes = await fetch(`${API_BASE}/work-orders/${woId}`);
        const wo = await woRes.json();
        const payload = {};

        if (type === 'start') {
            payload.time_in = new Date(newTimestamp).toISOString();
        } else {
            const history = wo.pause_history || [];
            if (history[index]) {
                history[index].at = newTimestamp;
                // Important: Ensure history remains chronologically sorted
                history.sort((a, b) => a.at - b.at);
                payload.pause_history = history;
                
                // If it was an 'end' event, also sync time_out
                if (history[index].type === 'end') {
                    payload.time_out = new Date(newTimestamp).toISOString();
                }
            }
        }

        const res = await fetch(`${API_BASE}/work-orders/${woId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast('Timestamp updated and recalculated.', 'success');
            closeModal(modals.editTimeEntry);
            if (currentJobOrder) openJobDetail(currentJobOrder.id);
            loadDashboard();
        } else {
            throw new Error('Update failed');
        }
    } catch (err) {
        showToast('Failed to update timestamp.', 'error');
    }
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
            const wo = job.work_orders.find(w => {
                if (w.status === 'completed') return false;
                // Check if current user is the lead
                const isLead = (w.user_id && w.user_id === currentUser.id) || (w.user && w.user.id === currentUser.id);
                // Check if current user is tagged
                const isTagged = Array.isArray(w.tagged_user_ids) && w.tagged_user_ids.includes(currentUser.id);
                return isLead || isTagged;
            });
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
        startStopwatch(associatedJobId, activeUserWorkOrder.id, activeUserWorkOrder.description, activeUserWorkOrder.time_in, activeUserWorkOrder.pause_history);
    } else {
        currentActiveWorkOrderId = null;
        currentActiveJobId = null;
        stopStopwatch();
    }
}

function startStopwatch(jobId, woId, woDesc, timeInDateString, serverHistory) {
    // If same WO is already active and not paused, don't hard reset everything (prevent flickering)
    const isSameWO = currentActiveWorkOrderId === woId;
    
    if (stopwatchInterval && !isSameWO) {
        clearInterval(stopwatchInterval);
        stopwatchInterval = null;
    }
    
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
    let woState = pauseState[woId] || { accumulatedTime: 0, isPaused: false, lastResumedAt: null, history: [] };
    
    // Smart merge history: prioritized by length and last event timestamp
    const localHistory = woState.history || [];
    let bestHistory = localHistory;

    if (serverHistory && serverHistory.length > 0) {
        if (serverHistory.length > localHistory.length) {
            bestHistory = serverHistory;
        } else if (serverHistory.length === localHistory.length && localHistory.length > 0) {
            const lastServer = serverHistory[serverHistory.length - 1];
            const lastLocal = localHistory[localHistory.length - 1];
            if (lastServer.at > lastLocal.at) {
                bestHistory = serverHistory;
            }
        }
    }
    
    woState.history = bestHistory;

    // Derived properties from bestHistory
    if (bestHistory.length > 0) {
        const lastEvent = bestHistory[bestHistory.length - 1];
        if (lastEvent.type === 'pause') {
            woState.isPaused = true;
            woState.lastResumedAt = null;
        } else if (lastEvent.type === 'resume') {
            woState.isPaused = false;
            woState.lastResumedAt = lastEvent.at;
        } else if (lastEvent.type === 'end') {
            woState.isPaused = false;
            woState.lastResumedAt = null;
        }
    } else {
        // No history, use start time as last resume time
        if (!woState.isPaused && !woState.lastResumedAt) {
            woState.lastResumedAt = serverStartTime;
        }
    }
    
    // Save to ensure local consistency
    pauseState[woId] = woState;
    savePauseState(pauseState);

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
        // FRESH reading from localStorage to avoid closure staleness
        const latestPauseState = getPauseState();
        const latestWoState = latestPauseState[woId] || woState;
        
        // Calculate based on latest history for total accuracy
        const elapsed = calcWorkedTime(woId, timeInDateString, null, latestWoState.history, currentUser ? currentUser.id : null, latestWoState.isPaused ? 'paused' : 'started');
        renderTime(elapsed);
        // Update button state if it somehow got out of sync
        if (btnPause) {
            const currentUIisPaused = btnPause.querySelector('.fa-play') !== null;
            if (currentUIisPaused !== latestWoState.isPaused) {
                btnPause.innerHTML = latestWoState.isPaused ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-pause"></i>';
            }
        }
    }

    if (!stopwatchInterval) {
        update();
        stopwatchInterval = setInterval(update, 1000);
    } else {
        // Just force one update if it's already running
        update();
    }
}

async function togglePauseStopwatch() {
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

    // Sync to server and AWAIT it
    try {
        await fetch(`${API_BASE}/work-orders/${currentActiveWorkOrderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                status: woState.isPaused ? 'paused' : 'started',
                pause_history: woState.history 
            })
        });
    } catch (err) {
        console.error('Failed to sync pause state:', err);
    }

    // Refresh dashboard cards to reflect paused indicator
    if (typeof loadDashboard === 'function') await loadDashboard();
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

        // Control Visibility of status filter (only relevant for work orders)
        const statusFilterWrapper = document.getElementById('admin-status-filter-wrapper');
        if (filter === 'jobs') {
            if (statusFilterWrapper) statusFilterWrapper.classList.add('hidden');
        } else {
            if (statusFilterWrapper) statusFilterWrapper.classList.remove('hidden');
        }
        
        // Apply Status Filter (In Progress / Completed)
        const statusFilter = document.getElementById('admin-status-filter')?.value || 'all';
        if (statusFilter === 'ongoing') {
            workOrders = workOrders.filter(wo => wo.status !== 'completed');
        } else if (statusFilter === 'completed') {
            workOrders = workOrders.filter(wo => wo.status === 'completed');
        }

        
        // Apply Date Filter if set
        const dateFilter = document.getElementById('admin-date-filter').value;
        if (dateFilter) {
            const filterDate = formatDateDDMMYYYY(dateFilter);
            workOrders = workOrders.filter(wo => formatDateDDMMYYYY(wo.time_in) === filterDate);
        }

        // Apply User Filter if set
        const userFilter = document.getElementById('admin-user-filter').value;
        if (userFilter && userFilter !== 'all') {
            workOrders = workOrders.filter(wo => (wo.user_id === userFilter || (wo.user && wo.user.id === userFilter)));
        }

        // Apply Job Order Filter if set
        const joFilter = document.getElementById('admin-jo-filter').value;
        if (joFilter && joFilter !== 'all') {
            workOrders = workOrders.filter(wo => wo.ref_id_jo === joFilter);
        }

        // Apply Work Order ID/Desc Search if set
        const woSearch = document.getElementById('admin-wo-search').value.toLowerCase();
        if (woSearch) {
            workOrders = workOrders.filter(wo => {
                const idMatch = wo.id.toLowerCase().includes(woSearch);
                const descMatch = (wo.description || '').toLowerCase().includes(woSearch);
                return idMatch || descMatch;
            });
        }

        if (filter === 'jobs') {
            document.getElementById('admin-work-orders-list').classList.add('hidden');
            document.getElementById('admin-job-summaries-list').classList.remove('hidden');
            renderAdminJobSummaries(workOrders);
            return;
        } else {
            document.getElementById('admin-work-orders-list').classList.remove('hidden');
            document.getElementById('admin-job-summaries-list').classList.add('hidden');
        }
        
        statCount.textContent = `${workOrders.length} ${workOrders.length === 1 ? 'Order' : 'Orders'}`;
        renderAdminWorkOrders(workOrders);
        
    } catch (err) {
        showToast('Failed to load admin dashboard data.', 'error');
        listContainer.innerHTML = '<p class="text-center p-4">Error loading data.</p>';
    }
}

function populateAdminUserFilter() {
    const filter = document.getElementById('admin-user-filter');
    if (!filter) return;

    // Save current value to restore after repopulating if possible
    const currentVal = filter.value;
    
    // Clear all except the first "All Users" option
    while (filter.options.length > 1) {
        filter.remove(1);
    }

    allUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        filter.appendChild(opt);
    });

    // Try to restore previous selection
    filter.value = currentVal;
}

async function populateAdminJobFilter() {
    const filter = document.getElementById('admin-jo-filter');
    if (!filter) return;

    const currentVal = filter.value;
    
    // Clear all except the first "All Job Orders" option
    while (filter.options.length > 1) {
        filter.remove(1);
    }

    try {
        const res = await fetch(`${API_BASE}/job-orders`);
        const jobs = await res.json();
        
        jobs.forEach(job => {
            const opt = document.createElement('option');
            opt.value = job.id;
            opt.textContent = `${job.id} - ${job.title}`;
            filter.appendChild(opt);
        });
        
        filter.value = currentVal;
    } catch (err) {
        console.error('Failed to populate Job Order filter:', err);
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
        const userColor = wo.user && wo.user.color_code ? `style="background: ${wo.user.color_code};"` : '';
        
        const badgeClass = wo.status === 'completed' ? 'status-completed' : 'status-started';
        const badgeLabel = wo.status === 'completed' ? 'COMPLETED' : 'IN PROGRESS';
        
        // Build tagged users HTML
        const taggedIds = Array.isArray(wo.tagged_user_ids) ? wo.tagged_user_ids : [];
        const taggedUsersHTML = taggedIds.map(tId => {
            const u = allUsers.find(user => user.id === tId);
            if (!u) return '';
            const initials = u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const color = u.color_code ? `style="background: ${u.color_code};"` : '';
            return `<div class="admin-avatar" title="${u.name} (Tagged)" ${color} style="${u.color_code ? `background: ${u.color_code};` : ''} border: 2px solid rgba(165,180,252,0.5);">${initials}</div>`;
        }).join('');
        
        const tagBadge = taggedIds.length > 0 
            ? `<span class="badge" style="background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);font-size:0.6rem;"><i class="fa-solid fa-tags"></i> +${taggedIds.length}</span>` 
            : '';
        
        row.innerHTML = `
            <div class="col-id">${wo.id}</div>
            <div class="col-info">
                <span class="admin-desc">${wo.description || 'No description'}</span>
                <span class="admin-meta">Started ${formatDateDDMMYYYY(wo.time_in)} ${new Date(wo.time_in).toLocaleTimeString()}</span>
            </div>
            <div class="col-user">
                <div class="admin-user-info" style="flex-wrap: wrap; gap: 4px;">
                    <div style="display:flex; align-items:center; gap: 6px;">
                        <div class="admin-avatar" ${userColor}>${userInitials}</div>
                        <span class="admin-username">${userName}</span>
                    </div>
                    ${taggedIds.length > 0 ? `
                    <div style="display:flex; align-items:center; gap: 4px; margin-top: 4px;">
                        <i class="fa-solid fa-tag" style="font-size:0.65rem; color:#a5b4fc;"></i>
                        <div style="display:flex; gap: 2px;">${taggedUsersHTML}</div>
                    </div>` : ''}
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
    const workedMs = calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status);
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
        const workedMs = calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status);
        
        job.totalWorkedMs += workedMs;
        job.woCount += 1;
        
        const userId = wo.user_id;
        const userName = wo.user ? wo.user.name : 'Unknown User';
        const userColor = wo.user ? wo.user.color_code : null;
        if (!job.userBreakdown[userId]) {
            job.userBreakdown[userId] = { name: userName, color_code: userColor, timeMs: 0 };
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
            const userColorHTML = u.color_code ? `style="background: ${u.color_code};"` : '';
            breakdownHTML += `
                <div class="user-breakdown-item">
                    <div class="user-meta">
                        <div class="user-breakdown-avatar" ${userColorHTML}>${initials}</div>
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
        
        card.addEventListener('click', () => handlePrintJobBrief(job.id));
        
        container.appendChild(card);
    });
}
async function handlePrintJobBrief(jobId) {
    const printArea = document.getElementById('job-brief-print-area');
    if (!printArea) return;
    
    showToast('Preparing JO Brief...', 'info');
    
    try {
        const res = await fetch(`${API_BASE}/job-orders/${jobId}`);
        const job = await res.json();
        
        const workOrders = job.work_orders || [];
        const createdDate = formatDateDDMMYYYY(job.created_at);
        
        // Calculate totals
        let totalMs = 0;
        const userTotals = {};
        
        const tableRows = workOrders.map(wo => {
            const workedMs = calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status);
            totalMs += workedMs;
            
            const userName = wo.assigned_to_user ? wo.assigned_to_user.name : (wo.user ? wo.user.name : 'Unknown');
            if (!userTotals[userName]) userTotals[userName] = 0;
            userTotals[userName] += workedMs;
            
            return `
                <tr>
                    <td>${wo.id}</td>
                    <td><strong>${userName}</strong></td>
                    <td style="max-width: 300px;">${wo.description || 'N/A'}</td>
                    <td>${formatDateDDMMYYYY(wo.time_in)}<br><small>${new Date(wo.time_in).toLocaleTimeString()}</small></td>
                    <td>${formatDuration(workedMs)}</td>
                </tr>
            `;
        }).join('');

        const summaryRows = Object.entries(userTotals).map(([name, ms]) => `
            <div class="summary-row">
                <span>${name}</span>
                <span>${formatDuration(ms)}</span>
            </div>
        `).join('');

        printArea.innerHTML = `
            <div class="brief-container">
                <div class="brief-header">
                    <div class="brief-title-area">
                        <span class="brief-job-id">${job.id}</span>
                        <h1>${job.title}</h1>
                    </div>
                </div>
                
                <div class="brief-meta-grid">
                    <div class="brief-meta-item">
                        <span class="label">Customer</span>
                        <span class="value">${job.customer_name}</span>
                    </div>
                    <div class="brief-meta-item">
                        <span class="label">Date Created</span>
                        <span class="value">${createdDate}</span>
                    </div>
                </div>

                <div class="brief-section">
                    <h2 class="brief-section-title">Work Order Breakdown</h2>
                    <table class="brief-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>User</th>
                                <th>Description</th>
                                <th>Time In</th>
                                <th>Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows || '<tr><td colspan="5" style="text-align:center;">No work orders found.</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <div class="brief-summary-area">
                    <div class="brief-summary-box">
                        <h2 class="brief-section-title" style="border:none; margin-bottom: 0.5rem;">Time Summary</h2>
                        ${summaryRows}
                        <div class="summary-row total">
                            <span>Total Project Time</span>
                            <span>${formatDuration(totalMs)}</span>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 5rem; font-size: 0.75rem; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 1rem;">
                    Generated on ${new Date().toLocaleString()} | Nexus Job Management System
                </div>
            </div>
        `;

        // Trigger print
        setTimeout(() => {
            window.print();
        }, 500);

    } catch (err) {
        console.error('Failed to print JO brief:', err);
        showToast('Error preparing print brief.', 'error');
    }
}
async function handlePrintDailyReport() {
    const printArea = document.getElementById('job-brief-print-area');
    if (!printArea || !currentUser) return;

    showToast('Fetching your daily logs...', 'info');

    try {
        const res = await fetch(`${API_BASE}/work-orders`);
        const allWO = await res.json();
        
        // Filter for current user and today
        const todayStr = new Date().toDateString();
        const myTodayWO = allWO.filter(wo => {
            const isMe = wo.user_id === currentUser.id;
            const isToday = new Date(wo.time_in).toDateString() === todayStr;
            return isMe && isToday;
        });

        if (myTodayWO.length === 0) {
            showToast('No work logs found for today.', 'warning');
            return;
        }

        let totalMs = 0;
        const tableRows = myTodayWO.map(wo => {
            const workedMs = calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status);
            totalMs += workedMs;
            
            return `
                <tr>
                    <td>${wo.id}</td>
                    <td><strong>${wo.ref_id_jo}</strong></td>
                    <td style="max-width: 300px;">${wo.description || 'N/A'}</td>
                    <td>${new Date(wo.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>${formatDuration(workedMs)}</td>
                </tr>
            `;
        }).join('');

        printArea.innerHTML = `
            <div class="brief-container">
                <div class="brief-header">
                    <div class="brief-title-area">
                        <span class="brief-job-id" style="color: var(--success);">Daily Work Report</span>
                        <h1>${currentUser.name}</h1>
                    </div>
                    <div style="text-align: right;">
                        <span class="label">Date</span>
                        <span class="value">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                    </div>
                </div>

                <div class="brief-section">
                    <h2 class="brief-section-title">Today's Performance Breakdown</h2>
                    <table class="brief-table">
                        <thead>
                            <tr>
                                <th>WO ID</th>
                                <th>Job Order</th>
                                <th>Task Description</th>
                                <th>Start Time</th>
                                <th>Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>

                <div class="brief-summary-area">
                    <div class="brief-summary-box">
                        <div class="summary-row total">
                            <span>Total Hours Today</span>
                            <span>${formatDuration(totalMs)}</span>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 5rem; font-size: 0.75rem; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 1rem;">
                    Nexus Management System | Personal Daily Summary
                </div>
            </div>
        `;

        setTimeout(() => window.print(), 500);

    } catch (err) {
        console.error('Failed to generate daily report:', err);
        showToast('Error generating report.', 'error');
    }
}
// --- My Work Dashboard Functions ---

async function loadMyWorkDashboard(filter = 'all') {
    const listContainer = document.getElementById('mywork-orders-list');
    const statCount = document.getElementById('mywork-stat-count');
    
    listContainer.innerHTML = '<div class="line-loader w-full"></div>';
    
    if (!currentUser) return;

    try {
        const res = await fetch(`${API_BASE}/work-orders`);
        let workOrders = await res.json();
        
        // Filter to show WOs where user is lead OR tagged
        workOrders = workOrders.filter(wo => {
            const isLead = wo.user_id === currentUser.id || (wo.user && wo.user.id === currentUser.id);
            const isTagged = Array.isArray(wo.tagged_user_ids) && wo.tagged_user_ids.includes(currentUser.id);
            return isLead || isTagged;
        });
        
        // Mark tagged ones for display
        workOrders = workOrders.map(wo => ({
            ...wo,
            _isTagged: !(wo.user_id === currentUser.id || (wo.user && wo.user.id === currentUser.id))
        }));

        // Apply Search Filter
        const woSearch = document.getElementById('mywork-wo-search').value.toLowerCase();
        if (woSearch) {
            workOrders = workOrders.filter(wo => {
                const idMatch = wo.id.toLowerCase().includes(woSearch);
                const descMatch = (wo.description || '').toLowerCase().includes(woSearch);
                return idMatch || descMatch;
            });
        }

        // Apply Job Order Filter
        const joFilter = document.getElementById('mywork-jo-filter').value;
        if (joFilter && joFilter !== 'all') {
            workOrders = workOrders.filter(wo => wo.ref_id_jo === joFilter);
        }

        // Apply Date Filter
        const dateFilter = document.getElementById('mywork-date-filter').value;
        if (dateFilter) {
            workOrders = workOrders.filter(wo => {
                const woDate = new Date(wo.time_in).toISOString().split('T')[0];
                return woDate === dateFilter;
            });
        }

        // Filter based on tab
        if (filter === 'ongoing') {
            workOrders = workOrders.filter(wo => wo.status !== 'completed');
        } else if (filter === 'completed') {
            workOrders = workOrders.filter(wo => wo.status === 'completed');
        }
        
        statCount.textContent = `${workOrders.length} ${workOrders.length === 1 ? 'Order' : 'Orders'}`;
        renderMyWorkOrders(workOrders);
        
    } catch (err) {
        showToast('Failed to load My Work data.', 'error');
        listContainer.innerHTML = '<p class="text-center p-4">Error loading data.</p>';
    }
}

function renderMyWorkOrders(workOrders) {
    const container = document.getElementById('mywork-orders-list');
    container.innerHTML = '';
    
    if (workOrders.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-4">You have no work orders matching this criteria.</p>';
        return;
    }
    
    workOrders.forEach(wo => {
        const row = document.createElement('div');
        row.className = 'admin-list-row';
        row.style.gridTemplateColumns = '100px 2fr 1.5fr 150px 120px';
        
        const timeLapsed = calculateAdminTimeLapsed(wo); // Reuse simple calculator
        
        const badgeClass = wo.status === 'completed' ? 'status-completed' : 'status-started';
        const badgeLabel = wo.status === 'completed' ? 'COMPLETED' : 'IN PROGRESS';
        
        // Tag indicator if this user is a collaborator, not the lead
        const taggedBadge = wo._isTagged 
            ? `<span class="badge" style="background: rgba(99,102,241,0.15); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.3); font-size:0.65rem; margin-left: 5px;"><i class="fa-solid fa-tag"></i> Tagged</span>`
            : '';
            
        const leadUser = wo.user ? wo.user.name : 'Unknown';
        const tagLine = wo._isTagged ? `<span class="admin-meta" style="color: #a5b4fc;"><i class="fa-solid fa-user-tie"></i> Lead: ${leadUser}</span>` : '';
        
        row.innerHTML = `
            <div class="col-id">${wo.id}</div>
            <div class="col-info">
                <span class="admin-desc">${wo.description || 'No description'} ${taggedBadge}</span>
                <span class="admin-meta">Started ${formatDateDDMMYYYY(wo.time_in)} ${new Date(wo.time_in).toLocaleTimeString()}</span>
                ${tagLine}
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

async function populateMyWorkJobFilter() {
    const filter = document.getElementById('mywork-jo-filter');
    if (!filter) return;

    const currentVal = filter.value;
    
    // Clear all except the first option
    while (filter.options.length > 1) {
        filter.remove(1);
    }

    try {
        const res = await fetch(`${API_BASE}/job-orders`);
        const jobs = await res.json();
        
        jobs.forEach(job => {
            const opt = document.createElement('option');
            opt.value = job.id;
            opt.textContent = `${job.id} - ${job.title}`;
            filter.appendChild(opt);
        });
        
        filter.value = currentVal;
    } catch (err) {
        console.error('Failed to populate My Work Job filter:', err);
    }
}
