// ─── HELPERS ───────────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id);
const escapeHtml = (value) => {
  const node = document.createElement('div');
  node.textContent = value || '';
  return node.innerHTML;
};

// ─── DOM REFS ───────────────────────────────────────────────────────────────
const loginScreen = el('loginScreen');
const dashboard   = el('dashboard');
const isHostedPreview = location.hostname.endsWith('.chatgpt.site');

// ─── TAB SWITCHING ──────────────────────────────────────────────────────────
function switchTab(tabName) {
  // Update sidebar nav active state
  document.querySelectorAll('.nav-link[data-tab]').forEach(link => {
    link.classList.toggle('active', link.dataset.tab === tabName);
  });

  // Show/hide tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.hidden = panel.id !== `tab-${tabName}`;
  });

  // Load data when switching to registrations tab
  if (tabName === 'registrations') loadDashboard();
}

// Wire up sidebar nav links
document.querySelectorAll('.nav-link[data-tab]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab(link.dataset.tab);
  });
});

// ─── GREETING ───────────────────────────────────────────────────────────────
function setGreeting() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const el = document.getElementById('greetingText');
  if (el) el.textContent = `${greet}, organiser.`;
}

// ─── PREVIEW MODE ───────────────────────────────────────────────────────────
function openPreviewDashboard() {
  loginScreen.hidden = true;
  dashboard.hidden   = false;
  setGreeting();

  document.querySelector('.tab-panel').insertAdjacentHTML('afterbegin',
    '<p class="preview-banner">Client preview — live registrations and CSV export will activate with the hosted database.</p>'
  );

  el('stats').innerHTML = `
    <article class="metric primary-metric"><span>Total registrations</span><strong>0</strong><small>Preview data</small></article>
    <article class="metric"><span>Export ready</span><strong>0</strong><small>Ready for market entry</small></article>
    <article class="metric"><span>Almost ready</span><strong>0</strong><small>Critical gaps to close</small></article>
    <article class="metric"><span>Not assessed</span><strong>0</strong><small>Assessment incomplete</small></article>
  `;

  el('readinessBars').innerHTML = `
    <div class="bar-row"><span>Export Ready</span><div><i class="ready" style="width:0%"></i></div><b>0</b></div>
    <div class="bar-row"><span>Almost Ready</span><div><i class="almost" style="width:0%"></i></div><b>0</b></div>
    <div class="bar-row"><span>Not Export Ready</span><div><i class="not" style="width:0%"></i></div><b>0</b></div>
  `;

  el('registrationRows').innerHTML =
    '<tr><td class="empty-state" colspan="6">Dashboard preview — live participant entries will appear here.</td></tr>';

  // Disable CSV export links in preview
  document.querySelectorAll('a[href="/api/admin/export.csv"]').forEach(link => {
    link.href = '#';
    link.addEventListener('click', e => e.preventDefault());
  });
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────
el('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isHostedPreview) return openPreviewDashboard();

  const error  = el('loginError');
  const button = event.currentTarget.querySelector('button');
  error.textContent = '';
  button.disabled   = true;
  button.textContent = 'Signing in…';

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to sign in.');

    loginScreen.hidden = true;
    dashboard.hidden   = false;
    setGreeting();
    await loadDashboard();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled  = false;
    button.innerHTML = 'Open dashboard <span>→</span>';
  }
});

// ─── LOAD DASHBOARD DATA ─────────────────────────────────────────────────────
async function loadDashboard() {
  const q         = encodeURIComponent(el('search').value.trim());
  const readiness = encodeURIComponent(el('readinessFilter').value);

  const [statsResponse, rowsResponse] = await Promise.all([
    fetch('/api/admin/stats'),
    fetch(`/api/admin/registrations?q=${q}&readiness=${readiness}`)
  ]);

  if (statsResponse.status === 401 || rowsResponse.status === 401) {
    dashboard.hidden   = true;
    loginScreen.hidden = false;
    return;
  }

  const stats     = await statsResponse.json();
  const { rows }  = await rowsResponse.json();
  const counts    = Object.fromEntries(stats.readiness.map(item => [item.label, item.value]));

  // Stats cards
  el('stats').innerHTML = `
    <article class="metric primary-metric">
      <span>Total registrations</span>
      <strong>${stats.total}</strong>
      <small>Participants recorded</small>
    </article>
    <article class="metric">
      <span>Export ready</span>
      <strong>${counts['Export Ready'] || 0}</strong>
      <small>Ready for market entry</small>
    </article>
    <article class="metric">
      <span>Almost ready</span>
      <strong>${counts['Almost Export Ready'] || 0}</strong>
      <small>Critical gaps to close</small>
    </article>
    <article class="metric">
      <span>Not assessed</span>
      <strong>${counts['Not assessed'] || 0}</strong>
      <small>Assessment incomplete</small>
    </article>
  `;

  // Readiness bars
  const entries = [
    ['Export Ready',        'ready'],
    ['Almost Export Ready', 'almost'],
    ['Not Export Ready',    'not'],
    ['Not assessed',        'neutral']
  ];
  const max = Math.max(stats.total, 1);
  el('readinessBars').innerHTML = entries.map(([label, tone]) => `
    <div class="bar-row">
      <span>${label}</span>
      <div><i class="${tone}" style="width:${((counts[label] || 0) / max) * 100}%"></i></div>
      <b>${counts[label] || 0}</b>
    </div>
  `).join('');

  // Registrations table
  el('registrationRows').innerHTML = rows.length
    ? rows.map(row => {
        const tone = row.assessment_result === 'Export Ready'        ? 'ready'
                   : row.assessment_result === 'Almost Export Ready' ? 'almost'
                   : row.assessment_result === 'Not Export Ready'    ? 'not'
                   : 'neutral';
        return `
          <tr>
            <td><b>${escapeHtml(row.full_name)}</b><small>${escapeHtml(row.email)} · ${escapeHtml(row.phone_number)}</small></td>
            <td>${escapeHtml(row.city)}, ${escapeHtml(row.country)}<small>${escapeHtml(row.state_province)}</small></td>
            <td>${escapeHtml(row.church_ministry_centre)}<small>${escapeHtml(row.zone_group_church)}</small></td>
            <td>${escapeHtml(row.business_name || '—')}<small>${escapeHtml(row.industry_category)}</small></td>
            <td><span class="status ${tone}">${escapeHtml(row.assessment_result || 'Not assessed')}</span></td>
            <td>${new Date(`${row.created_at}Z`).toLocaleDateString()}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td class="empty-state" colspan="6">No registrations yet. New participant entries will appear here.</td></tr>';
}

// ─── SEARCH & FILTER ─────────────────────────────────────────────────────────
let searchTimer;
el('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadDashboard, 250);
});
el('readinessFilter').addEventListener('change', loadDashboard);

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
el('logout').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  dashboard.hidden   = true;
  loginScreen.hidden = false;
  el('loginForm').reset();
  switchTab('overview'); // reset to overview for next login
});
