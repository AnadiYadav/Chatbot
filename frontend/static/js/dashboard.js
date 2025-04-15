/**
 * NRSC Superadmin Dashboard Controller
 * Handles analytics visualization and admin management
 */

// Configuration
const API_BASE_URL = 'http://localhost:3000/api';

// DOM Elements
const logoutBtn = document.querySelector('.btn-logout');
const addAdminBtn = document.querySelector('.btn-primary');
const adminModal = document.getElementById('adminModal');
const adminForm = document.getElementById('adminForm');

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Verify authentication status first
        const authCheck = await fetch(`${API_BASE_URL}/admin-data`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const authData = await authCheck.json();
        
        if (!authCheck.ok) {
            // Clear any invalid cookies
            document.cookie = 'authToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            window.location.href = '/frontend/templates/admin-login.html';
            return;
        }

        // Continue initialization if authenticated
        initializeCharts();
        loadActiveSessions();
        loadPendingRequests();
        loadTotalAdmins();
        setInterval(loadActiveSessions, 30000);

        // Event Listeners
        logoutBtn.addEventListener('click', handleLogout);
        addAdminBtn.addEventListener('click', showAdminForm);
        adminForm.addEventListener('submit', handleAdminCreation);

    } catch (error) {
        console.error('Authentication check failed:', error);
        // Clear any invalid cookies
        document.cookie = 'authToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        window.location.href = '/frontend/templates/admin-login.html';
    }
});

// Chart Initialization 
function initializeCharts() {
    // Frequently Asked Questions Chart
    const faqCtx = document.getElementById('faqChart').getContext('2d');
    new Chart(faqCtx, {
        type: 'bar',
        data: {
            labels: ['Satellite Data', 'GIS Mapping', 'Weather', 'Sensors', 'Other'],
            datasets: [{
                label: 'Questions Count',
                data: [65, 59, 80, 81, 56],
                backgroundColor: 'rgba(0, 102, 178, 0.8)',
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });

    // Approval Status Chart 
    const approvalCtx = document.getElementById('approvalChart').getContext('2d');
    new Chart(approvalCtx, {
        type: 'pie',
        data: {
            labels: ['Approved', 'Pending', 'Rejected'],
            datasets: [{
                data: [70, 15, 15],
                backgroundColor: ['#4CAF50', '#FFC107', '#F44336']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // Sentiment Analysis Chart
const sentimentCtx = document.getElementById('sentimentChart').getContext('2d');

// Get CSS variables properly
const style = getComputedStyle(document.documentElement);
const successGreen = style.getPropertyValue('--success-green').trim();
const warningYellow = style.getPropertyValue('--warning-yellow').trim();
const errorRed = style.getPropertyValue('--error-red').trim();

new Chart(sentimentCtx, {
    type: 'doughnut',
    data: {
        labels: ['Positive', 'Neutral', 'Negative'],
        datasets: [{
            data: [65, 25, 10],
            backgroundColor: [
                hexToRGBA(successGreen, 0.8),
                hexToRGBA(warningYellow, 0.8),
                hexToRGBA(errorRed, 0.8)
            ]
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'bottom',
                labels: {
                    font: {
                        size: 14
                    }
                }
            }
        },
        cutout: '70%'
    }
});

// Improved hexToRGBA function with error handling
function hexToRGBA(hex, alpha = 1) {
    // Handle shorthand hex (#RGB)
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Validate values
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
        console.error('Invalid hex color:', hex);
        return `rgba(0, 0, 0, ${alpha})`; // Fallback to black
    }
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

    // Visitor Statistics Chart 
    const visitorCtx = document.getElementById('visitorChart').getContext('2d');
    new Chart(visitorCtx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Monthly Visitors',
                data: [65, 59, 80, 81, 56, 55],
                borderColor: '#0066b2',
                tension: 0.4,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}


// Load Active Sessions 
async function loadActiveSessions() {
    try {
        const response = await fetch(`${API_BASE_URL}/active-sessions`, {
            credentials: 'include'
        });
        const data = await response.json();
        document.getElementById('activeSessions').textContent = data.count;
    } catch (error) {
        console.error('NRSC Session Error:', error);
    }
}

// Load Pending Requests 
async function loadPendingRequests() {
    try {
        const response = await fetch(`${API_BASE_URL}/knowledge-requests/pending`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to fetch requests');
        
        const { requests } = await response.json();
        
        // Update pending requests count
        document.getElementById('pendingApprovals').textContent = requests.length;
        document.getElementById('pendingCount').textContent = requests.length;

        // Update approval chart data
        updateApprovalChart(requests.length);

        // Populate requests table
        const tbody = document.getElementById('requestsBody');
        tbody.innerHTML = requests.map(request => `
        <tr>
                <td>${request.admin_email}</td>
                <td class="request-title">${request.type.toUpperCase()} - ${request.title}</td>
                <td>${new Date(request.created_at).toLocaleDateString('en-IN')}</td>
                <td class="action-buttons">
                    <button class="btn-approve" data-id="${request.id}">Approve</button>
                    <button class="btn-reject" data-id="${request.id}">Reject</button>
                </td>
        </tr>
        `).join('');

        // Add event listeners to action buttons
        document.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', () => handleRequestAction(btn.dataset.id, 'approve'));
        });
        
        document.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', () => handleRequestAction(btn.dataset.id, 'reject'));
        });

    } catch (error) {
        console.error('NRSC Request Error:', error);
    }
}

// Update approval chart data
function updateApprovalChart(pendingCount) {
    const chart = Chart.getChart('approvalChart');
    if (chart) {
        chart.data.datasets[0].data = [70, pendingCount, 15];
        chart.update();
    }
}

// Handle request approval/rejection
async function handleRequestAction(requestId, action) {
    try {
        const response = await fetch(`${API_BASE_URL}/knowledge-requests/${requestId}/${action}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Action failed');

        const result = await response.json();
        alert(`NRSC: Request ${action}d successfully`);
        loadPendingRequests(); // Refresh the list

        // If approved, process the content
        if (action === 'approve' && result.filePath) {
            await processApprovedContent(result);
        }

    } catch (error) {
        console.error(`NRSC ${action} Error:`, error);
        alert(`NRSC: Failed to ${action} request`);
    }
}

// Process approved content (placeholder for vector store integration)
async function processApprovedContent(result) {
    console.log('NRSC: Processing approved content', result);
    // Add vector store processing logic here
}

// Admin Management Functions 
function showAdminForm() {
    document.getElementById('adminModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('adminModal').style.display = 'none';
}

async function handleAdminCreation(e) {
    e.preventDefault();
    
    const adminData = {
        email: document.getElementById('adminEmail').value,
        password: document.getElementById('adminPassword').value,
        role: document.getElementById('adminRole').value
    };

    try {
        const response = await fetch(`${API_BASE_URL}/create-admin`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(adminData)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.errors?.join('\n') || result.message || 'Creation failed');
        }

        alert('NRSC: Admin created successfully!');
        closeModal();
    } catch (error) {
        console.error('NRSC Admin Creation Error:', error);
        alert(`NRSC Error: ${error.message}`);
    }
}

// function to load total admins
async function loadTotalAdmins() {
    try {
        const response = await fetch(`${API_BASE_URL}/total-admins`, {
            credentials: 'include'
        });
        const data = await response.json();
        document.getElementById('totalAdmins').textContent = data.count;
    } catch (error) {
        console.error('Total admins error:', error);
    }
}

// Request History Functions
function showRequestHistory() {
    document.getElementById('historyModal').style.display = 'block';
    loadRequestHistory();
}

function closeHistoryModal() {
    document.getElementById('historyModal').style.display = 'none';
}

async function loadRequestHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/request-history`, {
            credentials: 'include'
        });
        const { requests } = await response.json();
        
        const tbody = document.getElementById('historyBody');
        tbody.innerHTML = requests.map(request => `
            <tr>
                <td>${request.admin_email}</td>
                <td>${request.title}</td>
                <td>${request.type.toUpperCase()}</td>
                <td><span class="decision-${request.status}">${request.decision}</span></td>
                <td>${new Date(request.decision_at).toLocaleDateString('en-IN')}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Request history error:', error);
    }
}


// Logout Handler 
function handleLogout() {
    fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        credentials: 'include'
    }).then(() => {
        window.location.href = '/frontend/templates/admin-login.html';
    }).catch(error => {
        console.error('NRSC Logout Error:', error);
    });
}