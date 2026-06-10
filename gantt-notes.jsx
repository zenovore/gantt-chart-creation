// === Notes Panel ===
const NOTES_KEY = 'gantt-daily-notes';

function loadNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTES_KEY)) || {};
    return migrateNotes(raw);
  } catch { return {}; }
}

function saveNotes(notes) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

function migrateNotes(notes) {
  const out = {};
  Object.keys(notes).forEach(key => {
    if (key.includes('|')) {
      out[key] = notes[key];
    } else {
      out[`${key}|General`] = { ...notes[key], date: key, stream: 'General' };
    }
  });
  return out;
}

function noteKey(date, stream) { return `${date}|${stream}`; }

function parseNoteKey(key) {
  const i = key.indexOf('|');
  return { date: key.slice(0, i), stream: key.slice(i + 1) };
}

function formatNoteDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function countNoteItems(dayNotes) {
  let count = 0;
  ['yesterdayDone', 'todayTodo', 'blockers', 'issues', 'notes'].forEach(f => {
    count += (dayNotes[f] || []).length;
  });
  return count;
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function emptyDay(date, stream) {
  return { date, stream, yesterdayDone: [], todayTodo: [], blockers: [], issues: [], notes: [] };
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getStreamsFromNotes(allNotes) {
  const set = new Set();
  Object.keys(allNotes).forEach(key => {
    const { stream } = parseNoteKey(key);
    set.add(stream);
  });
  return set;
}

// --- Single bullet-point input section ---
function NoteSection({ label, icon, items, onAdd, onRemove, onToggleResolved, placeholder, tracked }) {
  const [input, setInput] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && input.trim()) {
      onAdd(input);
      setInput('');
    }
  };

  return (
    <div className="note-section">
      <div className="note-section-header" onClick={() => setCollapsed(!collapsed)}>
        <svg width="10" height="10" viewBox="0 0 10 10" style={{transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s'}}>
          <path d="M3 1 L7 5 L3 9" stroke="currentColor" fill="none" strokeWidth="1.5"/>
        </svg>
        <span className="note-section-icon">{icon}</span>
        <span className="note-section-label">{label}</span>
        {items.length > 0 && <span className="note-section-count">{items.length}</span>}
      </div>
      {!collapsed && (
        <div className="note-section-body">
          {items.map((item, i) => (
            <div key={i} className={`note-item ${tracked && item.resolved ? 'resolved' : ''}`}>
              {tracked && (
                <button className="note-item-check" onClick={() => onToggleResolved(i)} title={item.resolved ? 'Mark open' : 'Mark resolved'}>
                  {item.resolved ? (
                    <svg width="14" height="14" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="var(--accent)"/><polyline points="9 12 11.5 14.5 16 9.5" fill="none" stroke="white" strokeWidth="2.5"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
                  )}
                </button>
              )}
              <span className="note-item-bullet">{tracked ? '' : '•'}</span>
              <span className="note-item-text">{tracked ? item.text : item}</span>
              <button className="note-item-delete" onClick={() => onRemove(i)} title="Remove">✕</button>
            </div>
          ))}
          <div className="note-input-row">
            <span className="note-input-bullet">+</span>
            <input
              type="text"
              className="note-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Read-only view of a previous day ---
function PrevDayView({ dayNotes }) {
  const sections = [
    { key: 'yesterdayDone', label: 'Yesterday Done', icon: '✓' },
    { key: 'todayTodo', label: 'Today Todo', icon: '→' },
    { key: 'blockers', label: 'Blockers', icon: '⚠' },
    { key: 'issues', label: 'Issues', icon: '!' },
    { key: 'notes', label: 'Notes', icon: '✎' },
  ];

  return (
    <div className="prev-day-content">
      {sections.map(({ key, label, icon }) => {
        const items = dayNotes[key] || [];
        if (items.length === 0) return null;
        return (
          <div key={key} className="prev-section">
            <div className="prev-section-label">{icon} {label}</div>
            {items.map((item, i) => (
              <div key={i} className={`prev-item ${typeof item === 'object' && item.resolved ? 'resolved' : ''}`}>
                {typeof item === 'object' ? (
                  <span>{item.resolved ? '✓' : '○'} {item.text}</span>
                ) : (
                  <span>• {item}</span>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// --- Main Notes Panel ---
function NotesPanel({ onClose, allNotes, onNotesChange, streams }) {
  const [expandedDays, setExpandedDays] = useState(new Set());
  const today = getTodayKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedStream, setSelectedStream] = useState('General');

  const availableStreams = useMemo(() => {
    const set = new Set(['General']);
    if (streams) streams.forEach(s => set.add(s));
    getStreamsFromNotes(allNotes).forEach(s => set.add(s));
    return Array.from(set);
  }, [streams, allNotes]);

  const key = noteKey(selectedDate, selectedStream);
  const currentNotes = allNotes[key] || emptyDay(selectedDate, selectedStream);

  const updateCurrent = (field, value) => {
    const updated = { ...allNotes, [key]: { ...currentNotes, date: selectedDate, stream: selectedStream, [field]: value } };
    onNotesChange(updated);
  };

  const addPoint = (field, text) => {
    if (!text.trim()) return;
    if (field === 'blockers' || field === 'issues') {
      const prefix = field === 'blockers' ? 'blk' : 'iss';
      const item = { id: `${prefix}-${Date.now()}`, text: text.trim(), resolved: false };
      updateCurrent(field, [...(currentNotes[field] || []), item]);
    } else {
      updateCurrent(field, [...(currentNotes[field] || []), text.trim()]);
    }
  };

  const removePoint = (field, index) => {
    const arr = [...(currentNotes[field] || [])];
    arr.splice(index, 1);
    updateCurrent(field, arr);
  };

  const toggleResolved = (field, index) => {
    const arr = [...(currentNotes[field] || [])];
    arr[index] = { ...arr[index], resolved: !arr[index].resolved };
    updateCurrent(field, arr);
  };

  const prevEntries = useMemo(() => {
    return Object.keys(allNotes)
      .filter(k => k !== key)
      .map(k => ({ key: k, ...parseNoteKey(k), notes: allNotes[k] }))
      .filter(e => e.stream === selectedStream)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 14);
  }, [allNotes, key, selectedStream]);

  const toggleDay = (k) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(allNotes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `daily-notes-${selectedDate}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportMD = () => {
    let md = '# Daily Notes\n\n';
    const sectionDefs = [
      { key: 'yesterdayDone', label: 'Yesterday Done' },
      { key: 'todayTodo', label: 'Today Todo' },
      { key: 'blockers', label: 'Blockers' },
      { key: 'issues', label: 'Issues' },
      { key: 'notes', label: 'Notes' },
    ];
    const entries = Object.keys(allNotes)
      .map(k => ({ ...parseNoteKey(k), data: allNotes[k] }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.stream.localeCompare(b.stream));
    entries.forEach(({ date, stream, data }) => {
      md += `## ${formatNoteDate(date)} — ${stream}\n\n`;
      sectionDefs.forEach(({ key, label }) => {
        const items = data[key] || [];
        if (items.length > 0) {
          md += `### ${label}\n`;
          items.forEach(item => {
            if (typeof item === 'string') md += `- ${item}\n`;
            else md += `- ${item.resolved ? '[x]' : '[ ]'} ${item.text}\n`;
          });
          md += '\n';
        }
      });
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `daily-notes-${selectedDate}.md`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const isToday = selectedDate === today;

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <div className="notes-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
          Daily Notes
        </div>
        <div style={{display:'flex',gap:4}}>
          <button className="btn btn-sm" onClick={handleExportMD} title="Export Markdown">MD</button>
          <button className="btn btn-sm" onClick={handleExportJSON} title="Export JSON">JSON</button>
          <button className="btn btn-sm btn-icon" onClick={onClose} title="Close notes">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="notes-selectors">
        <div className="notes-date-nav">
          <button className="btn btn-sm btn-icon" onClick={() => setSelectedDate(d => shiftDate(d, -1))} title="Previous day">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="notes-date-pick">
            <input type="date" className="notes-date-input" value={selectedDate}
              onChange={e => e.target.value && setSelectedDate(e.target.value)} />
            <span className="notes-date-label">{formatNoteDate(selectedDate)}</span>
          </div>
          <button className="btn btn-sm btn-icon" onClick={() => setSelectedDate(d => shiftDate(d, 1))} title="Next day">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          {!isToday && (
            <button className="btn btn-sm" onClick={() => setSelectedDate(today)} style={{fontSize:10,padding:'2px 8px'}}>Today</button>
          )}
        </div>
        <div className="notes-stream-nav">
          <label className="notes-stream-label">Stream</label>
          <select className="notes-stream-select" value={selectedStream} onChange={e => setSelectedStream(e.target.value)}>
            {availableStreams.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="notes-body">
        <NoteSection label="Yesterday Done" icon="✓" items={currentNotes.yesterdayDone || []}
          onAdd={(t) => addPoint('yesterdayDone', t)} onRemove={(i) => removePoint('yesterdayDone', i)}
          placeholder="What did you complete yesterday?" />
        <NoteSection label="Today Todo" icon="→" items={currentNotes.todayTodo || []}
          onAdd={(t) => addPoint('todayTodo', t)} onRemove={(i) => removePoint('todayTodo', i)}
          placeholder="What will you do today?" />
        <NoteSection label="Blockers" icon="⚠" items={currentNotes.blockers || []}
          onAdd={(t) => addPoint('blockers', t)} onRemove={(i) => removePoint('blockers', i)}
          onToggleResolved={(i) => toggleResolved('blockers', i)}
          placeholder="Any blockers?" tracked />
        <NoteSection label="Issues" icon="!" items={currentNotes.issues || []}
          onAdd={(t) => addPoint('issues', t)} onRemove={(i) => removePoint('issues', i)}
          onToggleResolved={(i) => toggleResolved('issues', i)}
          placeholder="Any issues found?" tracked />
        <NoteSection label="Notes" icon="✎" items={currentNotes.notes || []}
          onAdd={(t) => addPoint('notes', t)} onRemove={(i) => removePoint('notes', i)}
          placeholder="Additional notes..." />

        {prevEntries.length > 0 && (
          <div className="notes-prev-section">
            <div className="notes-prev-title">Previous Notes — {selectedStream}</div>
            {prevEntries.map(entry => {
              const isExpanded = expandedDays.has(entry.key);
              const count = countNoteItems(entry.notes);
              return (
                <div key={entry.key} className="notes-prev-day">
                  <div className="notes-prev-day-header" onClick={() => toggleDay(entry.key)}>
                    <svg width="10" height="10" viewBox="0 0 10 10" style={{transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0}}>
                      <path d="M3 1 L7 5 L3 9" stroke="currentColor" fill="none" strokeWidth="1.5"/>
                    </svg>
                    <span className="notes-prev-day-date">{formatNoteDate(entry.date)}</span>
                    <span className="notes-prev-day-count">{count} items</span>
                  </div>
                  {isExpanded && (
                    <div className="notes-prev-day-body">
                      <PrevDayView dayNotes={entry.notes} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { NotesPanel, loadNotes, saveNotes, parseNoteKey });
