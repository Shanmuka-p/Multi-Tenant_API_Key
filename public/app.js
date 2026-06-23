const TENANT_ID = 1; // Seeded tenant

// Fetch and display keys
async function fetchKeys() {
    try {
        const response = await fetch(`/api/tenants/${TENANT_ID}/keys`);
        const keys = await response.json();
        
        const tbody = document.getElementById('keysTableBody');
        tbody.innerHTML = '';
        
        keys.forEach(key => {
            const tr = document.createElement('tr');
            const date = new Date(key.createdAt).toLocaleString();
            
            tr.innerHTML = `
                <td style="font-family: monospace;">${key.maskedKey}</td>
                <td>${date}</td>
                <td><span class="badge ${key.isActive ? 'badge-active' : 'badge-inactive'}">${key.isActive ? 'Active' : 'Inactive'}</span></td>
                <td class="actions">
                    <button class="btn-secondary" onclick="rotateKey(${key.id})" ${!key.isActive ? 'disabled' : ''}>Rotate</button>
                    <button class="btn-danger" onclick="revokeKey(${key.id})" ${!key.isActive ? 'disabled' : ''}>Revoke</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error fetching keys:', error);
    }
}

// Fetch and display logs
async function fetchLogs() {
    try {
        const response = await fetch(`/api/logs`);
        const logs = await response.json();
        
        const tbody = document.getElementById('logsTableBody');
        tbody.innerHTML = '';
        
        logs.forEach(log => {
            const tr = document.createElement('tr');
            const date = new Date(log.timestamp).toLocaleString();
            
            tr.innerHTML = `
                <td>${date}</td>
                <td style="font-family: monospace;">${log.maskedKey}</td>
                <td>${log.endpoint}</td>
                <td><span style="color: ${log.statusCode === 200 ? 'var(--success-color)' : (log.statusCode === 429 ? 'var(--danger-color)' : 'white')}">${log.statusCode}</span></td>
            `;
            tbody.appendChild(tr);
        });

        updateChart(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
    }
}

// Create a new key
async function createKey() {
    try {
        const response = await fetch(`/api/tenants/${TENANT_ID}/keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rateLimitPerMinute: 100 })
        });
        
        if (response.ok) {
            const data = await response.json();
            showKeyModal('New API Key Generated', data.apiKey);
            fetchKeys();
        } else {
            alert('Failed to create key');
        }
    } catch (error) {
        console.error('Error creating key:', error);
    }
}

// Rotate a key
async function rotateKey(keyId) {
    if (!confirm('Are you sure you want to rotate this key? The old key will expire in 1 minute.')) return;
    
    try {
        const response = await fetch(`/api/keys/${keyId}/rotate`, { method: 'POST' });
        
        if (response.ok) {
            const data = await response.json();
            showKeyModal('Key Rotated Successfully', data.newApiKey);
            fetchKeys();
        } else {
            alert('Failed to rotate key');
        }
    } catch (error) {
        console.error('Error rotating key:', error);
    }
}

// Revoke a key
async function revokeKey(keyId) {
    if (!confirm('Are you sure you want to revoke this key? This action is immediate and irreversible.')) return;
    
    try {
        const response = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' });
        
        if (response.ok) {
            fetchKeys();
            setTimeout(() => alert('Key revoked successfully'), 100);
        } else {
            alert('Failed to revoke key');
        }
    } catch (error) {
        console.error('Error revoking key:', error);
    }
}

// Modal helpers
function showKeyModal(title, keyValue) {
    document.getElementById('keyModalTitle').innerText = title;
    document.getElementById('newKeyValue').innerText = keyValue;
    document.getElementById('keyModal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Chart initialization
let usageChart = null;

function updateChart(logs) {
    // Group logs by minute for the last hour
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Create buckets for each minute
    const labels = [];
    const successfulData = [];
    const limitedData = [];
    
    const buckets = {};
    for (let i = 0; i < 60; i++) {
        const d = new Date(oneHourAgo.getTime() + i * 60 * 1000);
        const timeStr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
        labels.push(timeStr);
        buckets[timeStr] = { success: 0, limited: 0 };
    }
    
    // Fill buckets
    logs.forEach(log => {
        const logDate = new Date(log.timestamp);
        if (logDate >= oneHourAgo) {
            const timeStr = logDate.getHours().toString().padStart(2, '0') + ':' + logDate.getMinutes().toString().padStart(2, '0');
            if (buckets[timeStr]) {
                if (log.statusCode === 200) buckets[timeStr].success++;
                else if (log.statusCode === 429) buckets[timeStr].limited++;
            }
        }
    });
    
    labels.forEach(label => {
        successfulData.push(buckets[label].success);
        limitedData.push(buckets[label].limited);
    });

    const ctx = document.getElementById('usageChart').getContext('2d');
    
    if (usageChart) {
        usageChart.destroy();
    }
    
    usageChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Successful Requests (200)',
                    data: successfulData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Rate Limited (429)',
                    data: limitedData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#f8fafc'
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#94a3b8', stepSize: 1 },
                    grid: { color: '#334155' }
                }
            }
        }
    });
}

// Initial load
fetchKeys();
fetchLogs();

// Refresh logs periodically
setInterval(fetchLogs, 5000);
