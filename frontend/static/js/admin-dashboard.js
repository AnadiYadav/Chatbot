/**
 * NRSC Admin Dashboard Controller
 * Handles dashboard visualization and knowledge submission
 */

// Configuration
const API_BASE_URL = 'http://localhost:3000/api';

// Initialize Dashboard with Authentication Check
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Verify authentication status
        const authCheck = await fetch(`${API_BASE_URL}/admin-data`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const authData = await authCheck.json();
        
        if (!authCheck.ok) {
            // Clear invalid cookies and redirect
            document.cookie = 'authToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            window.location.href = '/frontend/templates/admin-login.html';
            return;
        }

        // Initialize dashboard components
        initializeCharts();
        loadActiveSessions();
        loadTotalAdmins();
        setInterval(loadActiveSessions, 30000);

        // Form submission handler
        document.getElementById('knowledgeForm').addEventListener('submit', handleKnowledgeSubmission);

    } catch (error) {
        console.error('Authentication check failed:', error);
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
            plugins: { legend: { display: false } }
        }
    });

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
            plugins: { legend: { position: 'top' } }
        }
    });

    // Sentiment Analysis Chart
    const sentimentCtx = document.getElementById('sentimentChart').getContext('2d');
    const style = getComputedStyle(document.documentElement);
    new Chart(sentimentCtx, {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Neutral', 'Negative'],
            datasets: [{
                data: [65, 25, 10],
                backgroundColor: [
                    style.getPropertyValue('--success-green'),
                    style.getPropertyValue('--warning-yellow'),
                    style.getPropertyValue('--error-red')
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            cutout: '70%'
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
            plugins: { legend: { position: 'bottom' } }
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
        console.error('Session Error:', error);
    }
}

// Load Total Admins
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

// Handle Knowledge Submission
async function handleKnowledgeSubmission(e) {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('title', document.getElementById('knowledgeTitle').value);
    formData.append('type', document.getElementById('knowledgeType').value);
    formData.append('description', document.getElementById('knowledgeDesc').value);

    if (document.getElementById('knowledgeType').value === 'pdf') {
        formData.append('file', document.getElementById('knowledgePDF').files[0]);
    } else {
        formData.append('content', document.getElementById('knowledgeContent').value);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/knowledge-requests`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Submission failed');
        }

        alert('NRSC: Knowledge submitted for approval');
        document.getElementById('knowledgeForm').reset();
    } catch (error) {
        console.error('Submission Error:', error);
        alert(`NRSC Error: ${error.message}`);
    }
}

// Toggle PDF/Text Input
function togglePDFField() {
    const type = document.getElementById('knowledgeType').value;
    document.getElementById('textContentGroup').style.display = type === 'pdf' ? 'none' : 'block';
    document.getElementById('pdfContentGroup').style.display = type === 'pdf' ? 'block' : 'none';
    
    // Update required fields
    document.getElementById('knowledgeContent').required = type !== 'pdf';
    document.getElementById('knowledgePDF').required = type === 'pdf';
}

// Logout Handler
function handleLogout() {
    fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        credentials: 'include'
    }).then(() => {
        window.location.href = '/frontend/templates/admin-login.html';
    }).catch(error => {
        console.error('Logout Error:', error);
    });
}
