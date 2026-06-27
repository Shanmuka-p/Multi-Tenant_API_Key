// ── State ──────────────────────────────────────────────────────────────────
let TENANT_ID = 1;
let currentSection = 'overview';
let activityChart = null;

// Pagination
const PAGE_SIZE = 20;
let logsOffset = 0;
let logsTotal  = 0;

// Pending action targets
let pendingRotateId = null;
let pendingRevokeId = null;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  refresh();
  // Auto-refresh every 10 seconds
  setInterval(refresh, 10_000);
});

async function refresh() {
  await Promise.all([
    fetchStats(),
    fetchActivity(),
    fetchKeys(),
    fetchLogs(),
  ]);
}

// ── Tenant ─────────────────────────────────────────────────────────────────
function switchTenant(id) {
  TENANT_ID = parseInt(id, 10);
  logsOffset = 0;
  const labels = {
    1: 'Acme Corp · Tenant ID: 1',
    2: 'Globex Systems · Tenant ID: 2',
  };
  const el = document.getElementById('tenantLabel');
  if (el) el.textContent = labels[TENANT_ID] || `Tenant ID: ${TENANT_ID}`;
  refresh();
  toast('Switched tenant', 'info');
}

// ── Sections ───────────────────────────────────────────────────────────────
function showSection(name) {
  ['overview', 'keys', 'logs'].forEach(s => {
    document.getElementById(`section-${s}`).style.display = s === name ? '' : 'none';
    document.getElementById(`nav-${s}`).classList.toggle('active', s === name);
  });
  currentSection = name;
  if (name === 'logs') fetchLogs(true);
}

// ── Stats ──────────────────────────────────────────────────────────────────
async function fetchStats() {
  try {
    const res = await fetch(`/api/tenants/${TENANT_ID}/stats`);
    if (!res.ok) return;
    const s = await res.json();
    setText('stat-total-keys',   s.total_keys   ?? '0');
    setText('stat-active-keys',  s.active_keys  ?? '0');
    setText('stat-req-hour',     s.requests_last_hour ?? '0');
    setText('stat-rate-limited', s.rate_limited_requests ?? '0');
  } catch (e) {
    console.error('[Stats]', e);
  }
}

// ── Activity Chart ─────────────────────────────────────────────────────────
async function fetchActivity() {
  try {
    const res = await fetch('/api/logs/activity');
    if (!res.ok) return;
    const rows = await res.json();
    renderChart(rows);
  } catch (e) {
    console.error('[Activity]', e);
  }
}

function renderChart(rows) {
  // Build 60-minute buckets
  const now      = Date.now();
  const buckets  = {};
  for (let i = 59; i >= 0; i--) {
    const d = new Date(now - i * 60_000);
    const key = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    buckets[key] = { success: 0, limited: 0 };
  }

  rows.forEach(r => {
    const d = new Date(r.minute);
    const key = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    if (buckets[key]) {
      buckets[key].success = parseInt(r.success_count, 10) || 0;
      buckets[key].limited = parseInt(r.limited_count, 10) || 0;
    }
  });

  const labels  = Object.keys(buckets);
  const success = labels.map(l => buckets[l].success);
  const limited = labels.map(l => buckets[l].limited);

  const ctx = document.getElementById('activityChart').getContext('2d');
  if (activityChart) activityChart.destroy();

  activityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '200 OK',
          data: success,
          borderColor: '#22c98c',
          backgroundColor: 'rgba(34,201,140,0.08)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: '429 Rate Limited',
          data: limited,
          borderColor: '#f25c6e',
          backgroundColor: 'rgba(242,92,110,0.08)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#8fa3c0', font: { family: 'Inter', size: 12 }, boxWidth: 12 },
        },
        tooltip: {
          backgroundColor: '#162040',
          borderColor: '#1e2d4a',
          borderWidth: 1,
          titleColor: '#e8edf5',
          bodyColor: '#8fa3c0',
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#5a7090',
            maxTicksLimit: 12,
            font: { size: 10 },
          },
          grid: { color: 'rgba(30,45,74,0.5)' },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#5a7090', stepSize: 1, font: { size: 10 } },
          grid: { color: 'rgba(30,45,74,0.5)' },
        },
      },
    },
  });
}

// ── Keys ───────────────────────────────────────────────────────────────────
async function fetchKeys() {
  try {
    const res  = await fetch(`/api/tenants/${TENANT_ID}/keys`);
    if (!res.ok) return;
    const keys = await res.json();
    renderKeys(keys);
  } catch (e) {
    console.error('[Keys]', e);
  }
}

function renderKeys(keys) {
  const tbody = document.getElementById('keysTableBody');
  if (!tbody) return;

  if (!keys.length) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state">
        <div class="empty-icon">🗝️</div>
        <div class="empty-text">No API keys yet. Create your first key to get started.</div>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = keys.map(key => {
    const isExpiring = key.expiresAt && new Date(key.expiresAt) > new Date();
    const statusBadge = !key.isActive
      ? `<span class="badge badge-red">Revoked</span>`
      : isExpiring
        ? `<span class="badge badge-yellow">⏳ Rotating</span>`
        : `<span class="badge badge-green">● Active</span>`;

    const expires = key.expiresAt
      ? `<span title="${new Date(key.expiresAt).toLocaleString()}" style="color:var(--yellow);font-size:0.78rem;">in ${timeUntil(key.expiresAt)}</span>`
      : '<span style="color:var(--text-3);font-size:0.78rem;">Never</span>';

    const disabled = !key.isActive;

    return `<tr>
      <td class="mono">${escHtml(key.maskedKey)}</td>
      <td style="color:var(--text-2);font-size:0.82rem;">${new Date(key.createdAt).toLocaleString()}</td>
      <td>
        <div class="rl-bar-wrap">
          <span class="rl-label">${key.rateLimitPerMinute}/min</span>
        </div>
      </td>
      <td>${expires}</td>
      <td>${statusBadge}</td>
      <td>
        <div class="action-cell">
          <button class="btn btn-ghost btn-sm btn-icon" title="Rotate key"
            onclick="openRotateModal(${key.id})" ${disabled ? 'disabled' : ''}>↻</button>
          <button class="btn btn-danger btn-sm" title="Revoke key"
            onclick="openRevokeModal(${key.id})" ${disabled ? 'disabled' : ''}>Revoke</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Logs ───────────────────────────────────────────────────────────────────
async function fetchLogs(reset = false) {
  if (reset) logsOffset = 0;
  try {
    const res = await fetch(`/api/logs?limit=${PAGE_SIZE}&offset=${logsOffset}`);
    if (!res.ok) return;
    const { logs, total } = await res.json();
    logsTotal = total;
    renderLogs(logs, document.getElementById('logsTableBody'));
    renderLogs(logs.slice(0, 8), document.getElementById('recentLogsBody'));
    updatePagination();
  } catch (e) {
    console.error('[Logs]', e);
  }
}

function renderLogs(logs, tbody) {
  if (!tbody) return;
  if (!logs || !logs.length) {
    tbody.innerHTML = `<tr><td colspan="4">
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">No audit logs yet. Make a request to the protected endpoint.</div>
      </div>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = logs.map(log => {
    const sc = log.statusCode;
    const scClass = sc === 200 ? 'sc-200' : sc === 429 ? 'sc-429' : sc === 401 ? 'sc-401' : 'sc-500';
    const scBadge = sc === 200
      ? `<span class="badge badge-green">${sc}</span>`
      : sc === 429
        ? `<span class="badge badge-red">${sc}</span>`
        : sc === 401
          ? `<span class="badge badge-yellow">${sc}</span>`
          : `<span class="badge badge-blue">${sc}</span>`;
    return `<tr>
      <td style="color:var(--text-2);font-size:0.8rem;">${new Date(log.timestamp).toLocaleString()}</td>
      <td class="mono">${escHtml(log.maskedKey)}</td>
      <td class="mono" style="color:var(--text-2)">${escHtml(log.endpoint)}</td>
      <td>${scBadge}</td>
    </tr>`;
  }).join('');
}

function updatePagination() {
  const from = logsOffset + 1;
  const to   = Math.min(logsOffset + PAGE_SIZE, logsTotal);
  const info = document.getElementById('logsInfo');
  if (info) info.textContent = logsTotal === 0 ? 'No records' : `${from}–${to} of ${logsTotal}`;

  const prev = document.getElementById('btn-prev');
  const next = document.getElementById('btn-next');
  if (prev) prev.disabled = logsOffset === 0;
  if (next) next.disabled = logsOffset + PAGE_SIZE >= logsTotal;
}

function prevPage() {
  if (logsOffset > 0) { logsOffset -= PAGE_SIZE; fetchLogs(); }
}
function nextPage() {
  if (logsOffset + PAGE_SIZE < logsTotal) { logsOffset += PAGE_SIZE; fetchLogs(); }
}

// ── Modal: Create ──────────────────────────────────────────────────────────
function openCreateModal() {
  document.getElementById('createRateLimit').value = 100;
  openModal('createModal');
}

async function doCreateKey() {
  const limit = parseInt(document.getElementById('createRateLimit').value, 10);
  const btn = document.getElementById('btn-do-create');
  btn.disabled = true;
  btn.textContent = 'Generating…';

  try {
    const res = await fetch(`/api/tenants/${TENANT_ID}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rateLimitPerMinute: limit }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    closeModal('createModal');
    showKeyDisplay('API Key Generated', data.apiKey);
    fetchKeys();
    fetchStats();
    toast('API key created successfully', 'success');
  } catch (e) {
    toast('Failed to create key: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Key';
  }
}

// ── Modal: Rotate ──────────────────────────────────────────────────────────
function openRotateModal(keyId) {
  pendingRotateId = keyId;
  openModal('rotateModal');
}

async function doRotateKey() {
  if (!pendingRotateId) return;
  const btn = document.getElementById('btn-do-rotate');
  btn.disabled = true;
  btn.textContent = 'Rotating…';

  try {
    const res = await fetch(`/api/keys/${pendingRotateId}/rotate`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error || 'Unknown error');
    const data = await res.json();
    closeModal('rotateModal');
    showKeyDisplay('Key Rotated — New API Key', data.newApiKey);
    fetchKeys();
    fetchStats();
    toast('Key rotated. Old key valid for 1 more minute.', 'info');
  } catch (e) {
    toast('Rotation failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Rotate Key';
    pendingRotateId = null;
  }
}

// ── Modal: Revoke ──────────────────────────────────────────────────────────
function openRevokeModal(keyId) {
  pendingRevokeId = keyId;
  openModal('revokeModal');
}

async function doRevokeKey() {
  if (!pendingRevokeId) return;
  const btn = document.getElementById('btn-do-revoke');
  btn.disabled = true;
  btn.textContent = 'Revoking…';

  try {
    const res = await fetch(`/api/keys/${pendingRevokeId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error((await res.json()).error || 'Unknown error');
    closeModal('revokeModal');
    fetchKeys();
    fetchStats();
    toast('Key revoked immediately. All requests will return 401.', 'success');
  } catch (e) {
    toast('Revocation failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Revoke Key';
    pendingRevokeId = null;
  }
}

// ── Key Display Modal ──────────────────────────────────────────────────────
function showKeyDisplay(title, key) {
  document.getElementById('keyDisplayTitle').textContent = title;
  document.getElementById('keyDisplayValue').textContent = key;
  document.getElementById('copyBtn').textContent = 'Copy';
  document.getElementById('copyBtn').classList.remove('copied');
  openModal('keyDisplayModal');
}

function copyKey() {
  const val = document.getElementById('keyDisplayValue').textContent;
  navigator.clipboard.writeText(val).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

// ── Modal Helpers ──────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
// Close on overlay click
document.querySelectorAll('.overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});
// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  }
});

// ── Toast ──────────────────────────────────────────────────────────────────
function toast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${escHtml(message)}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeUntil(dateStr) {
  const diff = new Date(dateStr) - new Date();
  if (diff <= 0) return 'expired';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
