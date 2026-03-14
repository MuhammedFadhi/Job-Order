/**
 * Nexus Job Management - Frontend Logic
 */

// State
let currentUser = null;
let currentJobOrder = null;
let allUsers = [];

// API Configuration
const API_BASE = '/api';

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    dashboard: document.getElementById('dashboard-view')
};

const modals = {
    newJob: document.getElementById('new-job-modal'),
    jobDetail: document.getElementById('job-detail-modal')
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

async function initApp() {
    // 1. Fetch Users for dropdowns (Job Assignment)
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
    
    // Auth Form
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', handleAuthLogin);
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

    document.getElementById('btn-cancel-work').addEventListener('click', () => {
        document.getElementById('new-work-form').classList.add('hidden');
        document.getElementById('new-work-form').reset();
        document.getElementById('btn-new-work').classList.remove('hidden');
    });

    document.getElementById('new-work-form').addEventListener('submit', handleCreateWorkOrder);
    document.getElementById('btn-close-job').addEventListener('click', handleCloseJobOrder);
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
            
            // Update Top Nav
            document.getElementById('current-user-name').textContent = currentUser.name;
            document.getElementById('current-user-role').textContent = currentUser.role;
            document.getElementById('current-user-avatar').textContent = currentUser.name.charAt(0);
            
            showToast(`Welcome back, ${currentUser.name}!`, 'success');
            document.getElementById('auth-form').reset();
            
            switchView('dashboard');
            loadDashboard();
        } else {
            showToast(data.error || 'Authentication failed', 'error');
        }
    } catch (err) {
        btn.innerHTML = 'Sign In <i class="fa-solid fa-arrow-right"></i>';
        btn.disabled = false;
        showToast('Network error during login.', 'error');
    }
}

function handleLogout() {
    currentUser = null;
    currentJobOrder = null;
    switchView('login');
}

// --- Dashboard Logic ---

async function loadDashboard() {
    const container = document.getElementById('job-orders-container');
    container.innerHTML = '<div class="line-loader w-full"></div>';

    try {
        const res = await fetch(`${API_BASE}/job-orders`);
        const jobs = await res.json();
        
        container.innerHTML = ''; // Clear loader
        
        if(jobs.length === 0) {
            container.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">No job orders available. Create one to get started.</p>';
            return;
        }

        jobs.forEach(job => {
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
                    <span><i class="fa-regular fa-user"></i> ${job.assigned_to ? job.assigned_to.name : 'Unassigned'}</span>
                </div>
            `;
            card.addEventListener('click', () => openJobDetail(job.id));
            container.appendChild(card);
        });

    } catch (err) {
        showToast('Failed to load job orders.', 'error');
        container.innerHTML = '<p>Error loading data.</p>';
    }
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
        document.getElementById('jd-assigned').textContent = currentJobOrder.assigned_to ? currentJobOrder.assigned_to.name : 'Unassigned';
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

function renderWorkOrders(workOrders) {
    const list = document.getElementById('work-orders-list');
    list.innerHTML = '';
    
    if(workOrders.length === 0) {
        list.innerHTML = '<p class="text-muted" style="margin-top:0.5rem;">No work orders currently active. Add one to begin tracking time.</p>';
        return;
    }

    // Sort by created_at desc (newest first)
    workOrders.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

    workOrders.forEach(wo => {
        const item = document.createElement('div');
        item.className = 'work-item';
        
        const isCompleted = wo.status === 'completed';
        const badgeClass = isCompleted ? 'status-completed' : 'status-started';
        
        const timeIn = new Date(wo.time_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const timeOut = wo.time_out ? new Date(wo.time_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Ongoing';
        
        item.innerHTML = `
            <div class="work-info">
                <span class="work-desc">${wo.description}</span>
                <span class="work-meta">${wo.id} | ${timeIn} &rarr; ${timeOut}</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.75rem;">
                <span class="badge ${badgeClass}">${wo.status}</span>
                ${!isCompleted ? `<button class="btn btn-outline btn-sm" onclick="completeWorkOrder('${wo.id}')">Finish</button>` : ''}
            </div>
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
        } else {
            throw new Error('Failed');
        }
    } catch {
        showToast('Failed to start work.', 'error');
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
            showToast('Work order completed.', 'success');
            openJobDetail(currentJobOrder.id); // Refresh
            loadDashboard(); // ensure main dashboard knows status might have changed if we bubble it up
        } else {
            throw new Error('Failed');
        }
    } catch {
        showToast('Failed to complete work.', 'error');
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
