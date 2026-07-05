// === Gantt Chart Utilities ===

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_MAP = {};
MONTH_NAMES.forEach((m, i) => MONTH_MAP[m.toLowerCase()] = i);

function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split('-');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0]);
  const month = MONTH_MAP[parts[1].toLowerCase()];
  const year = parseInt(parts[2]);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  return new Date(year, month, day);
}

function formatDate(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}-${MONTH_NAMES[d.getMonth()]}-${d.getFullYear()}`;
}

function diffDays(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function startOfWeek(d) {
  const r = new Date(d); const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  return r;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// === RAG Status ===
function calculateRAG(startDate, endDate, progress, today) {
  if (!startDate || !endDate) return 'green';
  const t = today.getTime(), e = endDate.getTime(), s = startDate.getTime();
  // Red: overdue with incomplete progress
  if (t > e && progress < 100) return 'red';
  // If completed
  if (progress >= 100) return 'green';
  // Amber: within 7 days of due AND progress < 80%
  const daysLeft = (e - t) / 86400000;
  if (daysLeft >= 0 && daysLeft <= 7 && progress < 80) return 'amber';
  // Expected progress (linear interpolation)
  if (t >= s && t <= e) {
    const totalDuration = e - s;
    const elapsed = t - s;
    const expected = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 100;
    if (progress >= expected) return 'green';
    return 'amber';
  }
  // Before start
  return 'green';
}

const RAG_COLORS = { green: '#16A34A', amber: '#D97706', red: '#DC2626' };
const RAG_BG = { green: '#DCFCE7', amber: '#FEF3C7', red: '#FEE2E2' };
const RAG_LABELS = { green: 'On Track', amber: 'At Risk', red: 'Overdue' };

// Colorblind-safe Tol palette
const STREAM_COLORS = [
  '#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE',
  '#AA3377', '#EE8866', '#44BB99', '#882255', '#BBBBBB'
];

// === CSV Validation ===
function validateCSVColumns(headers) {
  const required = ['epic_id','activity_id','subactivity_id','summary','start_date','end_date','stream'];
  const normalized = headers.map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = required.filter(r => !normalized.includes(r));
  return { valid: missing.length === 0, missing, normalized };
}

// === Data Processing (3-tier: Epic > Activity > Sub-activity) ===
// Level detection:
//   Epic: epic_id filled, activity_id empty, subactivity_id empty
//   Activity: epic_id filled, activity_id filled, subactivity_id empty
//   Sub-activity: activity_id filled, subactivity_id filled (epic_id may be empty)
function processCSVData(rows) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const streams = [...new Set(rows.map(r => (r.stream || '').trim()).filter(Boolean))];
  const streamColors = {};
  streams.forEach((s, i) => streamColors[s] = STREAM_COLORS[i % STREAM_COLORS.length]);

  const epicMap = {}; const epicOrder = [];

  // First pass: collect names and map activity→epic
  const nameMap = {};
  const activityToEpic = {};
  rows.forEach(row => {
    const eid = (row.epic_id || '').trim();
    const aid = (row.activity_id || '').trim();
    const said = (row.subactivity_id || '').trim();
    const summary = (row.summary || '').trim();
    if (eid && !aid && !said && summary) nameMap[eid] = summary;
    if (eid && aid && !said) { nameMap[aid] = summary || aid; activityToEpic[aid] = eid; }
    if (aid && said) { nameMap[said] = summary || said; if (!activityToEpic[aid] && eid) activityToEpic[aid] = eid; }
  });

  // Second pass: build hierarchy
  rows.forEach(row => {
    const epicId = (row.epic_id || '').trim();
    const activityId = (row.activity_id || '').trim();
    const subactivityId = (row.subactivity_id || '').trim();
    const summary = (row.summary || '').trim();
    const stream = (row.stream || '').trim();
    const description = (row.description || '').trim();
    const startDate = parseDate(row.start_date);
    const endDate = parseDate(row.end_date);
    const progress = Math.min(100, Math.max(0, parseInt(row.progress) || 0));
    const deps = (row.dependencies || '').split(/[,|]/).map(d => d.trim()).filter(Boolean);

    // Determine level
    const isSubactivity = subactivityId !== '';
    const isActivity = !isSubactivity && activityId !== '';
    const isEpic = !isSubactivity && !isActivity && epicId !== '';

    if (isEpic) {
      const name = summary || nameMap[epicId] || epicId;
      const item = {
        id: epicId, name, stream, description, startDate, endDate, progress, dependencies: deps,
        level: 'epic', rag: calculateRAG(startDate, endDate, progress, today),
        activities: []
      };
      if (!epicMap[epicId]) { epicMap[epicId] = item; epicOrder.push(epicId); }
      else Object.assign(epicMap[epicId], { ...item, activities: epicMap[epicId].activities });
    } else if (isActivity) {
      const resolvedEpicId = epicId || activityToEpic[activityId] || 'UNLINKED';
      const name = summary || nameMap[activityId] || activityId;
      const item = {
        id: activityId, epicId: resolvedEpicId, name, stream, description, startDate, endDate, progress, dependencies: deps,
        level: 'activity', rag: calculateRAG(startDate, endDate, progress, today),
        subactivities: []
      };
      if (!epicMap[resolvedEpicId]) {
        epicMap[resolvedEpicId] = {
          id: resolvedEpicId, name: nameMap[resolvedEpicId] || resolvedEpicId, stream, description: '',
          startDate: null, endDate: null, progress: 0, dependencies: [], level: 'epic', rag: 'green', activities: []
        };
        epicOrder.push(resolvedEpicId);
      }
      const existing = epicMap[resolvedEpicId].activities.find(a => a.id === activityId);
      if (existing) Object.assign(existing, { ...item, subactivities: existing.subactivities });
      else epicMap[resolvedEpicId].activities.push(item);
    } else if (isSubactivity) {
      const resolvedEpicId = epicId || activityToEpic[activityId] || 'UNLINKED';
      const name = summary || nameMap[subactivityId] || subactivityId;
      const item = {
        id: subactivityId, activityId, epicId: resolvedEpicId, name, stream, description, startDate, endDate, progress, dependencies: deps,
        level: 'subactivity', rag: calculateRAG(startDate, endDate, progress, today)
      };
      if (!epicMap[resolvedEpicId]) {
        epicMap[resolvedEpicId] = {
          id: resolvedEpicId, name: nameMap[resolvedEpicId] || resolvedEpicId, stream, description: '',
          startDate: null, endDate: null, progress: 0, dependencies: [], level: 'epic', rag: 'green', activities: []
        };
        epicOrder.push(resolvedEpicId);
      }
      let activity = epicMap[resolvedEpicId].activities.find(a => a.id === activityId);
      if (!activity) {
        activity = {
          id: activityId, epicId: resolvedEpicId, name: nameMap[activityId] || activityId, stream, description: '',
          startDate: null, endDate: null, progress: 0, dependencies: [], level: 'activity', rag: 'green', subactivities: []
        };
        epicMap[resolvedEpicId].activities.push(activity);
      }
      activity.subactivities.push(item);
    }
  });

  const tasks = epicOrder.map(id => epicMap[id]);

  // Roll up: subactivities → activity, activities → epic
  tasks.forEach(epic => {
    epic.activities.forEach(act => {
      if (act.subactivities.length) {
        const subs = act.subactivities.filter(s => s.startDate && s.endDate);
        if (!act.startDate && subs.length) act.startDate = new Date(Math.min(...subs.map(s => s.startDate.getTime())));
        if (!act.endDate && subs.length) act.endDate = new Date(Math.max(...subs.map(s => s.endDate.getTime())));
        const allSubs = act.subactivities.filter(s => s.startDate || s.endDate);
        if (allSubs.length) act.progress = Math.round(allSubs.reduce((a, s) => a + s.progress, 0) / allSubs.length);
        act.rag = calculateRAG(act.startDate, act.endDate, act.progress, today);
      }
    });
    if (epic.activities.length) {
      const acts = epic.activities.filter(a => a.startDate && a.endDate);
      if (!epic.startDate && acts.length) epic.startDate = new Date(Math.min(...acts.map(a => a.startDate.getTime())));
      if (!epic.endDate && acts.length) epic.endDate = new Date(Math.max(...acts.map(a => a.endDate.getTime())));
      const allActs = epic.activities.filter(a => a.startDate || a.endDate);
      if (allActs.length) epic.progress = Math.round(allActs.reduce((a, act) => a + act.progress, 0) / allActs.length);
      epic.rag = calculateRAG(epic.startDate, epic.endDate, epic.progress, today);
    }
  });

  let minDate = null, maxDate = null;
  tasks.forEach(epic => {
    if (epic.startDate && (!minDate || epic.startDate < minDate)) minDate = new Date(epic.startDate);
    if (epic.endDate && (!maxDate || epic.endDate > maxDate)) maxDate = new Date(epic.endDate);
    epic.activities.forEach(act => {
      if (act.startDate && (!minDate || act.startDate < minDate)) minDate = new Date(act.startDate);
      if (act.endDate && (!maxDate || act.endDate > maxDate)) maxDate = new Date(act.endDate);
      act.subactivities.forEach(sub => {
        if (sub.startDate && (!minDate || sub.startDate < minDate)) minDate = new Date(sub.startDate);
        if (sub.endDate && (!maxDate || sub.endDate > maxDate)) maxDate = new Date(sub.endDate);
      });
    });
  });
  if (minDate) minDate = startOfMonth(addDays(minDate, -3));
  if (maxDate) maxDate = addDays(maxDate, 14);

  return { tasks, streams, streamColors, timelineStart: minDate, timelineEnd: maxDate, today };
}

// === Timeline Helpers ===
function getMonthHeaders(start, end, dayWidth) {
  const headers = [];
  let d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d < end) {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const mStart = d < start ? start : d;
    const mEnd = next > end ? end : next;
    const days = diffDays(mStart, mEnd);
    if (days > 0) {
      headers.push({
        label: `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`,
        short: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
        left: diffDays(start, mStart) * dayWidth,
        width: days * dayWidth,
      });
    }
    d = next;
  }
  return headers;
}

function getWeekHeaders(start, end, dayWidth) {
  const headers = [];
  let d = startOfWeek(new Date(start));
  if (d < start) d = addDays(d, 7);
  while (d < end) {
    const wEnd = addDays(d, 7);
    const wStart = d < start ? start : d;
    const wE = wEnd > end ? end : wEnd;
    const days = diffDays(wStart, wE);
    if (days > 0) {
      headers.push({
        label: `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`,
        left: diffDays(start, wStart) * dayWidth,
        width: days * dayWidth,
      });
    }
    d = wEnd;
  }
  return headers;
}

// === SVG Export ===
function escapeXML(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function generateSVGExport(flatRows, data, dayWidth) {
  const LPW = 300, RH = 36, HH = 48;
  const { timelineStart: ts, timelineEnd: te, streamColors, today } = data;
  const totalDays = diffDays(ts, te);
  const cw = totalDays * dayWidth;
  const W = LPW + cw + 30, H = HH + flatRows.length * RH + 10;
  const p = [];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="font-family:system-ui,sans-serif">`);
  p.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  // Month headers
  getMonthHeaders(ts, te, dayWidth).forEach(m => {
    p.push(`<rect x="${LPW + m.left}" y="0" width="${m.width}" height="24" fill="#f3f4f6" stroke="#e5e7eb"/>`);
    if (m.width > 40) p.push(`<text x="${LPW + m.left + 4}" y="16" font-size="11" fill="#374151">${escapeXML(m.short)}</text>`);
  });
  // Week headers
  getWeekHeaders(ts, te, dayWidth).forEach(w => {
    p.push(`<rect x="${LPW + w.left}" y="24" width="${w.width}" height="24" fill="#f9fafb" stroke="#e5e7eb"/>`);
    if (w.width > 28) p.push(`<text x="${LPW + w.left + 3}" y="40" font-size="9" fill="#9ca3af">${escapeXML(w.label)}</text>`);
  });
  // Grid + bars
  flatRows.forEach((row, i) => {
    const y = HH + i * RH;
    if (i % 2 === 0) p.push(`<rect x="0" y="${y}" width="${W}" height="${RH}" fill="#f9fafb"/>`);
    p.push(`<line x1="${LPW}" y1="${y}" x2="${W}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`);
    // Left label
    const indent = row.level === 'subactivity' ? 44 : row.level === 'activity' ? 28 : 8;
    const label = `${row.id}  ${row.name}`;
    p.push(`<text x="${indent}" y="${y + RH / 2 + 4}" font-size="10" fill="#374151" font-weight="${row.level === 'epic' ? 'bold' : 'normal'}">${escapeXML(label.substring(0, 42))}</text>`);
    // Bar
    if (row.startDate && row.endDate) {
      const x = LPW + diffDays(ts, row.startDate) * dayWidth;
      const w = Math.max(2, diffDays(row.startDate, row.endDate) * dayWidth);
      const pw = w * row.progress / 100;
      const c = streamColors[row.stream] || '#888';
      p.push(`<rect x="${x}" y="${y + 6}" width="${w}" height="${RH - 12}" rx="3" fill="${c}" opacity="0.2"/>`);
      p.push(`<rect x="${x}" y="${y + 6}" width="${pw}" height="${RH - 12}" rx="3" fill="${c}" opacity="0.8"/>`);
      if (w > 30) p.push(`<text x="${x + 4}" y="${y + RH / 2 + 3}" font-size="9" fill="#fff" font-weight="600">${row.progress}%</text>`);
      const rc = RAG_COLORS[row.rag];
      p.push(`<circle cx="${x + w + 8}" cy="${y + RH / 2}" r="4" fill="${rc}"/>`);
    }
  });
  // Today line
  if (today >= ts && today <= te) {
    const tx = LPW + diffDays(ts, today) * dayWidth;
    p.push(`<line x1="${tx}" y1="0" x2="${tx}" y2="${H}" stroke="#DC2626" stroke-dasharray="4,3" stroke-width="1.5"/>`);
    p.push(`<text x="${tx + 4}" y="${HH - 4}" font-size="9" fill="#DC2626" font-weight="600">Today ${formatDate(today)}</text>`);
  }
  // Left panel border
  p.push(`<line x1="${LPW}" y1="0" x2="${LPW}" y2="${H}" stroke="#d1d5db"/>`);
  p.push('</svg>');
  return p.join('\n');
}

// === Sample Data (embedded, 3-tier: Epic > Activity > Sub-activity) ===
const SAMPLE_CSV_TEXT = `epic_id|activity_id|subactivity_id|summary|stream|description|start_date|end_date|progress|dependencies
OIT-01|||Network Infrastructure Upgrade|Infrastructure|Complete overhaul of core network infrastructure|05-Jan-2026|28-Feb-2026||
OIT-01|OIT-01-A||Switch & Firewall Deployment|Infrastructure|Replace switches and configure firewalls|05-Jan-2026|20-Feb-2026||
|OIT-01-A|OIT-01-A-1|Switch Replacement|Infrastructure|Replace all core and access layer switches|05-Jan-2026|30-Jan-2026|100|
|OIT-01-A|OIT-01-A-2|Firewall Configuration|Infrastructure|Configure and deploy new firewall rules|01-Feb-2026|20-Feb-2026|100|OIT-01-A-1
OIT-01|OIT-01-B||Network Testing|Infrastructure|End-to-end network testing|21-Feb-2026|28-Feb-2026||OIT-01-A
|OIT-01-B|OIT-01-B-1|Performance Testing|Infrastructure|Run performance benchmarks|21-Feb-2026|25-Feb-2026|100|
|OIT-01-B|OIT-01-B-2|Security Testing|Infrastructure|Penetration testing and vulnerability scan|25-Feb-2026|28-Feb-2026|100|OIT-01-B-1
OIT-02|||Cloud Platform Migration|Infrastructure|Migrate on-premises workloads to cloud|01-Mar-2026|31-Jul-2026||OIT-01
OIT-02|OIT-02-A||Environment Setup|Infrastructure|Provision cloud environments|01-Mar-2026|31-Mar-2026||
|OIT-02-A|OIT-02-A-1|Provision VPCs|Infrastructure|Create VPCs and subnets|01-Mar-2026|15-Mar-2026|100|
|OIT-02-A|OIT-02-A-2|Configure IAM|Infrastructure|Setup IAM roles and policies|16-Mar-2026|31-Mar-2026|100|OIT-02-A-1
OIT-02|OIT-02-B||Database Migration|Infrastructure|Migrate production databases|01-Apr-2026|31-May-2026||OIT-02-A
|OIT-02-B|OIT-02-B-1|Schema Migration|Infrastructure|Migrate database schemas|01-Apr-2026|30-Apr-2026|100|
|OIT-02-B|OIT-02-B-2|Data Transfer|Infrastructure|Transfer production data|01-May-2026|31-May-2026|50|OIT-02-B-1
OIT-02|OIT-02-C||Application Rehosting|Infrastructure|Migrate application workloads|01-Jun-2026|31-Jul-2026||OIT-02-B
|OIT-02-C|OIT-02-C-1|Containerize Apps|Infrastructure|Containerize legacy applications|01-Jun-2026|30-Jun-2026|20|
|OIT-02-C|OIT-02-C-2|Deploy to K8s|Infrastructure|Deploy containers to Kubernetes|01-Jul-2026|31-Jul-2026|0|OIT-02-C-1
OIT-03|||ERP System Implementation|Application Dev|Deploy new ERP system across all departments|15-Jan-2026|30-Sep-2026||
OIT-03|OIT-03-A||Requirements & Config|Application Dev|Gather requirements and configure|15-Jan-2026|31-May-2026||
|OIT-03-A|OIT-03-A-1|Requirements Gathering|Application Dev|Collect business requirements|15-Jan-2026|28-Feb-2026|100|
|OIT-03-A|OIT-03-A-2|System Configuration|Application Dev|Configure ERP modules|01-Mar-2026|31-May-2026|80|OIT-03-A-1
OIT-03|OIT-03-B||Testing & Go-Live|Application Dev|UAT and production deployment|01-Jun-2026|30-Sep-2026||OIT-03-A
|OIT-03-B|OIT-03-B-1|Data Migration|Application Dev|Migrate legacy data to ERP|01-Jun-2026|31-Jul-2026|10|
|OIT-03-B|OIT-03-B-2|User Acceptance Testing|Application Dev|Conduct UAT sessions|01-Aug-2026|15-Sep-2026|0|OIT-03-B-1
|OIT-03-B|OIT-03-B-3|Go-Live Support|Application Dev|Production deploy and hypercare|16-Sep-2026|30-Sep-2026|0|OIT-03-B-2
OIT-04|||Security Compliance Program|Security|Achieve SOC 2 and ISO 27001 compliance|01-Apr-2026|30-Aug-2026||
OIT-04|OIT-04-A||Assessment & Policy|Security|Gap assessment and policy development|01-Apr-2026|15-Jun-2026||
|OIT-04-A|OIT-04-A-1|Gap Assessment|Security|Identify compliance gaps|01-Apr-2026|30-Apr-2026|100|
|OIT-04-A|OIT-04-A-2|Policy Development|Security|Create security policies|01-May-2026|15-Jun-2026|55|OIT-04-A-1
OIT-04|OIT-04-B||Technical Controls & Audit|Security|Implement controls and prepare audit|16-May-2026|30-Aug-2026||OIT-04-A
|OIT-04-B|OIT-04-B-1|Technical Controls|Security|Implement security controls|16-May-2026|31-Jul-2026|15|
|OIT-04-B|OIT-04-B-2|Audit Preparation|Security|Prepare documentation for audit|01-Aug-2026|30-Aug-2026|0|OIT-04-B-1`;

function formatDateKey(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// === CSV Export ===
function generateCSVExport(rows, delimiter) {
  const d = delimiter || ',';
  const allCols = ['epic_id','activity_id','subactivity_id','summary','stream','description','start_date','end_date','progress','dependencies'];
  const presentKeys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const headers = allCols.filter(c => presentKeys.some(k => k.toLowerCase().replace(/\s+/g,'_') === c));
  if (headers.length === 0) return '';
  const escape = (v) => {
    const s = String(v || '');
    if (d === '|') return s;
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(d)];
  rows.forEach(row => {
    lines.push(headers.map(h => escape(row[h] || '')).join(d));
  });
  return lines.join('\n');
}

// Expose everything globally
Object.assign(window, {
  parseDate, formatDate, formatDateKey, diffDays, addDays, startOfWeek, startOfMonth,
  calculateRAG, RAG_COLORS, RAG_BG, RAG_LABELS, STREAM_COLORS, MONTH_NAMES, MONTH_FULL,
  validateCSVColumns, processCSVData,
  getMonthHeaders, getWeekHeaders,
  generateSVGExport, escapeXML, SAMPLE_CSV_TEXT, generateCSVExport
});
