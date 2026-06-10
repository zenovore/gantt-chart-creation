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
  const required = ['task_id','subtask_id','task','subtask','stream','description','start_date','end_date','progress','dependencies'];
  const normalized = headers.map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = required.filter(r => !normalized.includes(r));
  return { valid: missing.length === 0, missing, normalized };
}

// === Data Processing ===
function processCSVData(rows) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const streams = [...new Set(rows.map(r => (r.stream || '').trim()).filter(Boolean))];
  const streamColors = {};
  streams.forEach((s, i) => streamColors[s] = STREAM_COLORS[i % STREAM_COLORS.length]);

  const taskMap = {}; const taskOrder = [];

  rows.forEach(row => {
    const taskId = (row.task_id || '').trim();
    const subtaskId = (row.subtask_id || '').trim();
    const isSub = subtaskId !== '';
    const item = {
      id: isSub ? subtaskId : taskId, taskId,
      name: isSub ? (row.subtask || '').trim() : (row.task || '').trim(),
      taskName: (row.task || '').trim(),
      stream: (row.stream || '').trim(),
      description: (row.description || '').trim(),
      startDate: parseDate(row.start_date),
      endDate: parseDate(row.end_date),
      progress: Math.min(100, Math.max(0, parseInt(row.progress) || 0)),
      dependencies: (row.dependencies || '').split(',').map(d => d.trim()).filter(Boolean),
      isSubtask: isSub,
    };
    item.rag = calculateRAG(item.startDate, item.endDate, item.progress, today);

    if (!isSub) {
      if (!taskMap[taskId]) { taskMap[taskId] = { ...item, subtasks: [] }; taskOrder.push(taskId); }
      else Object.assign(taskMap[taskId], { ...item, subtasks: taskMap[taskId].subtasks });
    } else {
      if (!taskMap[taskId]) {
        taskMap[taskId] = {
          id: taskId, taskId, name: (row.task || '').trim(), taskName: (row.task || '').trim(),
          stream: (row.stream || '').trim(), description: '', startDate: null, endDate: null,
          progress: 0, dependencies: [], isSubtask: false, rag: 'green', subtasks: []
        };
        taskOrder.push(taskId);
      }
      taskMap[taskId].subtasks.push(item);
    }
  });

  const tasks = taskOrder.map(id => taskMap[id]);
  // Fill parent dates/progress from subtasks if needed
  tasks.forEach(t => {
    if (t.subtasks.length) {
      const subs = t.subtasks.filter(s => s.startDate && s.endDate);
      if (!t.startDate && subs.length) t.startDate = new Date(Math.min(...subs.map(s => s.startDate.getTime())));
      if (!t.endDate && subs.length) t.endDate = new Date(Math.max(...subs.map(s => s.endDate.getTime())));
      if (t.progress === 0 && subs.length) {
        t.progress = Math.round(subs.reduce((a, s) => a + s.progress, 0) / subs.length);
      }
      t.rag = calculateRAG(t.startDate, t.endDate, t.progress, today);
    }
  });

  let minDate = null, maxDate = null;
  const allItems = [];
  tasks.forEach(t => {
    if (t.startDate && t.endDate) allItems.push(t);
    t.subtasks.forEach(s => { if (s.startDate && s.endDate) allItems.push(s); });
  });
  allItems.forEach(item => {
    if (!minDate || item.startDate < minDate) minDate = new Date(item.startDate);
    if (!maxDate || item.endDate > maxDate) maxDate = new Date(item.endDate);
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
    const indent = row.isSubtask ? 28 : 8;
    const label = `${row.id}  ${row.name}`;
    p.push(`<text x="${indent}" y="${y + RH / 2 + 4}" font-size="10" fill="#374151" font-weight="${row.isSubtask ? 'normal' : 'bold'}">${escapeXML(label.substring(0, 42))}</text>`);
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

// === Sample Data (embedded) ===
const SAMPLE_CSV_TEXT = `task_id,subtask_id,task,subtask,stream,description,start_date,end_date,progress,dependencies
OIT-01,,Network Infrastructure Upgrade,,Infrastructure,Complete overhaul of core network infrastructure including switches routers and firewalls,05-Jan-2026,28-Feb-2026,100,
OIT-01,OIT-01-001,Network Infrastructure Upgrade,Switch Replacement,Infrastructure,Replace all core and access layer switches with next-gen models,05-Jan-2026,30-Jan-2026,100,
OIT-01,OIT-01-002,Network Infrastructure Upgrade,Firewall Configuration,Infrastructure,Configure and deploy new firewall rules and security policies,01-Feb-2026,20-Feb-2026,100,OIT-01-001
OIT-01,OIT-01-003,Network Infrastructure Upgrade,Network Testing,Infrastructure,End-to-end network performance and security testing,21-Feb-2026,28-Feb-2026,100,OIT-01-002
OIT-02,,Cloud Platform Migration,,Infrastructure,Migrate on-premises workloads to cloud infrastructure,01-Mar-2026,31-Jul-2026,42,OIT-01
OIT-02,OIT-02-001,Cloud Platform Migration,Environment Setup,Infrastructure,Provision cloud environments and configure networking,01-Mar-2026,31-Mar-2026,100,OIT-01
OIT-02,OIT-02-002,Cloud Platform Migration,Database Migration,Infrastructure,Migrate production databases to cloud-hosted instances,01-Apr-2026,31-May-2026,75,OIT-02-001
OIT-02,OIT-02-003,Cloud Platform Migration,Application Rehosting,Infrastructure,Migrate and optimize application workloads,01-Jun-2026,31-Jul-2026,15,OIT-02-002
OIT-03,,ERP System Implementation,,Application Dev,Deploy new enterprise resource planning system across all departments,15-Jan-2026,30-Sep-2026,35,
OIT-03,OIT-03-001,ERP System Implementation,Requirements Gathering,Application Dev,Collect and document business requirements from all stakeholders,15-Jan-2026,28-Feb-2026,100,
OIT-03,OIT-03-002,ERP System Implementation,System Configuration,Application Dev,Configure ERP modules to match business processes,01-Mar-2026,31-May-2026,80,OIT-03-001
OIT-03,OIT-03-003,ERP System Implementation,Data Migration,Application Dev,Migrate legacy data to new ERP system,01-Jun-2026,31-Jul-2026,10,OIT-03-002
OIT-03,OIT-03-004,ERP System Implementation,User Acceptance Testing,Application Dev,Conduct UAT with key business users,01-Aug-2026,15-Sep-2026,0,OIT-03-003
OIT-03,OIT-03-005,ERP System Implementation,Go-Live Support,Application Dev,Production deployment and hypercare support,16-Sep-2026,30-Sep-2026,0,OIT-03-004
OIT-04,,Data Analytics Platform,,Data & Analytics,Build centralized data warehouse and analytics dashboards,01-Mar-2026,30-Jun-2026,55,
OIT-04,OIT-04-001,Data Analytics Platform,Data Warehouse Design,Data & Analytics,Design data warehouse schema and ETL pipelines,01-Mar-2026,15-Apr-2026,100,
OIT-04,OIT-04-002,Data Analytics Platform,ETL Development,Data & Analytics,Build and test ETL jobs for all data sources,16-Apr-2026,31-May-2026,70,OIT-04-001
OIT-04,OIT-04-003,Data Analytics Platform,Dashboard Development,Data & Analytics,Create executive and operational dashboards,01-Jun-2026,30-Jun-2026,20,OIT-04-002
OIT-05,,Security Compliance Program,,Security,Achieve SOC 2 Type II and ISO 27001 compliance,01-Apr-2026,30-Aug-2026,30,
OIT-05,OIT-05-001,Security Compliance Program,Gap Assessment,Security,Identify gaps against SOC 2 and ISO 27001 requirements,01-Apr-2026,30-Apr-2026,100,
OIT-05,OIT-05-002,Security Compliance Program,Policy Development,Security,Create and update security policies and procedures,01-May-2026,15-Jun-2026,55,OIT-05-001
OIT-05,OIT-05-003,Security Compliance Program,Technical Controls,Security,Implement required technical security controls,16-May-2026,31-Jul-2026,15,OIT-05-001
OIT-05,OIT-05-004,Security Compliance Program,Audit Preparation,Security,Prepare documentation and evidence for external audit,01-Aug-2026,30-Aug-2026,0,"OIT-05-002,OIT-05-003"
OIT-06,,Change Management Program,,Change Mgmt,Organization-wide change management for IT transformation,15-Jan-2026,30-Sep-2026,40,
OIT-06,OIT-06-001,Change Management Program,Stakeholder Analysis,Change Mgmt,Map stakeholders and create communication plans,15-Jan-2026,28-Feb-2026,100,
OIT-06,OIT-06-002,Change Management Program,Communications Campaign,Change Mgmt,Execute multi-channel change communications,01-Mar-2026,30-Sep-2026,35,OIT-06-001
OIT-06,OIT-06-003,Change Management Program,Impact Assessment,Change Mgmt,Assess organizational readiness and change impacts,01-Apr-2026,31-May-2026,85,OIT-06-001
OIT-07,,Staff Training Program,,Training,Comprehensive training program for all new systems and tools,01-May-2026,31-Oct-2026,15,
OIT-07,OIT-07-001,Staff Training Program,Training Needs Analysis,Training,Identify training requirements by role and department,01-May-2026,31-May-2026,80,
OIT-07,OIT-07-002,Staff Training Program,Content Development,Training,Develop training materials and e-learning modules,01-Jun-2026,31-Jul-2026,10,OIT-07-001
OIT-07,OIT-07-003,Staff Training Program,Pilot Training,Training,Conduct pilot training sessions with key user groups,01-Aug-2026,31-Aug-2026,0,OIT-07-002
OIT-07,OIT-07-004,Staff Training Program,Organization Rollout,Training,Full training rollout across all departments,01-Sep-2026,31-Oct-2026,0,OIT-07-003
OIT-08,,API Integration Platform,,Application Dev,Build centralized API gateway and integration layer,01-Mar-2026,31-Jul-2026,38,OIT-01
OIT-08,OIT-08-001,API Integration Platform,API Gateway Setup,Application Dev,Deploy and configure API management platform,01-Mar-2026,15-Apr-2026,100,OIT-01
OIT-08,OIT-08-002,API Integration Platform,Core API Development,Application Dev,Develop core REST APIs for key business services,16-Apr-2026,30-Jun-2026,45,OIT-08-001
OIT-08,OIT-08-003,API Integration Platform,Third-Party Integrations,Application Dev,Build integrations with external vendor systems,01-Jun-2026,31-Jul-2026,5,OIT-08-002`;

function formatDateKey(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Expose everything globally
Object.assign(window, {
  parseDate, formatDate, formatDateKey, diffDays, addDays, startOfWeek, startOfMonth,
  calculateRAG, RAG_COLORS, RAG_BG, RAG_LABELS, STREAM_COLORS, MONTH_NAMES, MONTH_FULL,
  validateCSVColumns, processCSVData,
  getMonthHeaders, getWeekHeaders,
  generateSVGExport, escapeXML, SAMPLE_CSV_TEXT
});
