/**
 * Nexus Job Management - Frontend Logic
 */

// State
let currentUser = null;
let currentJobOrder = null;
let allUsers = [];
let joViewMode = localStorage.getItem('joViewMode') || 'grid';
let joSearchQuery = '';
let allCustomers = [];
let lastDashboardJobs = [];
let userHoursChart = null;
let trendChart = null;
let currentUserHoursPeriod = 'all';
let jobDetailWOTab = 'brief';
let dtAllRows = [];
let dtPage = 1;
let dtPageSize = 10;
let dtSearchQuery = '';
let jobOrdersStatusFilter = '';

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
    jobOrders: document.getElementById('job-orders-view'),
    jobOrderDetail: document.getElementById('job-detail-view'),
    admin: document.getElementById('admin-view'),
    myWork: document.getElementById('my-work-view'),
    settings: document.getElementById('settings-view')
};

const modals = {
    newJob: document.getElementById('new-job-modal'),
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
            // Show Admin Nav if user is Admin
            if (currentUser && currentUser.role === 'Admin') {
                const adminNavLink = document.getElementById('admin-nav-link');
                if (adminNavLink) adminNavLink.classList.remove('hidden');
            }

            // Honor a bookmarked/shared URL (e.g. from a dashboard card link);
            // otherwise land on the Dashboard as usual.
            if (!routeFromCurrentUrl()) {
                switchView('dashboard');
                loadDashboard();
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
        console.error('Failed to load users:', err);
    }

    // 3. Fetch Customers in background
    await loadCustomers();
}

async function loadCustomers() {
    try {
        const res = await fetch(`${API_BASE}/customers`);
        allCustomers = await res.json();
        populateCustomerSelects();
    } catch (err) {
        console.error('Failed to load customers:', err);
    }
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', theme);

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        const icon = toggleBtn.querySelector('i');
        if (icon) icon.className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        toggleBtn.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
    }
}

function applySidebarCollapse(collapsed) {
    if (collapsed) {
        document.documentElement.setAttribute('data-sidebar', 'collapsed');
    } else {
        document.documentElement.removeAttribute('data-sidebar');
    }
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');

    const btn = document.getElementById('btn-sidebar-collapse');
    if (btn) btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
}

function getCurrentTheme() {
    return localStorage.getItem('theme') || 'dark';
}

async function saveAvatarColor(newColor) {
    if (!currentUser) return;

    // Reflect immediately everywhere the avatar shows
    const sidebarAvatar = document.getElementById('current-user-avatar');
    if (sidebarAvatar) sidebarAvatar.style.background = newColor;
    const settingsAvatar = document.getElementById('settings-user-avatar');
    if (settingsAvatar) settingsAvatar.style.background = newColor;

    try {
        const res = await fetch(`${API_BASE}/users/${currentUser.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color_code: newColor })
        });

        if (res.ok) {
            const updatedUser = await res.json();
            currentUser.color_code = updatedUser.color_code;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showToast('Color updated.', 'success');
            // Refresh current view to apply to active cards
            if (!document.getElementById('dashboard-view').classList.contains('hidden-view')) loadDashboard();
            else if (!document.getElementById('job-orders-view').classList.contains('hidden-view')) loadDashboard();
            else if (!document.getElementById('admin-view').classList.contains('hidden-view')) loadAdminDashboard(document.querySelector('.admin-tabs .tab-btn.active')?.dataset.tab || 'all');
            else if (!document.getElementById('my-work-view').classList.contains('hidden-view')) loadMyWorkDashboard(document.querySelector('#mywork-tabs .tab-btn.active')?.dataset.tab || 'all');
        } else {
            showToast('Failed to update color.', 'error');
        }
    } catch (error) {
        showToast('Network error updating color.', 'error');
    }
}

function loadSettingsProfile() {
    if (!currentUser) return;

    const avatar = document.getElementById('settings-user-avatar');
    if (avatar) {
        avatar.textContent = currentUser.name.charAt(0).toUpperCase();
        avatar.style.background = currentUser.color_code || '#6366f1';
    }
    const colorPicker = document.getElementById('settings-color-picker');
    if (colorPicker) colorPicker.value = currentUser.color_code || '#6366f1';

    document.getElementById('settings-name-preview').textContent = currentUser.name;
    document.getElementById('settings-username-preview').textContent = currentUser.username || '';
    document.getElementById('settings-name-input').value = currentUser.name;
    document.getElementById('settings-username-input').value = currentUser.username || '';
    document.getElementById('settings-role-input').value = currentUser.role || 'User';

    applyTheme(getCurrentTheme());
}

async function handleSaveSettingsProfile(e) {
    e.preventDefault();
    if (!currentUser) return;

    const newName = document.getElementById('settings-name-input').value.trim();
    if (!newName) {
        showToast('Name cannot be empty.', 'error');
        return;
    }

    const btn = document.getElementById('btn-save-settings-profile');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
        const res = await fetch(`${API_BASE}/users/${currentUser.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });

        if (res.ok) {
            const updatedUser = await res.json();
            currentUser.name = updatedUser.name;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));

            document.getElementById('current-user-name').textContent = currentUser.name;
            document.getElementById('current-user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
            document.getElementById('settings-name-preview').textContent = currentUser.name;
            document.getElementById('settings-user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();

            showToast('Profile updated.', 'success');
        } else {
            const err = await res.json().catch(() => ({}));
            showToast(err.error || 'Failed to update profile.', 'error');
        }
    } catch (error) {
        showToast('Network error updating profile.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
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

    // Stopwatch icon — toggles the active-work popover open/closed
    const stopwatchIconBtn = document.getElementById('btn-stopwatch-icon');
    if (stopwatchIconBtn) {
        stopwatchIconBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const popover = document.getElementById('active-work-stopwatch');
            if (popover.classList.contains('open')) {
                closeStopwatchPopover();
            } else {
                openStopwatchPopover(stopwatchIconBtn);
            }
        });
    }
    document.getElementById('active-work-stopwatch')?.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', closeStopwatchPopover);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeStopwatchPopover();
    });


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

    // Team Work Hours chart period toggle
    const userHoursPeriodTabs = document.getElementById('user-hours-period-tabs');
    if (userHoursPeriodTabs) {
        userHoursPeriodTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.chart-period-btn');
            if (!btn) return;
            document.querySelectorAll('#user-hours-period-tabs .chart-period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentUserHoursPeriod = btn.dataset.period;
            renderUserHoursChart(lastDashboardJobs);
        });
    }

    // Color Picker Listeners (sidebar + Settings page both feed the same handler)
    const colorPicker = document.getElementById('user-color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('change', (e) => saveAvatarColor(e.target.value));
    }
    const settingsColorPicker = document.getElementById('settings-color-picker');
    if (settingsColorPicker) {
        settingsColorPicker.addEventListener('change', (e) => saveAvatarColor(e.target.value));
    }

    // Settings: Profile page nav + form
    document.getElementById('btn-goto-settings')?.addEventListener('click', () => {
        switchView('settings');
        loadSettingsProfile();
    });
    document.getElementById('settings-profile-form')?.addEventListener('submit', handleSaveSettingsProfile);

    // Theme toggle
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        applyTheme(getCurrentTheme() === 'light' ? 'dark' : 'light');
    });

    // Dashboard "My Active Work" data table controls
    const dtSearchInput = document.getElementById('dt-search');
    let dtSearchTimer;
    if (dtSearchInput) {
        dtSearchInput.addEventListener('input', () => {
            clearTimeout(dtSearchTimer);
            dtSearchTimer = setTimeout(() => {
                dtSearchQuery = dtSearchInput.value;
                dtPage = 1;
                renderDtTable();
            }, 250);
        });
    }
    document.getElementById('dt-page-size')?.addEventListener('change', (e) => {
        dtPageSize = parseInt(e.target.value, 10) || 10;
        dtPage = 1;
        renderDtTable();
    });
    document.getElementById('dt-prev')?.addEventListener('click', () => {
        dtPage = Math.max(1, dtPage - 1);
        renderDtTable();
    });
    document.getElementById('dt-next')?.addEventListener('click', () => {
        dtPage += 1;
        renderDtTable();
    });

    // Modals
    document.getElementById('btn-new-job').addEventListener('click', () => {
        populateAssigneeList('nj-assigned-list');
        document.getElementById('nj-work-orders-list').innerHTML = ''; // clear leftover rows
        openModal(modals.newJob);
    });

    // Add Work Order row inside Create Job modal
    document.getElementById('btn-nj-add-wo').addEventListener('click', () => {
        const list = document.getElementById('nj-work-orders-list');
        const row = document.createElement('div');
        row.className = 'nj-wo-row row-left';
        row.style.cssText = 'gap: 0.5rem; align-items: center;';
        row.innerHTML = `
            <input type="text" class="nj-wo-desc" placeholder="Work order description..." style="flex: 1; padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: inherit; font-size: 0.9rem;">
            <button type="button" class="btn btn-outline btn-sm btn-nj-remove-wo" title="Remove"><i class="fa-solid fa-trash" style="color:#f87171;"></i></button>
        `;
        row.querySelector('.btn-nj-remove-wo').addEventListener('click', () => row.remove());
        list.appendChild(row);
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

    // Admin Navigation — sidebar sub-links jump straight to a specific admin tab
    document.querySelectorAll('#admin-nav-link .sidebar-sub').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchView('admin');
            document.querySelectorAll('#admin-nav-link .sidebar-sub').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('#admin-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
            updateAdminBreadcrumb(tab);
            populateAdminUserFilter();
            populateAdminJobFilter();
            loadAdminDashboard(tab);
        });
    });

    const btnBackToJobs = document.getElementById('btn-back-to-jobs');
    if (btnBackToJobs) {
        btnBackToJobs.addEventListener('click', () => {
            goToJobOrders();

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
                document.querySelectorAll('#admin-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                const tab = e.target.dataset.tab;
                document.querySelectorAll('#admin-nav-link .sidebar-sub').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
                updateAdminBreadcrumb(tab);
                loadAdminDashboard(tab);
            }
        });
    }

    // Customer Management
    const addCustomerForm = document.getElementById('add-customer-form');
    if (addCustomerForm) {
        addCustomerForm.addEventListener('submit', handleAddCustomer);

        // Dynamic email rows: add new email row when "+" is clicked
        addCustomerForm.addEventListener('click', (e) => {
            if (e.target.closest('.btn-add-email')) {
                const emailList = document.getElementById('customer-email-list');
                const newRow = document.createElement('div');
                newRow.className = 'customer-email-row row-left';
                newRow.style.gap = '0.5rem';
                newRow.innerHTML = `
                    <input type="email" class="customer-email-input" placeholder="client@example.com" style="flex: 1; padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: inherit; font-size: 0.9rem;">
                    <button type="button" class="btn btn-outline btn-sm btn-remove-email" title="Remove"><i class="fa-solid fa-minus"></i></button>`;
                emailList.appendChild(newRow);
            }
            if (e.target.closest('.btn-remove-email')) {
                e.target.closest('.customer-email-row').remove();
            }
        });
    }

    const adminDateFilter = document.getElementById('admin-date-filter');
    const adminDatePickerGroup = document.getElementById('admin-date-picker-group');
    if (adminDateFilter) {
        if (adminDatePickerGroup) {
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
        }

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

    // Logo → Dashboard
    document.getElementById('btn-logo-home')?.addEventListener('click', () => {
        switchView('dashboard');
        loadDashboard();
    });

    // Sidebar "Dashboard" link
    document.getElementById('btn-goto-dashboard')?.addEventListener('click', () => {
        switchView('dashboard');
        loadDashboard();
    });

    // Sidebar "Job Orders" link
    document.getElementById('btn-goto-job-orders')?.addEventListener('click', () => {
        goToJobOrders();
    });

    // Clear filter banner on the Job Orders page
    document.getElementById('btn-clear-jo-filter')?.addEventListener('click', () => {
        clearJobOrdersFilter();
    });

    // Mobile sidebar toggle
    document.getElementById('btn-sidebar-toggle')?.addEventListener('click', () => {
        document.getElementById('main-nav-header')?.classList.toggle('sidebar-open');
        document.getElementById('sidebar-scrim')?.classList.toggle('sidebar-open');
    });
    document.getElementById('sidebar-scrim')?.addEventListener('click', closeSidebarMobile);

    // Work order detail drawer
    document.getElementById('btn-close-wo-drawer')?.addEventListener('click', closeWorkOrderDrawer);
    document.getElementById('wo-drawer-scrim')?.addEventListener('click', closeWorkOrderDrawer);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeWorkOrderDrawer();
    });

    // Timeline toggle inside the drawer (mirrors the same handler bound to #work-orders-list)
    const woDrawerBody = document.getElementById('wo-drawer-body');
    if (woDrawerBody) {
        woDrawerBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-timeline-toggle');
            if (!btn) return;
            const pipeline = document.getElementById(`pipeline-${btn.dataset.woId}`);
            if (!pipeline) return;
            const nowHidden = pipeline.classList.toggle('hidden');
            btn.classList.toggle('open', !nowHidden);
            const icon = btn.querySelector('i');
            if (icon) icon.className = nowHidden ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
            const label = btn.querySelector('.timeline-toggle-label');
            if (label) label.textContent = nowHidden ? 'View Time History' : 'Hide Time History';
        });
    }

    // Desktop sidebar collapse toggle
    const sidebarCollapseBtn = document.getElementById('btn-sidebar-collapse');
    if (sidebarCollapseBtn) {
        sidebarCollapseBtn.title = document.documentElement.getAttribute('data-sidebar') === 'collapsed'
            ? 'Expand sidebar' : 'Collapse sidebar';
        sidebarCollapseBtn.addEventListener('click', () => {
            const isCollapsed = document.documentElement.getAttribute('data-sidebar') === 'collapsed';
            applySidebarCollapse(!isCollapsed);
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
            goToJobOrders();
        });
    }

    const btnBackToJobsFromDetail = document.getElementById('btn-back-to-jobs-from-detail');
    if (btnBackToJobsFromDetail) {
        btnBackToJobsFromDetail.addEventListener('click', () => {
            goToJobOrders();
        });
    }

    // Job Detail: Work Orders bare-list vs full-detail tabs
    const jdWoTabs = document.getElementById('jd-wo-tabs');
    if (jdWoTabs) {
        jdWoTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn');
            if (!btn) return;
            jdWoTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            jobDetailWOTab = btn.dataset.tab;
            renderWorkOrders(window._lastRenderedWorkOrders || []);
        });
    }

    // Work order timeline: collapsed by default, toggle to view pause/resume history
    const workOrdersList = document.getElementById('work-orders-list');
    if (workOrdersList) {
        workOrdersList.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-timeline-toggle');
            if (!btn) return;
            const pipeline = document.getElementById(`pipeline-${btn.dataset.woId}`);
            if (!pipeline) return;
            const nowHidden = pipeline.classList.toggle('hidden');
            btn.classList.toggle('open', !nowHidden);
            const icon = btn.querySelector('i');
            if (icon) icon.className = nowHidden ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
            const label = btn.querySelector('.timeline-toggle-label');
            if (label) label.textContent = nowHidden ? 'View Time History' : 'Hide Time History';
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

    // Handle Sidebar Nav visibility (hidden on login/register)
    const mainHeader = document.getElementById('main-nav-header');
    const sidebarToggle = document.getElementById('btn-sidebar-toggle');
    const sidebarCollapseToggle = document.getElementById('btn-sidebar-collapse');
    const stopwatchIcon = document.getElementById('btn-stopwatch-icon');
    const showNav = viewName !== 'login' && viewName !== 'register';
    if (mainHeader) mainHeader.classList.toggle('hidden-view', !showNav);
    if (sidebarToggle) sidebarToggle.classList.toggle('hidden-view', !showNav);
    if (sidebarCollapseToggle) sidebarCollapseToggle.classList.toggle('hidden-view', !showNav);
    if (stopwatchIcon) stopwatchIcon.classList.toggle('hidden-view', !showNav);

    closeSidebarMobile();
    closeWorkOrderDrawer();
    closeStopwatchPopover();

    // Highlight the active sidebar link for this view
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    if (viewName === 'dashboard') {
        document.getElementById('btn-goto-dashboard')?.classList.add('active');
    } else if (viewName === 'jobOrders' || viewName === 'jobOrderDetail') {
        document.getElementById('btn-goto-job-orders')?.classList.add('active');
    } else if (viewName === 'myWork') {
        document.getElementById('btn-goto-my-work')?.classList.add('active');
    } else if (viewName === 'settings') {
        document.getElementById('btn-goto-settings')?.classList.add('active');
    }

    views[viewName].classList.remove('hidden-view');
    // small timeout to allow display:block to apply before animating opacity
    setTimeout(() => views[viewName].classList.add('active-view'), 50);
}

function closeSidebarMobile() {
    document.getElementById('main-nav-header')?.classList.remove('sidebar-open');
    document.getElementById('sidebar-scrim')?.classList.remove('sidebar-open');
}

// Plain navigation to Job Orders (sidebar link, "Back to Job Orders" buttons,
// post-completion flows) always clears any status filter left over from a
// dashboard card link, so it never silently shows a stale filtered view.
function goToJobOrders() {
    jobOrdersStatusFilter = '';
    switchView('jobOrders');
    loadDashboard();
}

function clearJobOrdersFilter() {
    goToJobOrders();
}

function updateAdminBreadcrumb(tab) {
    const labels = { all: 'Work Orders', jobs: 'Job Summaries', customers: 'Clients' };
    const el = document.getElementById('breadcrumb-admin-tab');
    if (el) el.textContent = labels[tab] || 'Work Orders';
}

// --- URL Parameter Routing (dashboard stat cards → shareable/bookmarkable links) ---

// Applies a view + its filters. Shared by card clicks, initial page load
// (when the URL already carries params), and browser back/forward.
function applyRoute(view, params = {}) {
    switch (view) {
        case 'jobOrders':
            jobOrdersStatusFilter = params.status === 'open' ? 'open' : '';
            switchView('jobOrders');
            loadDashboard();
            break;

        case 'myWork': {
            switchView('myWork');
            populateMyWorkJobFilter();
            const tab = params.tab || 'all';
            document.querySelectorAll('#mywork-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
            loadMyWorkDashboard(tab);
            break;
        }

        case 'admin': {
            if (!currentUser || currentUser.role !== 'Admin') {
                switchView('dashboard');
                loadDashboard();
                break;
            }
            switchView('admin');
            const tab = params.tab || 'all';
            document.querySelectorAll('#admin-nav-link .sidebar-sub').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
            document.querySelectorAll('#admin-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
            updateAdminBreadcrumb(tab);
            const statusSelect = document.getElementById('admin-status-filter');
            if (statusSelect) statusSelect.value = params.status || 'all';
            populateAdminUserFilter();
            populateAdminJobFilter();
            loadAdminDashboard(tab);
            break;
        }

        case 'settings':
            switchView('settings');
            loadSettingsProfile();
            break;

        case 'dashboard':
        default:
            switchView('dashboard');
            loadDashboard();
    }
}

// Pushes a real URL (view + params) so the destination is shareable,
// bookmarkable, and works with the browser back/forward buttons.
function navigateTo(view, params = {}) {
    const search = new URLSearchParams({ view, ...params }).toString();
    history.pushState({ view, params }, '', `?${search}`);
    applyRoute(view, params);
}

// Cards 3-6 (work-order stat counts) point at different pages depending on
// role: Admins have a dedicated Work Orders admin view; everyone else sees
// their own work through "My Work Orders" instead.
function navigateToWorkOrders(status) {
    const isAdmin = currentUser && currentUser.role === 'Admin';
    if (isAdmin) {
        navigateTo('admin', { tab: 'all', status });
    } else {
        navigateTo('myWork', { tab: status });
    }
}

function routeFromCurrentUrl() {
    const params = Object.fromEntries(new URLSearchParams(location.search).entries());
    const view = params.view;
    delete params.view;
    if (!view) return false;
    applyRoute(view, params);
    return true;
}

window.addEventListener('popstate', (e) => {
    if (!currentUser) return;
    if (e.state && e.state.view) {
        applyRoute(e.state.view, e.state.params || {});
    } else if (!routeFromCurrentUrl()) {
        // No state and no URL params — this is the pre-navigation entry, i.e. Dashboard.
        switchView('dashboard');
        loadDashboard();
    }
});

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

function getChartAccentColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || '#6366f1';
}

function isLightTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light';
}

function getChartGridColor() {
    return isLightTheme() ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)';
}

function getChartTickColor() {
    return isLightTheme() ? '#64748b' : '#94a3b8';
}

function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function chartTooltipDefaults() {
    return {
        backgroundColor: 'rgba(13,16,26,0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        padding: 10
    };
}

function aggregateUserHours(jobs, period) {
    const allWorkOrders = jobs.flatMap(j => j.work_orders || []);
    const now = getServerNow();
    let dayStartMs = null;

    if (period === 'today') {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        dayStartMs = d.getTime();
    } else if (period === 'week') {
        dayStartMs = now - 7 * 24 * 60 * 60 * 1000;
    } else if (period === 'month') {
        dayStartMs = now - 30 * 24 * 60 * 60 * 1000;
    }

    // Admins see the whole team's hours; regular users only ever see their own.
    const isAdmin = currentUser && currentUser.role === 'Admin';

    const hoursByUser = {};
    const addHours = (userId, ms) => {
        if (!userId || ms <= 0) return;
        if (!isAdmin && userId !== currentUser?.id) return;
        hoursByUser[userId] = (hoursByUser[userId] || 0) + ms;
    };

    allWorkOrders.forEach(wo => {
        if (!wo.time_in) return;
        const ms = period === 'all'
            ? calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status)
            : calcDailyWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status, dayStartMs, now);
        if (ms <= 0) return;
        addHours(wo.user_id, ms);
        (Array.isArray(wo.tagged_user_ids) ? wo.tagged_user_ids : []).forEach(tid => addHours(tid, ms));
    });

    return Object.entries(hoursByUser)
        .map(([userId, ms]) => {
            const user = allUsers.find(u => u.id === userId);
            return { name: user ? user.name : 'Unknown', ms };
        })
        .sort((a, b) => b.ms - a.ms)
        .slice(0, isAdmin ? 10 : 1);
}

function renderUserHoursChart(jobs) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('chart-user-hours');
    const emptyMsg = document.getElementById('chart-user-hours-empty');
    if (!canvas) return;

    const isAdmin = currentUser && currentUser.role === 'Admin';
    const titleEl = document.getElementById('chart-user-hours-title');
    if (titleEl) titleEl.textContent = isAdmin ? 'Team Work Hours' : 'My Work Hours';

    const rows = aggregateUserHours(jobs, currentUserHoursPeriod);

    if (rows.length === 0) {
        canvas.classList.add('hidden');
        emptyMsg?.classList.remove('hidden');
        if (userHoursChart) { userHoursChart.destroy(); userHoursChart = null; }
        return;
    }
    canvas.classList.remove('hidden');
    emptyMsg?.classList.add('hidden');

    const accent = getChartAccentColor();
    const labels = rows.map(r => r.name);
    const data = rows.map(r => +(r.ms / 3600000).toFixed(2));

    if (userHoursChart) userHoursChart.destroy();
    userHoursChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Hours',
                data,
                backgroundColor: hexToRgba(accent, 0.65),
                hoverBackgroundColor: accent,
                borderRadius: 6,
                borderSkipped: false,
                maxBarThickness: 42
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { ...chartTooltipDefaults(), callbacks: { label: (ctx) => `${ctx.parsed.y}h logged` } }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: getChartTickColor(), font: { size: 11 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: getChartGridColor() },
                    ticks: { color: getChartTickColor(), font: { size: 11 } }
                }
            }
        }
    });
}

function aggregateTrend(jobs) {
    const allWorkOrders = jobs.flatMap(j => j.work_orders || []);
    const days = [];
    const today = new Date(getServerNow());
    today.setHours(0, 0, 0, 0);

    for (let i = 13; i >= 0; i--) {
        const dayStart = new Date(today);
        dayStart.setDate(dayStart.getDate() - i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        days.push({
            label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            startMs: dayStart.getTime(),
            endMs: dayEnd.getTime()
        });
    }

    const data = days.map(d => {
        let ms = 0;
        allWorkOrders.forEach(wo => {
            if (!wo.time_in) return;
            ms += calcDailyWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status, d.startMs, d.endMs);
        });
        return +(ms / 3600000).toFixed(2);
    });

    return { labels: days.map(d => d.label), data };
}

function renderTrendChart(jobs) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('chart-trend');
    const emptyMsg = document.getElementById('chart-trend-empty');
    if (!canvas) return;

    const { labels, data } = aggregateTrend(jobs);
    const hasActivity = data.some(v => v > 0);

    if (!hasActivity) {
        canvas.classList.add('hidden');
        emptyMsg?.classList.remove('hidden');
        if (trendChart) { trendChart.destroy(); trendChart = null; }
        return;
    }
    canvas.classList.remove('hidden');
    emptyMsg?.classList.add('hidden');

    const accent = getChartAccentColor();

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Hours Logged',
                data,
                borderColor: accent,
                backgroundColor: hexToRgba(accent, 0.12),
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: accent,
                pointBorderColor: '#0a0c14',
                pointBorderWidth: 1,
                tension: 0.35,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { ...chartTooltipDefaults(), callbacks: { label: (ctx) => `${ctx.parsed.y}h logged` } }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: getChartTickColor(), font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: getChartGridColor() },
                    ticks: { color: getChartTickColor(), font: { size: 11 } }
                }
            }
        }
    });
}

function renderMyActiveWork(jobs) {
    if (!currentUser) return;

    const rows = [];
    jobs.forEach(job => {
        (job.work_orders || []).forEach(wo => {
            if (wo.status !== 'started' && wo.status !== 'paused') return;
            const woUserId = wo.user_id || (wo.user ? wo.user.id : null);
            const isLead = woUserId === currentUser.id;
            const isTagged = Array.isArray(wo.tagged_user_ids) && wo.tagged_user_ids.includes(currentUser.id);
            if (!isLead && !isTagged) return;
            rows.push({ wo, job, isLead });
        });
    });

    // Most recently started first
    rows.sort((a, b) => new Date(b.wo.time_in) - new Date(a.wo.time_in));

    dtAllRows = rows;
    dtPage = 1;
    renderDtTable();
}

function renderDtTable() {
    const tbody = document.getElementById('dashboard-my-work-list');
    const entriesInfo = document.getElementById('dt-entries-info');
    const prevBtn = document.getElementById('dt-prev');
    const nextBtn = document.getElementById('dt-next');
    if (!tbody) return;

    const query = dtSearchQuery.trim().toLowerCase();
    const filtered = query
        ? dtAllRows.filter(({ wo, job }) =>
            (wo.description || '').toLowerCase().includes(query) ||
            job.id.toLowerCase().includes(query) ||
            (job.title || '').toLowerCase().includes(query))
        : dtAllRows;

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / dtPageSize));
    if (dtPage > totalPages) dtPage = totalPages;

    const start = total === 0 ? 0 : (dtPage - 1) * dtPageSize + 1;
    const end = Math.min(dtPage * dtPageSize, total);
    const pageRows = filtered.slice(start - 1, end);

    tbody.innerHTML = '';

    if (total === 0) {
        tbody.innerHTML = `<tr class="dt-empty-row"><td colspan="5">No active work orders${query ? ' match your search.' : '.'}</td></tr>`;
    } else {
        pageRows.forEach(({ wo, job, isLead }) => {
            const isPaused = isWorkOrderPaused(wo);
            const woUserId = wo.user_id || (wo.user ? wo.user.id : null);
            const workedStr = formatDuration(calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, woUserId, wo.status));
            const disabledAttr = !isLead ? 'disabled' : '';
            const disabledTitle = !isLead ? 'title="Only the assigned user can control this"' : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span class="dt-wo-title">${wo.description || 'No description'}</span>
                    <span class="dt-wo-id">${wo.id}</span>
                </td>
                <td>
                    <span class="dt-job-link" onclick="openJobDetail('${job.id}')" title="Open Job Order">${job.id}</span>
                    <span class="dt-job-sub">${job.title}</span>
                </td>
                <td class="dt-worked">${workedStr}</td>
                <td>
                    <span class="dt-status">
                        <span class="${isPaused ? 'pulse-dot-paused' : 'pulse-dot'}"></span>
                        ${isPaused ? 'Paused' : 'In Progress'}
                    </span>
                </td>
                <td>
                    <div class="dt-actions">
                        <button class="compact-icon-btn" onclick="toggleWorkOrderPause('${wo.id}', '${wo.status}')" ${disabledAttr} ${disabledTitle || `title="${isPaused ? 'Resume' : 'Pause'}"`}>
                            <i class="fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}"></i>
                        </button>
                        <button class="compact-icon-btn" onclick="completeWorkOrder('${wo.id}')" ${disabledAttr} ${disabledTitle || 'title="Finish"'}>
                            <i class="fa-solid fa-check"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    if (entriesInfo) entriesInfo.textContent = `Showing ${total === 0 ? 0 : start} to ${end} of ${total} entries`;
    if (prevBtn) prevBtn.disabled = dtPage <= 1;
    if (nextBtn) nextBtn.disabled = dtPage >= totalPages;
}

function updateDashboardStats(jobs) {
    const setStat = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const allWorkOrders = jobs.flatMap(j => j.work_orders || []);
    const activeJobs = jobs.filter(j => j.status === 'open');
    const pendingWO = allWorkOrders.filter(w => w.status === 'pending');
    const inProgressWO = allWorkOrders.filter(w => ['started', 'ongoing', 'paused'].includes(w.status));
    const completedWO = allWorkOrders.filter(w => w.status === 'completed');

    setStat('stat-total-jobs', jobs.length);
    setStat('stat-active-jobs', activeJobs.length);
    setStat('stat-total-wo', allWorkOrders.length);
    setStat('stat-pending-wo', pendingWO.length);
    setStat('stat-inprogress-wo', inProgressWO.length);
    setStat('stat-completed-wo', completedWO.length);
}

async function loadDashboard() {
    const activeContainer = document.getElementById('active-job-orders-container');
    const completedContainer = document.getElementById('completed-job-orders-container');
    
    activeContainer.innerHTML = '<div class="line-loader w-full"></div>';
    completedContainer.innerHTML = '';

    try {
        const res = await fetch(`${API_BASE}/job-orders`);
        let jobs = await res.json();

        // Admins see all job orders; regular users only see ones they're assigned to,
        // ones they created, or unassigned/open jobs.
        const isAdmin = currentUser && currentUser.role === 'Admin';
        if (!isAdmin && currentUser) {
            jobs = jobs.filter(job => {
                const assignedIds = Array.isArray(job.assigned_to_ids) ? job.assigned_to_ids : [];
                const isAssigned = assignedIds.includes(currentUser.id);
                const isCreator = job.assigned_by === currentUser.id;
                const isUnassigned = assignedIds.length === 0;
                return isAssigned || isCreator || isUnassigned;
            });
        }

        activeContainer.innerHTML = ''; // Clear loader

        lastDashboardJobs = jobs;
        updateDashboardStats(jobs);
        renderUserHoursChart(jobs);
        renderTrendChart(jobs);
        renderMyActiveWork(jobs);

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

        // Status filter from a dashboard card link ("Active Job Orders" -> open only)
        const jdFilterBanner = document.getElementById('jo-filter-banner');
        const jdCompletedHeader = document.getElementById('jo-completed-section-header');
        const showOnlyActive = jobOrdersStatusFilter === 'open';
        if (showOnlyActive) {
            completedJobs = [];
            if (jdCompletedHeader) jdCompletedHeader.classList.add('hidden');
            completedContainer.classList.add('hidden');
            if (jdFilterBanner) jdFilterBanner.classList.remove('hidden');
        } else {
            if (jdCompletedHeader) jdCompletedHeader.classList.remove('hidden');
            completedContainer.classList.remove('hidden');
            if (jdFilterBanner) jdFilterBanner.classList.add('hidden');
        }

        // Apply View Mode Containers
        activeContainer.className = joViewMode === 'grid' ? 'grid-container' : 'list-container';
        completedContainer.className = joViewMode === 'grid' ? 'grid-container' : 'list-container';
        if (showOnlyActive) completedContainer.classList.add('hidden');

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
            <span><i class="fa-regular fa-user"></i> ${getAssignedNamesHTML(job)}</span>
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
        const activeWorkOrders = job.work_orders.filter(wo => wo.status !== 'completed' && wo.status !== 'pending' && wo.time_in);
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
            <i class="fa-regular fa-user"></i> <span>${getAssignedNamesHTML(job)}</span>
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
    select.innerHTML = '<option value="">Open</option>';
    allUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.name} (${u.role})`;
        select.appendChild(opt);
    });
}

function populateAssigneeList(containerId, selectedIds = []) {
    const list = document.getElementById(containerId);
    if (!list) return;
    list.innerHTML = '';

    if (allUsers.length === 0) {
        list.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; font-size: 0.8rem;">No users available.</p>';
        return;
    }

    allUsers.forEach(u => {
        const initials = u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const userColor = u.color_code ? `style="background: ${u.color_code};"` : '';
        const checked = selectedIds.includes(u.id) ? 'checked' : '';

        const div = document.createElement('label');
        div.className = 'tag-option';
        div.innerHTML = `
            <input type="checkbox" value="${u.id}" ${checked}>
            <div class="mini-avatar" ${userColor} style="width: 20px; height: 20px; font-size: 9px;">${initials}</div>
            <span>${u.name}</span>
        `;
        list.appendChild(div);
    });
}

function getAssignedNamesHTML(job) {
    const ids = Array.isArray(job.assigned_to_ids) ? job.assigned_to_ids : [];
    const names = ids.map(id => allUsers.find(u => u.id === id)?.name).filter(Boolean);
    return names.length ? names.join(', ') : 'Unassigned';
}

// --- Job Order CRUD ---

async function handleCreateJob(e) {
    e.preventDefault();

    const assignedToIds = Array.from(document.querySelectorAll('#nj-assigned-list input:checked'))
        .map(cb => cb.value);

    const payload = {
        title: document.getElementById('nj-title').value,
        customer_name: document.getElementById('nj-customer').value,
        assigned_to_ids: assignedToIds,
        assigned_by: currentUser.id,
        description: document.getElementById('nj-desc').value,
        status: 'open'
    };

    // Collect inline work order descriptions (no estimate — users set that themselves)
    const woRows = document.querySelectorAll('#nj-work-orders-list .nj-wo-row');
    const workOrderDrafts = [];
    woRows.forEach(row => {
        const desc = row.querySelector('.nj-wo-desc').value.trim();
        if (desc) workOrderDrafts.push({ description: desc });
    });

    try {
        const res = await fetch(`${API_BASE}/job-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to create job order');
        }
        const newJob = await res.json();

        // Create work orders — failures don't block JO success
        let woCreated = 0;
        for (const wo of workOrderDrafts) {
            try {
                const woRes = await fetch(`${API_BASE}/work-orders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description: wo.description, ref_id_jo: newJob.id })
                });
                if (woRes.ok) woCreated++;
            } catch { /* individual WO failure is non-blocking */ }
        }

        const woMsg = woCreated > 0 ? ` with ${woCreated} work order(s)` : '';
        showToast(`Job order created${woMsg}!`, 'success');
        closeModal(modals.newJob);
        document.getElementById('new-job-form').reset();
        document.getElementById('nj-work-orders-list').innerHTML = '';
        loadDashboard();
    } catch (err) {
        showToast(err.message || 'Failed to create job order.', 'error');
    }
}

// --- Detail View & Work Orders ---

async function openJobDetail(jobId) {
    try {
        // Only reset to the bare "Work Orders" tab when navigating to a
        // different job — refreshing the same job (after an edit, etc.)
        // should keep whichever tab the user was already on.
        const isNewJob = !currentJobOrder || currentJobOrder.id !== jobId;

        const res = await fetch(`${API_BASE}/job-orders/${jobId}`);
        currentJobOrder = await res.json();

        if (isNewJob) {
            jobDetailWOTab = 'brief';
            const jdWoTabs = document.getElementById('jd-wo-tabs');
            if (jdWoTabs) {
                jdWoTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'brief'));
            }
        }

        // Populate Header
        document.getElementById('jd-title').textContent = currentJobOrder.title;
        document.getElementById('jd-id').textContent = currentJobOrder.id;
        const breadcrumbTitle = document.getElementById('breadcrumb-job-title');
        if (breadcrumbTitle) breadcrumbTitle.textContent = currentJobOrder.title;
        
        const statusEl = document.getElementById('jd-status');
        statusEl.textContent = currentJobOrder.status;
        statusEl.className = `badge ${currentJobOrder.status === 'open' ? 'status-open' : 'status-closed'}`;

        // Meta Summary
        document.getElementById('jd-customer').textContent = currentJobOrder.customer_name;
        document.getElementById('jd-priority').innerHTML = getPriorityHTML(currentJobOrder.priority);
        document.getElementById('jd-assigned').textContent = getAssignedNamesHTML(currentJobOrder);
        document.getElementById('jd-date').textContent = formatDateDDMMYYYY(currentJobOrder.created_at);
        document.getElementById('jd-desc').textContent = currentJobOrder.description || '';
        const jdDescWrap = document.getElementById('jd-desc-wrap');
        if (jdDescWrap) jdDescWrap.classList.toggle('hidden-view', !currentJobOrder.description);
        
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

        // Update Toggle All (Pause All / Resume All) button state
        const btnToggleAll = document.getElementById('btn-toggle-all-wo');
        if (btnToggleAll) {
            const activeWOs = (currentJobOrder.work_orders || []).filter(wo => wo.status !== 'completed' && wo.status !== 'pending');
            if (activeWOs.length === 0) {
                btnToggleAll.style.display = 'none';
            } else {
                btnToggleAll.style.display = 'inline-flex';
                const hasRunning = activeWOs.some(wo => wo.status !== 'paused');
                if (hasRunning) {
                    btnToggleAll.innerHTML = '<i class="fa-solid fa-pause"></i> Pause All';
                    btnToggleAll.title = 'Pause all active work orders';
                } else {
                    btnToggleAll.innerHTML = '<i class="fa-solid fa-play"></i> Resume All';
                    btnToggleAll.title = 'Resume all paused work orders';
                }
            }
        }

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

        // Wire up Send Report button
        const btnSendReport = document.getElementById('btn-send-report');
        if (btnSendReport) {
            btnSendReport.onclick = () => handleSendReport(currentJobOrder.id);
        }

        switchView('jobOrderDetail');
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
        
        populateAssigneeList('ej-assigned-list', job.assigned_to_ids || []);

        openModal(modals.editJob);
    } catch (err) {
        showToast('Error loading job details for editing.', 'error');
    }
}

async function handleUpdateJob(e) {
    e.preventDefault();
    const jobId = document.getElementById('ej-id').value;
    
    const assignedToIds = Array.from(document.querySelectorAll('#ej-assigned-list input:checked'))
        .map(cb => cb.value);

    const payload = {
        title: document.getElementById('ej-title').value,
        customer_name: document.getElementById('ej-customer').value,
        priority: parseInt(document.getElementById('ej-priority').value),
        assigned_to_ids: assignedToIds,
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

function formatEstimate(totalMins) {
    if (!totalMins || totalMins <= 0) return '—';
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
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

// --- Helper: get YYYY-MM-DD in local time ---
function getLocalYYYYMMDD(date) {
    if (!date) return '';
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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
    if (!timeIn) return 0; // pending WO — not started yet
    const localPauseState = getPauseState();
    const woState = localPauseState[woId] || {};
    const localHistory = woState.history || [];
    
    // Determine which history is more reliable
    let history = [];
    const isOwner = currentUser && (woUserId === currentUser.id);

    if (isOwner && woStatus !== 'completed') {
        // For the owner of an in-progress WO, trust local history if it's more advanced (optimistic)
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
        // Completed WOs (and non-owners) are finalized — always trust server history,
        // never the local optimistic cache which may be stale (e.g. edited timestamps).
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

// --- Helper: calculate worked time for a specific day ---
function calcDailyWorkedTime(woId, timeIn, timeOut, serverHistory, woUserId, woStatus, dayStartMs, dayEndMs) {
    const localPauseState = getPauseState();
    const woState = localPauseState[woId] || {};
    const localHistory = woState.history || [];
    let history = [];
    const isOwner = currentUser && (woUserId === currentUser.id);

    if (isOwner && woStatus !== 'completed') {
        if (!serverHistory || serverHistory.length === 0) history = localHistory;
        else if (localHistory.length === 0) history = serverHistory;
        else {
            const lastServer = serverHistory[serverHistory.length - 1];
            const lastLocal = localHistory[localHistory.length - 1];
            if (serverHistory.length > localHistory.length || (serverHistory.length === localHistory.length && lastServer.at > lastLocal.at)) {
                history = serverHistory;
            } else {
                history = localHistory;
            }
        }
    } else {
        history = serverHistory || [];
    }

    const intervals = [];
    let currentStart = new Date(timeIn).getTime();
    let isCurrentlyRunning = true;

    for (const entry of history) {
        if (entry.type === 'pause') {
            if (isCurrentlyRunning) {
                intervals.push([currentStart, entry.at]);
                isCurrentlyRunning = false;
            }
        } else if (entry.type === 'resume') {
            currentStart = entry.at;
            isCurrentlyRunning = true;
        } else if (entry.type === 'end') {
            if (isCurrentlyRunning) {
                intervals.push([currentStart, entry.at]);
                isCurrentlyRunning = false;
            }
            break;
        }
    }

    if (isCurrentlyRunning) {
        const endTime = timeOut ? new Date(timeOut).getTime() : getServerNow();
        intervals.push([currentStart, endTime]);
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

    let html = '';
    
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

    // Fallback Finished event: some work orders were completed without an
    // 'end' history entry (e.g. bulk job completion before that was tracked).
    // Synthesize one from time_out so the timeline still shows it.
    const hasEndEvent = history.some(entry => entry.type === 'end');
    if (!hasEndEvent && timeOut) {
        html += `<div class="pipeline-event pipeline-end">
            <span class="pipeline-dot dot-end"></span>
            <span class="pipeline-label">Finished</span>
            <span class="pipeline-time">${fmtTime(new Date(timeOut).getTime())}</span>
            ${getEditBtn('end', -1, new Date(timeOut).getTime())}
        </div>`;
    }

    return `
        <div class="timeline-toggle-wrap">
            <button type="button" class="btn-timeline-toggle" data-wo-id="${woId}">
                <i class="fa-solid fa-chevron-right"></i> <span class="timeline-toggle-label">View Time History</span>
            </button>
            <div class="time-pipeline hidden" id="pipeline-${woId}">${html}</div>
        </div>
    `;
}

// Bare list: just description, ID, status, and worked time — no actions, no history.
let openWorkOrderDrawerId = null;

function buildWorkOrderDetailHTML(wo) {
    const isPending = wo.status === 'pending';
    const isCompleted = wo.status === 'completed';
    const isPaused = isWorkOrderPaused(wo);
    const isActive = !isCompleted && !isPaused && !isPending;

    let badgeClass = 'status-started';
    let badgeLabel = 'IN PROGRESS';
    if (isPending)   { badgeClass = 'status-paused'; badgeLabel = 'OPEN'; }
    if (isCompleted) { badgeClass = 'status-completed'; badgeLabel = 'COMPLETED'; }
    else if (isPaused) { badgeClass = 'status-paused'; badgeLabel = 'PAUSED'; }

    const woUserId = wo.user_id || (wo.user ? wo.user.id : null);
    const workedMs = isPending ? 0 : calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, woUserId, wo.status);
    const workedStr = isPending ? '—' : formatDuration(workedMs);
    const estimateStr = formatEstimate(wo.estimate_time);
    const canAct = currentUser && (woUserId === currentUser.id);

    const testedVal = TESTED_CFG_GLOBAL[wo.tested] ? wo.tested : 'not_tested';
    const { label: tLabel, color: tc } = TESTED_CFG_GLOBAL[testedVal];
    const testedSelectHTML = `
        <div class="wo-tested-wrap" id="tested-wrap-drawer-${wo.id}">
            <button type="button" class="wo-tested-btn" data-wo-id="${wo.id}"
                style="border:1px solid ${tc}66; background:${tc}18; color:${tc};">
                <span class="tested-dot" style="background:${tc};"></span>
                <span class="tested-lbl">${tLabel}</span>
                <i class="fa-solid fa-chevron-down tested-chevron"></i>
            </button>
        </div>`;

    const assignedName = wo.user ? wo.user.name : (isPending ? '<span style="color:#f59e0b;">Open</span>' : 'Unknown');
    const timelineHTML = isPending ? '' : buildTimelineHTML(wo.id, wo.time_in, wo.time_out, wo.pause_history);

    const startDate = wo.time_in ? new Date(wo.time_in) : null;
    const workDate = startDate ? formatDateDDMMYYYY(startDate) : '—';
    const timeIn = startDate ? startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—';
    const timeOut = wo.time_out
        ? new Date(wo.time_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        : (isPaused ? 'Paused' : (isPending ? '—' : 'Ongoing'));

    const safeDesc = (wo.description || '').replace(/'/g, "\\'");

    return `
        <div class="work-item ${isActive ? 'active-work' : ''}" style="border:none; background:transparent; padding-left:16px;">
            <div class="work-item-body" style="padding:0;">
                <div class="work-item-top">
                    <div class="work-info">
                        <span class="work-desc">${wo.description || 'No description'}</span>
                        <div class="work-meta">
                            <span>${wo.id}</span>
                            <button onclick="copyWorkOrderDetails('${wo.id}')" title="Copy ID" style="background:none;border:none;cursor:pointer;padding:0 2px;color:#6366f1;font-size:0.75rem;vertical-align:middle;opacity:0.7;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'"><i class="fa-regular fa-copy"></i></button>
                            ${workDate !== '—' ? `<span class="work-meta-sep">·</span><span>${workDate}</span>` : ''}
                            ${startDate ? `<span class="work-meta-sep">·</span><span>${timeIn} → ${timeOut}</span>` : ''}
                        </div>
                        <div class="work-chips">
                            <span class="work-hours"><i class="fa-regular fa-clock"></i> Worked: <strong>${workedStr}</strong></span>
                            <span style="display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); font-size:0.78rem; color:#888;">
                                <i class="fa-solid fa-hourglass-half" style="font-size:0.65rem; color:#6366f1;"></i> Est: ${estimateStr}
                            </span>
                            ${testedSelectHTML}
                        </div>
                    </div>
                </div>
            </div>
            <div class="work-item-footer" style="padding:1.25rem 0 0; border-top:1px solid var(--border-glass); margin-top:1.25rem;">
                <div class="work-item-footer-left">
                    <div class="worker-group">
                        <span class="work-user" title="${isPending ? 'Open — anyone can start' : 'Lead'}"><i class="fa-solid fa-user"></i> ${assignedName}</span>
                        ${(wo.tagged_user_ids || []).map(tId => {
                            const u = allUsers.find(user => user.id === tId);
                            if (!u) return '';
                            const initials = u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                            const userColor = u.color_code ? `style="background: ${u.color_code};"` : '';
                            return `<div class="worker-avatar" title="${u.name}" ${userColor}>${initials}</div>`;
                        }).join('')}
                    </div>
                    <span class="badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="work-item-footer-right" style="margin-top:1rem; flex-wrap:wrap;">
                    <button class="btn btn-icon btn-sm" onclick="openEditWorkModal('${wo.id}', '${safeDesc}')" title="Edit Description">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    ${isPending ? `<button class="btn btn-primary btn-sm" onclick="handleStartWorkOrder('${wo.id}')"><i class="fa-solid fa-play"></i> Start</button>` : ''}
                    ${!isCompleted && !isPending ? `<button class="btn btn-outline btn-sm" onclick="toggleWorkOrderPause('${wo.id}', '${wo.status}')" ${!canAct ? 'disabled title="Only the assigned user can pause/resume"' : ''}>${isPaused ? '<i class="fa-solid fa-play"></i> Resume' : '<i class="fa-solid fa-pause"></i> Pause'}</button>` : ''}
                    ${!isCompleted && !isPending ? `<button class="btn btn-success btn-sm" onclick="completeWorkOrder('${wo.id}')" ${!canAct ? 'disabled title="Only the assigned user can finish"' : ''}><i class="fa-solid fa-check"></i> Finish</button>` : ''}
                    ${currentUser && currentUser.role === 'Admin' ? `<button class="btn btn-icon btn-sm" onclick="deleteWorkOrder('${wo.id}')" title="Delete Work Order" style="color:#f87171;"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </div>
            ${timelineHTML}
        </div>
    `;
}

function openWorkOrderDrawer(woId, silent) {
    const wo = (window._lastRenderedWorkOrders || []).find(w => w.id === woId);
    if (!wo) { closeWorkOrderDrawer(); return; }

    openWorkOrderDrawerId = woId;
    const body = document.getElementById('wo-drawer-body');
    if (body) body.innerHTML = buildWorkOrderDetailHTML(wo);

    const testedBtn = body?.querySelector('.wo-tested-btn');
    if (testedBtn) {
        testedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllTestedDropdowns();
            const wrap = testedBtn.closest('.wo-tested-wrap');
            const panel = buildTestedPanel(wo.id, TESTED_CFG_GLOBAL[wo.tested] ? wo.tested : 'not_tested');
            wrap.appendChild(panel);
            testedBtn.classList.add('open');
        });
    }

    if (!silent) {
        document.getElementById('wo-drawer')?.classList.add('open');
        document.getElementById('wo-drawer-scrim')?.classList.add('open');
    }
}

function closeWorkOrderDrawer() {
    openWorkOrderDrawerId = null;
    document.getElementById('wo-drawer')?.classList.remove('open');
    document.getElementById('wo-drawer-scrim')?.classList.remove('open');
}

function renderWorkOrdersBrief(workOrders, list) {
    workOrders.forEach(wo => {
        const isPending = wo.status === 'pending';
        const isCompleted = wo.status === 'completed';
        const isPaused = isWorkOrderPaused(wo);
        const woUserId = wo.user_id || (wo.user ? wo.user.id : null);
        const canAct = currentUser && (woUserId === currentUser.id);

        let badgeClass = 'status-started';
        let badgeLabel = 'IN PROGRESS';
        if (isPending)   { badgeClass = 'status-paused'; badgeLabel = 'OPEN'; }
        if (isCompleted) { badgeClass = 'status-completed'; badgeLabel = 'COMPLETED'; }
        else if (isPaused) { badgeClass = 'status-paused'; badgeLabel = 'PAUSED'; }

        const workedStr = isPending ? '—' : formatDuration(calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, woUserId, wo.status));

        let statusActionHTML;
        if (isPending) {
            statusActionHTML = `<button class="btn btn-primary btn-sm" style="font-size:0.75rem; padding:0.25rem 0.65rem;" onclick="handleStartWorkOrder('${wo.id}')"><i class="fa-solid fa-play"></i> Start</button>`;
        } else if (isCompleted) {
            statusActionHTML = `<span class="badge ${badgeClass}">${badgeLabel}</span>`;
        } else {
            statusActionHTML = `<button class="btn btn-outline btn-sm" style="font-size:0.75rem; padding:0.25rem 0.65rem; border-color:${isPaused ? '#f59e0b55' : 'var(--border-glass)'}; color:${isPaused ? '#f59e0b' : 'var(--text-primary)'};" onclick="toggleWorkOrderPause('${wo.id}', '${wo.status}')" ${!canAct ? 'disabled title="Only assigned user can pause/resume"' : ''}>
                <i class="fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}"></i> ${isPaused ? 'Resume' : 'Pause'}
            </button>`;
        }

        const row = document.createElement('div');
        row.className = 'wo-brief-row';
        row.innerHTML = `
            <span class="wo-brief-id">${wo.id}</span>
            <span class="wo-brief-desc">${wo.description || 'No description'}</span>
            <div style="display:flex; align-items:center;">${statusActionHTML}</div>
            <span class="wo-brief-time">${workedStr}</span>
            <button type="button" class="wo-brief-expand" title="View details" aria-label="View work order details">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        `;
        row.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (btn && !btn.classList.contains('wo-brief-expand')) return;
            openWorkOrderDrawer(wo.id);
        });
        list.appendChild(row);
    });
}

function renderWorkOrders(workOrders) {
    window._lastRenderedWorkOrders = workOrders;
    const list = document.getElementById('work-orders-list');
    list.innerHTML = '';

    if(workOrders.length === 0) {
        list.innerHTML = '<p class="text-muted" style="margin-top:0.5rem;">No work orders yet.</p>';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-outline btn-sm';
        addBtn.style.cssText = 'margin-top:0.5rem; width:100%; justify-content:center; border-style:dashed; color:#6366f1; border-color:#6366f1; opacity:0.7;';
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Work Order';
        addBtn.addEventListener('click', () => {
            document.getElementById('new-work-form').classList.remove('hidden');
            document.getElementById('btn-new-work').classList.add('hidden');
            populateTaggingList();
            document.getElementById('nw-desc').focus();
        });
        list.appendChild(addBtn);
        return;
    }

    // Sort by created_at desc (newest first)
    workOrders.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

    if (jobDetailWOTab === 'brief') {
        renderWorkOrdersBrief(workOrders, list);
        return;
    }

    const localPauseState = getPauseState();

    workOrders.forEach(wo => {
        const isPending = wo.status === 'pending';
        const isCompleted = wo.status === 'completed';
        const isPaused = isWorkOrderPaused(wo);
        const isActive = !isCompleted && !isPaused && !isPending;

        const item = document.createElement('div');
        item.className = `work-item ${isActive ? 'active-work' : ''}`;

        let badgeClass = 'status-started';
        let badgeLabel = 'IN PROGRESS';
        if (isPending)   { badgeClass = 'status-paused'; badgeLabel = 'OPEN'; }
        if (isCompleted) { badgeClass = 'status-completed'; badgeLabel = 'COMPLETED'; }
        else if (isPaused) { badgeClass = 'status-paused'; badgeLabel = 'PAUSED'; }

        const woUserId = wo.user_id || (wo.user ? wo.user.id : null);
        const workedMs = isPending ? 0 : calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, woUserId, wo.status);
        const workedStr = isPending ? '—' : formatDuration(workedMs);
        const estimateStr = formatEstimate(wo.estimate_time);
        const canAct = currentUser && (woUserId === currentUser.id);

        const testedVal = TESTED_CFG_GLOBAL[wo.tested] ? wo.tested : 'not_tested';
        const { label: tLabel, color: tc } = TESTED_CFG_GLOBAL[testedVal];
        const testedSelectHTML = `
            <div class="wo-tested-wrap" id="tested-wrap-${wo.id}">
                <button type="button" class="wo-tested-btn" data-wo-id="${wo.id}"
                    style="border:1px solid ${tc}66; background:${tc}18; color:${tc};">
                    <span class="tested-dot" style="background:${tc};"></span>
                    <span class="tested-lbl">${tLabel}</span>
                    <i class="fa-solid fa-chevron-down tested-chevron"></i>
                </button>
            </div>`;

        const estHrs  = wo.estimate_time ? Math.floor(wo.estimate_time / 60) : '';
        const estMins = wo.estimate_time ? wo.estimate_time % 60 : '';
        const inlineEstHTML = `
            <span style="display:inline-flex; align-items:center; gap:4px; padding:3px 10px;
                         border-radius:20px; border:1px solid rgba(255,255,255,0.1);
                         background:rgba(255,255,255,0.04); font-size:0.78rem; color:#888;">
                <i class="fa-solid fa-hourglass-half" style="font-size:0.65rem; color:#6366f1;"></i>
                <span style="color:#666; font-size:0.72rem;">Est</span>
                <input type="number" min="0" placeholder="0" value="${estHrs}"
                    class="wo-est-input" data-wo-id="${wo.id}" data-field="est-hrs"
                    style="width:34px; padding:2px 5px; border-radius:6px;
                           border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.06);
                           color:inherit; font-size:0.78rem; text-align:center; outline:none;">
                <span style="color:#555; font-size:0.7rem;">hr</span>
                <input type="number" min="0" max="59" placeholder="0" value="${estMins}"
                    class="wo-est-input" data-wo-id="${wo.id}" data-field="est-mins"
                    style="width:34px; padding:2px 5px; border-radius:6px;
                           border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.06);
                           color:inherit; font-size:0.78rem; text-align:center; outline:none;">
                <span style="color:#555; font-size:0.7rem;">min</span>
            </span>`;

        const assignedName = wo.user ? wo.user.name : (isPending ? '<span style="color:#f59e0b;">Open</span>' : 'Unknown');

        const timelineHTML = isPending ? '' : buildTimelineHTML(wo.id, wo.time_in, wo.time_out, wo.pause_history);

        const startDate = wo.time_in ? new Date(wo.time_in) : null;
        const workDate = startDate ? formatDateDDMMYYYY(startDate) : '—';
        const timeIn = startDate ? startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—';
        const timeOut = wo.time_out
            ? new Date(wo.time_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            : (isPaused ? 'Paused' : (isPending ? '—' : 'Ongoing'));

        const safeDesc = (wo.description || '').replace(/'/g, "\\'");

        item.innerHTML = `
            <div class="work-item-body">
                <div class="work-item-top">
                    <div class="work-info">
                        <span class="work-desc">${wo.description || 'No description'}</span>
                        <div class="work-meta">
                            <span>${wo.id}</span>
                            <button onclick="copyWorkOrderDetails('${wo.id}')" title="Copy ID" style="background:none;border:none;cursor:pointer;padding:0 2px;color:#6366f1;font-size:0.75rem;vertical-align:middle;opacity:0.7;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'"><i class="fa-regular fa-copy"></i></button>
                            ${workDate !== '—' ? `<span class="work-meta-sep">·</span><span>${workDate}</span>` : ''}
                            ${startDate ? `<span class="work-meta-sep">·</span><span>${timeIn} → ${timeOut}</span>` : ''}
                        </div>
                        <div class="work-chips">
                            <span class="work-hours"><i class="fa-regular fa-clock"></i> Worked: <strong>${workedStr}</strong></span>
                            ${inlineEstHTML}
                            ${testedSelectHTML}
                        </div>
                    </div>
                </div>
            </div>
            <div class="work-item-footer">
                <div class="work-item-footer-left">
                    <div class="worker-group">
                        <span class="work-user" title="${isPending ? 'Open — anyone can start' : 'Lead'}"><i class="fa-solid fa-user"></i> ${assignedName}</span>
                        ${(wo.tagged_user_ids || []).map(tId => {
                            const u = allUsers.find(user => user.id === tId);
                            if (!u) return '';
                            const initials = u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                            const userColor = u.color_code ? `style="background: ${u.color_code};"` : '';
                            return `<div class="worker-avatar" title="${u.name}" ${userColor}>${initials}</div>`;
                        }).join('')}
                    </div>
                    <span class="badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="work-item-footer-right">
                    <button class="btn btn-icon btn-sm" onclick="openEditWorkModal('${wo.id}', '${safeDesc}')" title="Edit Description">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    ${isPending ? `<button class="btn btn-primary btn-sm" onclick="handleStartWorkOrder('${wo.id}')"><i class="fa-solid fa-play"></i> Start</button>` : ''}
                    ${!isCompleted && !isPending ? `<button class="btn btn-outline btn-sm" onclick="toggleWorkOrderPause('${wo.id}', '${wo.status}')" ${!canAct ? 'disabled title="Only the assigned user can pause/resume"' : ''}>${isPaused ? '<i class="fa-solid fa-play"></i> Resume' : '<i class="fa-solid fa-pause"></i> Pause'}</button>` : ''}
                    ${!isCompleted && !isPending ? `<button class="btn btn-success btn-sm" onclick="completeWorkOrder('${wo.id}')" ${!canAct ? 'disabled title="Only the assigned user can finish"' : ''}><i class="fa-solid fa-check"></i> Finish</button>` : ''}
                    ${currentUser && currentUser.role === 'Admin' ? `<button class="btn btn-icon btn-sm" onclick="deleteWorkOrder('${wo.id}')" title="Delete Work Order" style="color:#f87171;"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </div>
            ${timelineHTML}
        `;
        list.appendChild(item);

        // --- Post-render: bind estimate inputs ---
        item.querySelectorAll('.wo-est-input').forEach(inp => {
            inp.addEventListener('blur', () => saveWOEstimate(wo.id, inp));
            inp.addEventListener('focus', () => inp.style.borderColor = '#6366f1');
            inp.addEventListener('blur', () => inp.style.borderColor = 'rgba(255,255,255,0.1)');
        });

        // --- Post-render: bind tested custom dropdown ---
        const testedBtn = item.querySelector('.wo-tested-btn');
        if (testedBtn) {
            testedBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllTestedDropdowns();
                const wrap = testedBtn.closest('.wo-tested-wrap');
                const panel = buildTestedPanel(wo.id, testedVal);
                wrap.appendChild(panel);
                testedBtn.classList.add('open');
            });
        }
    });

    // Admin: inline "Add Work Order" shortcut at the bottom of the list
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-outline btn-sm';
    addBtn.style.cssText = 'margin-top:0.75rem; width:100%; justify-content:center; border-style:dashed; color:#6366f1; border-color:#6366f1; opacity:0.7;';
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Work Order';
    addBtn.addEventListener('click', () => {
        document.getElementById('new-work-form').classList.remove('hidden');
        document.getElementById('btn-new-work').classList.add('hidden');
        populateTaggingList();
        document.getElementById('nw-desc').focus();
        document.getElementById('new-work-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    list.appendChild(addBtn);

    // Keep the detail drawer's content in sync if it's open across re-renders
    if (openWorkOrderDrawerId) {
        const stillExists = workOrders.some(w => w.id === openWorkOrderDrawerId);
        if (stillExists) {
            openWorkOrderDrawer(openWorkOrderDrawerId, true);
        } else {
            closeWorkOrderDrawer();
        }
    }
}

const TESTED_CFG_GLOBAL = {
    not_tested: { label: 'Not Tested', color: '#94a3b8' },
    testing:    { label: 'Testing',    color: '#f59e0b' },
    pass:       { label: 'Pass',       color: '#22c55e' },
    needs_fix:  { label: 'Needs Fix',  color: '#ef4444' }
};

function closeAllTestedDropdowns() {
    document.querySelectorAll('.wo-tested-panel').forEach(p => p.remove());
    document.querySelectorAll('.wo-tested-btn.open').forEach(b => b.classList.remove('open'));
}

function buildTestedPanel(woId, currentVal) {
    const panel = document.createElement('div');
    panel.className = 'wo-tested-panel';
    Object.entries(TESTED_CFG_GLOBAL).forEach(([val, { label, color }]) => {
        const opt = document.createElement('div');
        opt.className = 'wo-tested-option';
        opt.innerHTML = `<span class="opt-dot" style="background:${color};"></span><span style="color:#ddd;">${label}</span>`;
        if (val === currentVal) opt.style.background = 'rgba(255,255,255,0.07)';
        opt.addEventListener('click', async (e) => {
            e.stopPropagation();
            closeAllTestedDropdowns();
            await saveWOField(woId, 'tested', val);
            // Update button appearance immediately (optimistic)
            const btn = document.querySelector(`.wo-tested-btn[data-wo-id="${woId}"]`);
            if (btn) {
                btn.style.borderColor = color + '66';
                btn.style.background  = color + '18';
                btn.style.color       = color;
                btn.querySelector('.tested-dot').style.background = color;
                btn.querySelector('.tested-lbl').textContent = label;
                btn.dataset.tested = val;
            }
        });
        panel.appendChild(opt);
    });
    return panel;
}

// Close dropdowns when clicking outside
document.addEventListener('click', () => closeAllTestedDropdowns());

async function handleCreateWorkOrder(e) {
    e.preventDefault();
    if(!currentJobOrder) return;

    const desc = document.getElementById('nw-desc').value;
    const nwHrs = parseInt(document.getElementById('nw-est-hrs').value) || 0;
    const nwMins = parseInt(document.getElementById('nw-est-mins').value) || 0;
    const estimateTime = (nwHrs * 60 + nwMins) || null;

    // Collect tagged users
    const taggedIds = Array.from(document.querySelectorAll('#nw-tag-list input:checked'))
        .map(cb => cb.value);

    try {
        const res = await fetch(`${API_BASE}/work-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: desc,
                ref_id_jo: currentJobOrder.id,
                tagged_user_ids: taggedIds,
                estimate_time: estimateTime
                // No user_id — creates as pending/open for any user to start
            })
        });

        if(res.ok) {
            showToast('Work order created. Users can now start it from My Work.', 'success');
            document.getElementById('nw-desc').value = '';
            document.getElementById('nw-est-hrs').value = '';
            document.getElementById('nw-est-mins').value = '';
            openJobDetail(currentJobOrder.id);
            loadDashboard();
        } else {
            throw new Error('Failed');
        }
    } catch {
        showToast('Failed to create work order.', 'error');
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
            const activeMyWork = document.getElementById('my-work-view') && !document.getElementById('my-work-view').classList.contains('hidden-view');
            if (activeMyWork) loadMyWorkDashboard(document.querySelector('#mywork-tabs .tab-btn.active')?.dataset.tab || 'all');
            else loadDashboard();
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
            if (currentJobOrder) openJobDetail(currentJobOrder.id);
            loadDashboard();
            if (!document.getElementById('my-work-view').classList.contains('hidden-view')) {
                loadMyWorkDashboard(document.querySelector('#mywork-tabs .tab-btn.active')?.dataset.tab || 'all');
            }
        } else {
            throw new Error('Failed');
        }
    } catch {
        showToast('Failed to complete work.', 'error');
    }
}

window.deleteWorkOrder = async function(woId) {
    if (!currentUser || currentUser.role !== 'Admin') return;
    if (!confirm('Delete this work order? This cannot be undone.')) return;

    try {
        const res = await fetch(`${API_BASE}/work-orders/${woId}`, { method: 'DELETE' });
        if (res.ok) {
            // Purge cached local pause state so a future reused ID doesn't inherit this WO's history
            const pauseState = getPauseState();
            delete pauseState[woId];
            savePauseState(pauseState);

            showToast('Work order deleted.', 'success');
            if (currentJobOrder) openJobDetail(currentJobOrder.id);
            loadDashboard();
        } else {
            throw new Error('Failed');
        }
    } catch {
        showToast('Failed to delete work order.', 'error');
    }
};

window.copyWorkOrderDetails = function(woId) {
    navigator.clipboard.writeText(woId)
        .then(() => showToast('Work order ID copied!', 'success'))
        .catch(() => showToast('Failed to copy.', 'error'));
};

window.toggleWorkOrderPause = async function(workOrderId, currentStatus) {
    const pauseState = getPauseState();
    const woState = pauseState[workOrderId] || { accumulatedTime: 0, isPaused: false, lastResumedAt: null, history: [] };
    if (!woState.history) woState.history = [];

    // Reconcile against the server's current history before appending a new
    // event — the local cache may be stale or was cleared by a timeline edit,
    // and blindly trusting it here would silently overwrite saved edits.
    let serverStatus = currentStatus;
    try {
        const freshRes = await fetch(`${API_BASE}/work-orders/${workOrderId}`);
        if (freshRes.ok) {
            const freshWo = await freshRes.json();
            woState.history = mergeHistory(woState.history, freshWo.pause_history);
            serverStatus = freshWo.status;
        }
    } catch (err) {
        console.error('Failed to fetch fresh work order before pause/resume:', err);
    }

    const now = getServerNow();

    // Trust the server's status over the local cache's isPaused flag
    const isCurrentlyPaused = serverStatus === 'paused';

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
    if (!document.getElementById('my-work-view').classList.contains('hidden-view')) {
        loadMyWorkDashboard(document.querySelector('#mywork-tabs .tab-btn.active')?.dataset.tab || 'all');
    }
}

window.handleToggleAllJobWorkOrders = async function() {
    if (!currentJobOrder || !currentJobOrder.work_orders || currentJobOrder.work_orders.length === 0) {
        showToast('No work orders found for this job.', 'warning');
        return;
    }

    const activeWOs = currentJobOrder.work_orders.filter(wo => wo.status !== 'completed' && wo.status !== 'pending');
    if (activeWOs.length === 0) {
        showToast('No active work orders to pause or resume.', 'info');
        return;
    }

    const hasRunning = activeWOs.some(wo => wo.status !== 'paused');
    const targetStatus = hasRunning ? 'paused' : 'started';
    const actionLabel = hasRunning ? 'paused' : 'resumed';

    showToast(`${hasRunning ? 'Pausing' : 'Resuming'} all work orders...`, 'info');

    try {
        await Promise.all(activeWOs.map(async (wo) => {
            const pauseState = getPauseState();
            const woState = pauseState[wo.id] || { accumulatedTime: 0, isPaused: false, lastResumedAt: null, history: [] };
            if (!woState.history) woState.history = [];

            try {
                const freshRes = await fetch(`${API_BASE}/work-orders/${wo.id}`);
                if (freshRes.ok) {
                    const freshWo = await freshRes.json();
                    woState.history = mergeHistory(woState.history, freshWo.pause_history);
                }
            } catch (err) {
                console.error(`Failed to fetch fresh history for ${wo.id}:`, err);
            }

            const now = getServerNow();
            if (targetStatus === 'paused' && wo.status !== 'paused') {
                woState.isPaused = true;
                if (woState.lastResumedAt) {
                    woState.accumulatedTime += (now - woState.lastResumedAt);
                }
                woState.lastResumedAt = null;
                woState.history.push({ type: 'pause', at: now });
            } else if (targetStatus === 'started' && wo.status === 'paused') {
                woState.isPaused = false;
                woState.lastResumedAt = now;
                woState.history.push({ type: 'resume', at: now });
            }

            pauseState[wo.id] = woState;
            savePauseState(pauseState);

            return fetch(`${API_BASE}/work-orders/${wo.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: targetStatus,
                    pause_history: woState.history
                })
            });
        }));

        showToast(`All active work orders ${actionLabel}!`, 'success');
        if (currentJobOrder && currentJobOrder.id) {
            await openJobDetail(currentJobOrder.id);
        }
        if (typeof loadDashboard === 'function') await loadDashboard();
    } catch (err) {
        console.error('Error toggling all work orders:', err);
        showToast('Failed to update all work orders.', 'error');
    }
};

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
        } else if (type === 'end') {
            // Synthesized Finished event (no matching pause_history entry) — edit time_out directly
            payload.time_out = new Date(newTimestamp).toISOString();
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
            // Drop the locally cached pause state for this WO so stale local
            // history can't outrank the timestamp we just corrected on the server
            const pauseState = getPauseState();
            delete pauseState[woId];
            savePauseState(pauseState);

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
    if (!currentJobOrder) return;

    const workOrders = currentJobOrder.work_orders || [];

    // Populate Step 1 modal WO list
    const woList = document.getElementById('cjm-wo-list');
    if (workOrders.length === 0) {
        woList.innerHTML = '<p style="color:#888; font-size:0.85rem;">No work orders in this job.</p>';
    } else {
        woList.innerHTML = workOrders.map(wo => `
            <div style="display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0.75rem; background:rgba(255,255,255,0.04); border-radius:8px; border:1px solid rgba(255,255,255,0.07);">
                <i class="fa-solid fa-circle-check" style="color:#22c55e; font-size:0.85rem;"></i>
                <span style="font-size:0.82rem; color:#aaa; font-family:monospace;">${wo.id}</span>
                <span style="font-size:0.85rem; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${wo.description || 'No description'}</span>
                <span style="font-size:0.75rem; color:#22c55e; font-weight:600;">→ Pass</span>
            </div>
        `).join('');
    }

    document.getElementById('complete-job-modal').classList.remove('hidden');

    // Confirm button handler
    const confirmBtn = document.getElementById('cjm-confirm-btn');
    confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

        try {
            const jobId = currentJobOrder.id;
            const now = Date.now();
            const nowIso = new Date(now).toISOString();

            // 1. Mark all work orders as completed + tested: pass
            for (const wo of workOrders) {
                if (wo.status === 'completed') continue;

                // Record an 'end' event so the timeline shows a Finished entry
                const history = (wo.pause_history || []).slice();
                history.push({ type: 'end', at: now });

                const pauseState = getPauseState();
                delete pauseState[wo.id];
                savePauseState(pauseState);

                const r = await fetch(`${API_BASE}/work-orders/${wo.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'completed', tested: 'pass', time_out: nowIso, pause_history: history })
                });
                if (!r.ok) {
                    const e = await r.json().catch(() => ({}));
                    throw new Error(e.error || `Failed to update ${wo.id}`);
                }
            }

            // 2. Close the job
            const closeRes = await fetch(`${API_BASE}/job-orders/${jobId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'closed' })
            });
            if (!closeRes.ok) throw new Error('Failed to close job');

            document.getElementById('complete-job-modal').classList.add('hidden');
            showToast('Job marked as complete! All work orders set to Pass.', 'success');

            // 3. Re-fetch job with updated data for email step
            const jobRes = await fetch(`${API_BASE}/job-orders/${jobId}`);
            const updatedJob = await jobRes.json();

            await showCompleteEmailStep(updatedJob);
            loadDashboard();

        } catch(err) {
            showToast(err.message || 'Error completing job order.', 'error');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm & Complete';
        }
    };
}

async function showCompleteEmailStep(jobOrder) {
    // Build full recipient list (mirrors backend sendProgressReport logic)
    const recipientSet = new Set();
    const recipientRows = [];

    function addRecipient(email, label, type) {
        if (!email || !email.includes('@') || recipientSet.has(email)) return;
        recipientSet.add(email);
        recipientRows.push({ email, label, type });
    }

    // 1. Requester
    if (currentUser?.username) addRecipient(currentUser.username, currentUser.name + ' (You)', 'requester');

    // 2. All workers on each work order
    const workOrders = jobOrder.work_orders || [];
    workOrders.forEach(wo => {
        if (wo.user_id) {
            const u = allUsers.find(u => u.id === wo.user_id);
            if (u?.username) addRecipient(u.username, u.name + ' (Lead)', 'worker');
        }
        (wo.tagged_user_ids || []).forEach(tId => {
            const u = allUsers.find(u => u.id === tId);
            if (u?.username) addRecipient(u.username, u.name + ' (Tagged)', 'worker');
        });
    });

    // 3. Client emails
    try {
        const res = await fetch(`${API_BASE}/customers`);
        const customers = await res.json();
        const customer = customers.find(c => c.name === jobOrder.customer_name);
        (customer?.emails || []).forEach(e => {
            if (e?.trim()) addRecipient(e.trim(), 'Client', 'client');
        });
    } catch { /* no client emails */ }

    const colorMap = { requester: '#6366f1', worker: '#22c55e', client: '#f59e0b' };
    const iconMap  = { requester: 'fa-user-shield', worker: 'fa-user', client: 'fa-building' };

    const emailList = document.getElementById('cjm-email-list');
    if (recipientRows.length === 0) {
        emailList.innerHTML = '<p style="color:#f87171; font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> No email addresses found.</p>';
    } else {
        emailList.innerHTML = recipientRows.map(r => `
            <div style="display:flex; align-items:center; gap:0.6rem; padding:0.45rem 0.75rem; background:rgba(255,255,255,0.04); border-radius:8px; border:1px solid rgba(255,255,255,0.07);">
                <i class="fa-solid ${iconMap[r.type]}" style="color:${colorMap[r.type]}; font-size:0.78rem; width:14px; text-align:center;"></i>
                <span style="font-size:0.82rem; color:#aaa; flex:1;">${r.label}</span>
                <span style="font-size:0.78rem; color:#666; font-family:monospace;">${r.email}</span>
            </div>
        `).join('');
    }

    const emailModal = document.getElementById('complete-job-email-modal');
    emailModal.classList.remove('hidden');

    const skipBtn = document.getElementById('cjm-skip-btn');
    const sendBtn = document.getElementById('cjm-send-btn');

    skipBtn.onclick = () => {
        emailModal.classList.add('hidden');
        goToJobOrders();
    };

    sendBtn.onclick = async () => {
        if (recipientRows.length === 0) { emailModal.classList.add('hidden'); goToJobOrders(); return; }
        sendBtn.disabled = true;
        sendBtn.classList.add('btn-loading');
        sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
        try {
            const res = await fetch(`${API_BASE}/job-orders/${jobOrder.id}/send-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requester_id: currentUser.id })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`Sign-off report sent to ${data.recipientCount} recipient(s).`, 'success');
            } else {
                showToast(data.error || 'Failed to send report.', 'error');
            }
        } catch {
            showToast('Failed to send report.', 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.classList.remove('btn-loading');
            sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Report';
            emailModal.classList.add('hidden');
            goToJobOrders();
        }
    };
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

// Picks whichever history is more complete: longer array wins, and on a tie
// the one with the more recent last event wins. Used before appending a new
// pause/resume event so a stale or cleared local cache never overwrites
// timeline edits that were saved on the server.
function mergeHistory(localHistory, serverHistory) {
    localHistory = localHistory || [];
    serverHistory = serverHistory || [];
    let best = localHistory;
    if (serverHistory.length > 0) {
        if (serverHistory.length > localHistory.length) {
            best = serverHistory;
        } else if (serverHistory.length === localHistory.length && localHistory.length > 0) {
            const lastServer = serverHistory[serverHistory.length - 1];
            const lastLocal = localHistory[localHistory.length - 1];
            if (lastServer.at > lastLocal.at) best = serverHistory;
        }
    }
    return best;
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
    
    const jobSpan = document.getElementById('stopwatch-job');
    const woSpan = document.getElementById('stopwatch-wo');
    const descSpan = document.getElementById('stopwatch-desc');
    const timeSpan = document.getElementById('stopwatch-time');
    const btnPause = document.getElementById('btn-pause-stopwatch');

    document.getElementById('btn-stopwatch-icon')?.classList.remove('hidden');
    jobSpan.textContent = jobId;
    if (woSpan) woSpan.textContent = `WO-${woId}`;
    if (descSpan) descSpan.textContent = woDesc;
    
    const serverStartTime = new Date(timeInDateString).getTime();
    const pauseState = getPauseState();
    let woState = pauseState[woId] || { accumulatedTime: 0, isPaused: false, lastResumedAt: null, history: [] };
    
    // Smart merge history: prioritized by length and last event timestamp
    const bestHistory = mergeHistory(woState.history, serverHistory);
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

    // Reconcile against the server's current history before appending a new
    // event — the local cache may be stale or was cleared by a timeline edit,
    // and blindly trusting it here would silently overwrite saved edits.
    try {
        const freshRes = await fetch(`${API_BASE}/work-orders/${currentActiveWorkOrderId}`);
        if (freshRes.ok) {
            const freshWo = await freshRes.json();
            woState.history = mergeHistory(woState.history, freshWo.pause_history);
            woState.isPaused = freshWo.status === 'paused';
        }
    } catch (err) {
        console.error('Failed to fetch fresh work order before pause/resume:', err);
    }

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
    document.getElementById('btn-stopwatch-icon')?.classList.add('hidden');
    closeStopwatchPopover();
}

function openStopwatchPopover(anchorEl) {
    const popover = document.getElementById('active-work-stopwatch');
    if (!popover || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    // Right-align to the icon (which sits near the viewport's right edge) so
    // the pill grows leftward instead of overflowing off-screen.
    popover.style.top = `${rect.bottom + 10}px`;
    popover.style.left = 'auto';
    popover.style.right = `${Math.max(16, window.innerWidth - rect.right)}px`;
    popover.classList.add('open');
}

function closeStopwatchPopover() {
    document.getElementById('active-work-stopwatch')?.classList.remove('open');
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

function truncateText(text, limit = 15) {
    if (!text) return '';
    if (text.length <= limit) return text;
    return text.substring(0, limit) + '...';
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
        
        // Apply Status Filter (Pending / In Progress / Completed)
        const statusFilter = document.getElementById('admin-status-filter')?.value || 'all';
        if (statusFilter === 'pending') {
            workOrders = workOrders.filter(wo => wo.status === 'pending');
        } else if (statusFilter === 'ongoing') {
            workOrders = workOrders.filter(wo => wo.status === 'started' || wo.status === 'paused');
        } else if (statusFilter === 'completed') {
            workOrders = workOrders.filter(wo => wo.status === 'completed');
        }

        
        // Apply Date Filter if set
        const dateFilter = document.getElementById('admin-date-filter').value;
        if (dateFilter) {
            workOrders = workOrders.filter(wo => getLocalYYYYMMDD(wo.time_in) === dateFilter);
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
            document.getElementById('admin-customers-section').classList.add('hidden');
            renderAdminJobSummaries(workOrders);
            return;
        } else if (filter === 'customers') {
            document.getElementById('admin-work-orders-list').classList.add('hidden');
            document.getElementById('admin-job-summaries-list').classList.add('hidden');
            document.getElementById('admin-customers-section').classList.remove('hidden');
            renderCustomers();
            return;
        } else {
            document.getElementById('admin-work-orders-list').classList.remove('hidden');
            document.getElementById('admin-job-summaries-list').classList.add('hidden');
            document.getElementById('admin-customers-section').classList.add('hidden');
        }
        
        statCount.textContent = `${workOrders.length} ${workOrders.length === 1 ? 'Work Order' : 'Work Orders'}`;
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
            const shortTitle = truncateText(job.title, 15);
            opt.textContent = `${job.id} - ${shortTitle}`;
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
            ? `<span class="badge" style="background:rgba(99, 102, 241,0.15);color:#a5b4fc;border:1px solid rgba(99, 102, 241,0.3);font-size:0.6rem;"><i class="fa-solid fa-tags"></i> +${taggedIds.length}</span>` 
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

// --- Customer Management Functions ---

function populateCustomerSelects() {
    const njSelect = document.getElementById('nj-customer');
    const ejSelect = document.getElementById('ej-customer');
    
    [njSelect, ejSelect].forEach(select => {
        if (!select) return;
        
        // Preserve first "Select a customer..." option if it exists
        const firstOpt = select.options[0]?.value === "" ? select.options[0] : null;
        select.innerHTML = '';
        if (firstOpt) select.appendChild(firstOpt);
        
        allCustomers.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.textContent = c.name;
            select.appendChild(opt);
        });
    });
}

function renderCustomers() {
    const container = document.getElementById('admin-customers-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (allCustomers.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-4">No clients added yet.</p>';
        return;
    }
    
    allCustomers.forEach(c => {
        const row = document.createElement('div');
        row.className = 'admin-list-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.flexWrap = 'wrap';

        const emailsHTML = Array.isArray(c.emails) && c.emails.length > 0
            ? c.emails.map(e => `<span style="font-size:0.75rem; padding: 2px 8px; background: rgba(99, 102, 241,0.12); color: #a5b4fc; border-radius: 4px; border: 1px solid rgba(99, 102, 241,0.2);">${e}</span>`).join(' ')
            : `<span style="font-size:0.75rem; color:#555;">No emails</span>`;

        row.innerHTML = `
            <div style="flex: 2; font-weight: 500;">${c.name}
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">${emailsHTML}</div>
            </div>
            <div style="flex: 1; font-size: 0.85rem; color: #999;">${formatDateDDMMYYYY(c.created_at)}</div>
            <div style="width: 120px; display:flex; gap:0.4rem;">
                <button class="btn btn-outline btn-sm" onclick="openEditCustomerModal('${c.id}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-outline btn-sm text-error" onclick="deleteCustomer('${c.id}', '${c.name}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(row);
    });
}

async function handleAddCustomer(e) {
    e.preventDefault();
    const nameInput = document.getElementById('new-customer-name');
    const name = nameInput.value.trim();
    if (!name) return;

    // Collect all email inputs
    const emails = Array.from(document.querySelectorAll('#customer-email-list .customer-email-input'))
        .map(inp => inp.value.trim())
        .filter(v => v && v.includes('@'));

    try {
        const res = await fetch(`${API_BASE}/customers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, emails })
        });

        if (res.ok) {
            showToast(`Client "${name}" added successfully.`, 'success');
            nameInput.value = '';
            // Reset email list to one empty row
            const emailList = document.getElementById('customer-email-list');
            emailList.innerHTML = `
                <div class="customer-email-row row-left" style="gap: 0.5rem;">
                    <input type="email" class="customer-email-input" placeholder="client@example.com" style="flex: 1; padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: inherit; font-size: 0.9rem;">
                    <button type="button" class="btn btn-outline btn-sm btn-add-email" title="Add another email"><i class="fa-solid fa-plus"></i></button>
                </div>`;
            await loadCustomers();
            renderCustomers();
        } else {
            const err = await res.json();
            throw new Error(err.error || 'Failed to add customer');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

window.deleteCustomer = async function(id, name) {
    if (!confirm(`Are you sure you want to delete customer "${name}"?`)) return;
    
    try {
        const res = await fetch(`${API_BASE}/customers/${id}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            showToast(`Client "${name}" deleted.`, 'success');
            await loadCustomers();
            renderCustomers();
        } else {
            throw new Error('Failed to delete customer');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

window.openEditCustomerModal = function(id) {
    const c = allCustomers.find(x => x.id == id);
    if (!c) return;

    document.getElementById('ec-id').value = c.id;
    document.getElementById('ec-name').value = c.name;

    // Populate email rows
    const emailList = document.getElementById('ec-email-list');
    emailList.innerHTML = '';
    const emails = Array.isArray(c.emails) && c.emails.length > 0 ? c.emails : [''];
    emails.forEach(email => {
        const row = document.createElement('div');
        row.className = 'customer-email-row row-left';
        row.style.cssText = 'gap:0.5rem;';
        row.innerHTML = `
            <input type="email" class="ec-email-input" value="${email}" placeholder="client@example.com"
                style="flex:1; padding:0.5rem 0.75rem; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:inherit; font-size:0.9rem;">
            <button type="button" class="btn btn-outline btn-sm btn-ec-remove-email" title="Remove"><i class="fa-solid fa-minus"></i></button>`;
        emailList.appendChild(row);
    });

    openModal(document.getElementById('edit-customer-modal'));
};

document.getElementById('btn-ec-add-email')?.addEventListener('click', () => {
    const emailList = document.getElementById('ec-email-list');
    const row = document.createElement('div');
    row.className = 'customer-email-row row-left';
    row.style.cssText = 'gap:0.5rem;';
    row.innerHTML = `
        <input type="email" class="ec-email-input" placeholder="client@example.com"
            style="flex:1; padding:0.5rem 0.75rem; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:inherit; font-size:0.9rem;">
        <button type="button" class="btn btn-outline btn-sm btn-ec-remove-email" title="Remove"><i class="fa-solid fa-minus"></i></button>`;
    emailList.appendChild(row);
});

document.getElementById('ec-email-list')?.addEventListener('click', e => {
    if (e.target.closest('.btn-ec-remove-email')) {
        e.target.closest('.customer-email-row').remove();
    }
});

document.getElementById('edit-customer-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('ec-id').value;
    const name = document.getElementById('ec-name').value.trim();
    const emails = Array.from(document.querySelectorAll('#ec-email-list .ec-email-input'))
        .map(i => i.value.trim()).filter(v => v);

    try {
        const res = await fetch(`${API_BASE}/customers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, emails })
        });
        if (!res.ok) throw new Error('Failed');
        showToast('Client updated.', 'success');
        closeModal(document.getElementById('edit-customer-modal'));
        await loadCustomers();
        renderCustomers();
    } catch {
        showToast('Failed to update client.', 'error');
    }
});

// --- Job Order Analytics ---

function renderAdminJobSummaries(workOrders) {
    const container = document.getElementById('admin-job-summaries-list');
    const statCount = document.getElementById('admin-stat-count');
    container.innerHTML = '';
    
    if (workOrders.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-4">No data available for job summaries.</p>';
        statCount.textContent = '0 Job Orders';
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
    statCount.textContent = `${jobs.length} ${jobs.length === 1 ? 'Job Order' : 'Job Orders'}`;

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
            
            const leadName = wo.assigned_to_user ? wo.assigned_to_user.name : (wo.user ? wo.user.name : 'Unknown');
            if (!userTotals[leadName]) userTotals[leadName] = 0;
            userTotals[leadName] += workedMs;

            // Get tagged names for the admin view
            const taggedIds = Array.isArray(wo.tagged_user_ids) ? wo.tagged_user_ids : [];
            const taggedNames = taggedIds.map(id => {
                const u = allUsers.find(user => user.id === id);
                return u ? u.name : null;
            }).filter(Boolean);

            const taggedHTML = taggedNames.length > 0 
                ? `<br><small style="color: #6366f1; font-weight: normal;">+ ${taggedNames.join(', ')}</small>` 
                : '';
            
            return `
                <tr>
                    <td>${wo.id}</td>
                    <td><strong>${leadName}</strong>${taggedHTML}</td>
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
        
        // Define day boundaries
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayStartMs = today.getTime();
        const dayEndMs = dayStartMs + 86400000;

        // Filter for current user and work active today
        const myTodayWO = allWO.filter(wo => {
            const isMe = wo.user_id === currentUser.id;
            const isTagged = Array.isArray(wo.tagged_user_ids) && wo.tagged_user_ids.includes(currentUser.id);
            if (!(isMe || isTagged)) return false;

            const timeIn = new Date(wo.time_in).getTime();
            const timeOut = wo.time_out ? new Date(wo.time_out).getTime() : null;

            // Include if started before tomorrow AND (not finished OR finished today/later)
            return timeIn < dayEndMs && (!timeOut || timeOut >= dayStartMs);
        });

        if (myTodayWO.length === 0) {
            showToast('No work logs found for today.', 'warning');
            return;
        }

        let totalMs = 0;
        const tableRows = myTodayWO.map(wo => {
            const workedMs = calcDailyWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status, dayStartMs, dayEndMs);
            if (workedMs <= 0) return null;
            
            totalMs += workedMs;
            
            const leadName = wo.user?.name || 'Unknown';
            const taggedIds = Array.isArray(wo.tagged_user_ids) ? wo.tagged_user_ids : [];
            const taggedNames = taggedIds.map(id => {
                const u = allUsers.find(user => user.id === id);
                return u ? u.name : null;
            }).filter(Boolean);

            const isTagged = Array.isArray(wo.tagged_user_ids) && wo.tagged_user_ids.includes(currentUser.id);
            let participantLabel = '';
            if (isTagged) {
                participantLabel = `<br><small style="color: var(--accent-primary); background: rgba(99, 102, 241,0.1); padding: 1px 4px; border-radius: 3px;">Lead: ${leadName}</small>`;
            } else if (taggedNames.length > 0) {
                participantLabel = `<br><small style="color: var(--accent-primary); background: rgba(99, 102, 241,0.1); padding: 1px 4px; border-radius: 3px;">Tagged: ${taggedNames.join(', ')}</small>`;
            }
            
            // Start time for today (either time_in or 12:00 AM)
            const startTimeTs = Math.max(new Date(wo.time_in).getTime(), dayStartMs);
            const startTimeStr = new Date(startTimeTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
                <tr>
                    <td>${wo.id}</td>
                    <td><strong>${wo.ref_id_jo}</strong>${participantLabel}</td>
                    <td style="max-width: 300px;">${wo.description || 'N/A'}</td>
                    <td>${startTimeStr}</td>
                    <td>${formatDuration(workedMs)}</td>
                </tr>
            `;
        }).filter(Boolean).join('');

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
        
        // Admins see all; regular users see own + open (pending) WOs
        const isAdmin = currentUser.role === 'Admin';
        if (!isAdmin) {
            workOrders = workOrders.filter(wo => {
                const isLead = wo.user_id === currentUser.id || (wo.user && wo.user.id === currentUser.id);
                const isTagged = Array.isArray(wo.tagged_user_ids) && wo.tagged_user_ids.includes(currentUser.id);
                const isOpen = wo.status === 'pending' && !wo.user_id;
                return isLead || isTagged || isOpen;
            });
        }

        // Mark tagged ones for display
        workOrders = workOrders.map(wo => ({
            ...wo,
            _isTagged: !!(!(wo.user_id === currentUser.id || (wo.user && wo.user.id === currentUser.id)) && wo.user_id),
            _isOpen: wo.status === 'pending' && !wo.user_id
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

        // Apply Date Filter (pending WOs have no time_in; show them regardless of date filter)
        const dateFilter = document.getElementById('mywork-date-filter').value;
        if (dateFilter) {
            workOrders = workOrders.filter(wo => wo.status === 'pending' || getLocalYYYYMMDD(wo.time_in) === dateFilter);
        }

        // Filter based on tab
        if (filter === 'pending') {
            workOrders = workOrders.filter(wo => wo.status === 'pending');
        } else if (filter === 'ongoing') {
            workOrders = workOrders.filter(wo => wo.status === 'started' || wo.status === 'paused');
        } else if (filter === 'completed') {
            workOrders = workOrders.filter(wo => wo.status === 'completed');
        }
        
        statCount.textContent = `${workOrders.length} ${workOrders.length === 1 ? 'Work Order' : 'Work Orders'}`;
        renderMyWorkOrders(workOrders);
        
    } catch (err) {
        showToast('Failed to load My Work data.', 'error');
        listContainer.innerHTML = '<p class="text-center p-4">Error loading data.</p>';
    }
}

function renderMyWorkOrders(workOrders) {
    window._lastRenderedWorkOrders = (window._lastRenderedWorkOrders || []).filter(w => !workOrders.find(x => x.id === w.id)).concat(workOrders);
    const container = document.getElementById('mywork-orders-list');
    container.innerHTML = '';

    if (workOrders.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-4">No work orders match this criteria.</p>';
        return;
    }

    const testedLabels = { not_tested: 'Not Tested', testing: 'Testing', pass: 'Pass', needs_fix: 'Needs Fix' };
    const testedColors = { not_tested: '#94a3b8', testing: '#f59e0b', pass: '#22c55e', needs_fix: '#ef4444' };

    workOrders.forEach(wo => {
        const isPending = wo.status === 'pending' && !wo.user_id;
        const isCompleted = wo.status === 'completed';

        const row = document.createElement('div');
        row.className = 'admin-list-row';

        const workedMs = isPending ? 0 : calcWorkedTime(wo.id, wo.time_in, wo.time_out, wo.pause_history, wo.user_id, wo.status);
        const timeTaken = isPending ? '—' : formatDuration(workedMs);
        const estimateStr = formatEstimate(wo.estimate_time);

        const testedVal = testedLabels[wo.tested] ? wo.tested : 'not_tested';
        const testedBadge = `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.7rem;font-weight:600; padding:3px 9px; border-radius:20px; background:${testedColors[testedVal]}18; color:${testedColors[testedVal]}; border:1px solid ${testedColors[testedVal]}55; white-space:nowrap;"><span style="width:6px;height:6px;border-radius:50%;background:${testedColors[testedVal]};flex-shrink:0;"></span>${testedLabels[testedVal]}</span>`;

        const assignedDisplay = isPending
            ? `<span class="badge" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-size:0.7rem;">Open</span>`
            : (wo.user ? `<span style="font-size:0.85rem;">${wo.user.name}</span>` : '—');

        const taggedBadge = wo._isTagged
            ? `<span class="badge" style="background: rgba(99, 102, 241,0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241,0.3); font-size:0.65rem; margin-left: 4px;"><i class="fa-solid fa-tag"></i> Tagged</span>`
            : '';

        const safeDesc = (wo.description || '').replace(/'/g, "\\'");
        const isPaused = wo.status === 'paused';
        const canAct = wo.user_id === currentUser.id;

        let actionBtn;
        if (isPending) {
            actionBtn = `<button class="btn btn-primary btn-sm" style="font-size:0.75rem; padding:0.3rem 0.8rem;" onclick="handleStartWorkOrder('${wo.id}')"><i class="fa-solid fa-play"></i> Start</button>`;
        } else if (isCompleted) {
            actionBtn = `<span class="badge status-completed" style="font-size:0.7rem;">DONE</span>`;
        } else {
            const pauseBtn = canAct
                ? `<button class="btn btn-outline btn-sm" style="font-size:0.72rem; padding:0.25rem 0.6rem;" onclick="toggleWorkOrderPause('${wo.id}', '${wo.status}')">
                    <i class="fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}"></i> ${isPaused ? 'Resume' : 'Pause'}
                  </button>`
                : '';
            const finishBtn = canAct
                ? `<button class="btn btn-outline btn-sm" style="font-size:0.72rem; padding:0.25rem 0.6rem; color:#22c55e; border-color:#22c55e55;" onclick="completeWorkOrder('${wo.id}')">
                    <i class="fa-solid fa-check"></i> Finish
                  </button>`
                : '';
            actionBtn = `${pauseBtn}${finishBtn}`;
        }

        row.innerHTML = `
            <div class="col-id">${wo.id}</div>
            <div class="col-info">
                <span class="admin-desc">${wo.description || 'No description'} ${taggedBadge}</span>
                <span class="admin-meta">${wo.ref_id_jo}${wo.job_order ? ' · ' + wo.job_order.title : ''}</span>
            </div>
            <div class="col-job">
                <span class="admin-job-id" style="display:block;">${wo.ref_id_jo}</span>
                <span class="admin-job-title" title="${wo.job_order ? wo.job_order.title : 'N/A'}" style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${wo.job_order ? wo.job_order.title : 'N/A'}</span>
            </div>
            <div style="display:flex; align-items:center; font-size:0.82rem; color:#94a3b8; font-weight:500;">${estimateStr}</div>
            <div style="display:flex; align-items:center; font-size:0.82rem; font-weight:600; color:#e2e8f0;">${timeTaken}</div>
            <div style="display:flex; align-items:center;">${testedBadge}</div>
            <div style="display:flex; align-items:center;">${assignedDisplay}</div>
            <div style="display:flex; align-items:center; gap:0.35rem; flex-wrap:nowrap;">${actionBtn}</div>
        `;

        container.appendChild(row);
    });
}

window.saveWOField = async function(woId, field, value) {
    try {
        await fetch(`${API_BASE}/work-orders/${woId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: value })
        });
    } catch { /* silent */ }
};

window.saveWOEstimate = async function(woId, changedInput) {
    // Find both hr and min inputs for this WO in the same card
    const card = changedInput.closest('.work-item');
    if (!card) return;
    const hrsInput  = card.querySelector(`input[data-wo-id="${woId}"][data-field="est-hrs"]`);
    const minsInput = card.querySelector(`input[data-wo-id="${woId}"][data-field="est-mins"]`);
    const hrs  = parseInt(hrsInput?.value)  || 0;
    const mins = parseInt(minsInput?.value) || 0;
    const totalMins = hrs * 60 + mins || null;
    try {
        await fetch(`${API_BASE}/work-orders/${woId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estimate_time: totalMins })
        });
    } catch { /* silent */ }
};

window.handleStartWorkOrder = async function(woId) {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_BASE}/work-orders/${woId}/start`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id })
        });
        if (res.ok) {
            showToast('Work started!', 'success');
            const activeTab = document.querySelector('#mywork-tabs .tab-btn.active')?.dataset.tab || 'all';
            loadMyWorkDashboard(activeTab);
            if (currentJobOrder) openJobDetail(currentJobOrder.id);
            loadDashboard();
        } else {
            const err = await res.json();
            showToast(err.error || 'Failed to start work order.', 'error');
        }
    } catch {
        showToast('Failed to start work order.', 'error');
    }
};

async function handleSendReport(jobOrderId) {
    if (!currentUser) return;
    const btn = document.getElementById('btn-send-report');
    if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...'; }

    try {
        const res = await fetch(`${API_BASE}/job-orders/${jobOrderId}/send-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requester_id: currentUser.id })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`Report sent to ${data.recipientCount} recipient(s).`, 'success');
        } else {
            showToast(data.error || 'Failed to send report.', 'error');
        }
    } catch {
        showToast('Failed to send report.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Report'; }
    }
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
            const shortTitle = truncateText(job.title, 15);
            opt.textContent = `${job.id} - ${shortTitle}`;
            filter.appendChild(opt);
        });
        
        filter.value = currentVal;
    } catch (err) {
        console.error('Failed to populate My Work Job filter:', err);
    }
}
