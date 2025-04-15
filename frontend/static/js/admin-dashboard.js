/**
 * NRSC Admin Dashboard Controller
 * Handles knowledge submission and dashboard metrics
 */

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    initializeCharts();
    loadActiveSessions();
    togglePDFField(); // Initialize form fields
    
    // Form submission handler
    document.getElementById('knowledgeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitKnowledgeRequest();
    });
});

// Toggle between text and PDF fields
function togglePDFField() {
    const type = document.getElementById('knowledgeType').value;
    document.getElementById('textContentGroup').style.display = type === 'pdf' ? 'none' : 'block';
    document.getElementById('pdfContentGroup').style.display = type === 'pdf' ? 'block' : 'none';
    
    // Clear required attributes when hidden
    if (type !== 'pdf') {
        document.getElementById('knowledgePDF').required = false;
        document.getElementById('knowledgeContent').required = true;
    } else {
        document.getElementById('knowledgePDF').required = true;
        document.getElementById('knowledgeContent').required = false;
    }
}

// Submit knowledge request
async function submitKnowledgeRequest() {
    const formData = new FormData();
    const form = document.getElementById('knowledgeForm');
    
    formData.append('title', document.getElementById('knowledgeTitle').value);
    formData.append('type', document.getElementById('knowledgeType').value);
    formData.append('description', document.getElementById('knowledgeDesc').value);
    
    if (document.getElementById('knowledgeType').value === 'pdf') {
        formData.append('file', document.getElementById('knowledgePDF').files[0]);
    } else {
        formData.append('content', document.getElementById('knowledgeContent').value);
    }

    try {
        const response = await fetch('/api/knowledge-requests', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || 'Submission failed');
        
        alert('NRSC: Knowledge submitted for approval');
        form.reset();
    } catch (error) {
        console.error('Submission Error:', error);
        alert(`NRSC Error: ${error.message}`);
    }
}

// Chart Initialization
function initializeCharts() {
    // FAQ Chart
    new Chart(document.getElementById('faqChart').getContext('2d'), {
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

    // Visitor Chart
    new Chart(document.getElementById('visitorChart').getContext('2d'), {
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
}

// Load active sessions
async function loadActiveSessions() {
    try {
        const response = await fetch('/api/active-sessions', {
            credentials: 'include'
        });
        const data = await response.json();
        document.getElementById('activeSessions').textContent = data.count;
    } catch (error) {
        console.error('Session Error:', error);
    }
}

// Logout handler
function handleLogout() {
    fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
    }).then(() => {
        window.location.href = '/frontend/templates/admin-login.html';
    });
}