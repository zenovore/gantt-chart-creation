// === Progress Tracker Panel ===
const { useState, useMemo } = React;

function TrackerPanel({ data, isOpen, onClose, snapshots, notes, onSaveNote }) {
  const [editingTask, setEditingTask] = useState(null);
  const [editUpdate, setEditUpdate] = useState('');
  const [editBlocker, setEditBlocker] = useState('');
  const [copied, setCopied] = useState(false);

  const today = data ? formatDateKey(data.today) : '';
  const yesterday = data ? formatDateKey(addDays(data.today, -1)) : '';
  const weekStartKey = data ? formatDateKey(startOfWeek(data.today)) : '';

  const streamGroups = useMemo(() => {
    if (!data) return {};
    const groups = {};
    data.streams.forEach(s => { groups[s] = []; });
    data.tasks.forEach(t => {
      if (groups[t.stream]) groups[t.stream].push(t);
    });
    return groups;
  }, [data]);

  const blockers = useMemo(() => {
    if (!data) return [];
    const result = [];
    Object.entries(notes).forEach(([key, note]) => {
      if (key.startsWith(today + '|') && note.blockers && note.blockers.trim()) {
        const taskId = key.split('|')[1];
        const task = data.tasks.find(t => t.id === taskId);
        if (task) result.push({ task, blocker: note.blockers });
      }
    });
    return result;
  }, [notes, today, data]);

  if (!isOpen || !data) return null;

  const getDelta = (taskId, currentProgress) => {
    const ydaySnap = snapshots[yesterday];
    const weekSnap = snapshots[weekStartKey];
    return {
      vsYesterday: ydaySnap && ydaySnap[taskId] != null ? currentProgress - ydaySnap[taskId] : null,
      vsWeekStart: weekSnap && weekSnap[taskId] != null && weekStartKey !== today ? currentProgress - weekSnap[taskId] : null,
    };
  };

  const startEdit = (task) => {
    const key = `${today}|${task.id}`;
    const existing = notes[key] || {};
    setEditingTask(task.id);
    setEditUpdate(existing.update || '');
    setEditBlocker(existing.blockers || '');
  };

  const saveEdit = () => {
    if (editingTask) {
      onSaveNote(editingTask, { update: editUpdate, blockers: editBlocker });
      setEditingTask(null);
    }
  };

  const cancelEdit = () => {
    setEditingTask(null);
    setEditUpdate('');
    setEditBlocker('');
  };

  const generateReport = () => {
    let report = `Progress Report — ${formatDate(data.today)}\n\n`;

    if (blockers.length > 0) {
      report += 'BLOCKERS\n';
      blockers.forEach(b => {
        report += `  • ${b.task.id} ${b.task.name}: ${b.blocker}\n`;
      });
      report += '\n';
    }

    data.streams.forEach(stream => {
      const tasks = streamGroups[stream];
      if (!tasks || tasks.length === 0) return;
      report += `${stream.toUpperCase()}\n`;
      tasks.forEach(t => {
        const delta = getDelta(t.id, t.progress);
        const parts = [];
        if (delta.vsYesterday != null) parts.push(`${delta.vsYesterday >= 0 ? '+' : ''}${delta.vsYesterday}% vs yesterday`);
        if (delta.vsWeekStart != null) parts.push(`${delta.vsWeekStart >= 0 ? '+' : ''}${delta.vsWeekStart}% vs week start`);
        const deltaStr = parts.length ? ` (${parts.join(', ')})` : '';
        report += `  ${t.id} ${t.name} — ${t.progress}%${deltaStr}\n`;
        const noteKey = `${today}|${t.id}`;
        const note = notes[noteKey];
        if (note && note.update) report += `    Done: ${note.update}\n`;
        if (note && note.blockers) report += `    Blocker: ${note.blockers}\n`;
      });
      report += '\n';
    });

    navigator.clipboard.writeText(report).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return ReactDOM.createPortal(
    <div className="tracker-overlay" onClick={onClose}>
      <div className="tracker-panel" onClick={e => e.stopPropagation()}>
        <div className="tracker-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <span className="tracker-title">Progress Tracker</span>
          <span className="tracker-date">{formatDate(data.today)}</span>
          <button className="btn btn-sm btn-icon" onClick={onClose} style={{marginLeft:'auto', fontSize: 14}}>✕</button>
        </div>

        <div className="tracker-body">
          {blockers.length > 0 && (
            <div className="tracker-section">
              <div className="tracker-section-title blocker">⚠ Blockers ({blockers.length})</div>
              {blockers.map(b => (
                <div key={b.task.id} className="tracker-blocker-card">
                  <div style={{display:'flex', gap:6, alignItems:'center'}}>
                    <span className="tracker-task-id">{b.task.id}</span>
                    <span style={{fontSize:12, fontWeight:600}}>{b.task.name}</span>
                  </div>
                  <div className="tracker-blocker-text">{b.blocker}</div>
                </div>
              ))}
            </div>
          )}

          {data.streams.map(stream => {
            const tasks = streamGroups[stream];
            if (!tasks || tasks.length === 0) return null;
            return (
              <div key={stream} className="tracker-section">
                <div className="tracker-section-title">
                  <span className="stream-pill" style={{background: data.streamColors[stream]}}>{stream}</span>
                </div>
                {tasks.map(task => {
                  const delta = getDelta(task.id, task.progress);
                  const noteKey = `${today}|${task.id}`;
                  const note = notes[noteKey];
                  const isEditing = editingTask === task.id;

                  return (
                    <div key={task.id} className="tracker-task-card">
                      <div className="tracker-task-top">
                        <span className="tracker-task-id">{task.id}</span>
                        <span className="tracker-task-name">{task.name}</span>
                        <span className="tracker-task-progress">{task.progress}%</span>
                      </div>
                      <div className="tracker-progress-row">
                        <div className="tracker-progress-bar">
                          <div className="tracker-progress-fill" style={{width: `${task.progress}%`, background: data.streamColors[task.stream]}}></div>
                        </div>
                        {delta.vsYesterday != null && (
                          <span className={`delta-badge ${delta.vsYesterday > 0 ? 'positive' : delta.vsYesterday < 0 ? 'negative' : 'neutral'}`}>
                            {delta.vsYesterday > 0 ? '+' : ''}{delta.vsYesterday}%
                          </span>
                        )}
                        {delta.vsWeekStart != null && (
                          <span className="delta-week" title="Since start of week">
                            wk {delta.vsWeekStart > 0 ? '+' : ''}{delta.vsWeekStart}%
                          </span>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="tracker-edit">
                          <div className="tracker-field">
                            <label>Done today</label>
                            <textarea value={editUpdate} onChange={e => setEditUpdate(e.target.value)} placeholder="What was accomplished..." rows={2} />
                          </div>
                          <div className="tracker-field">
                            <label>Blockers</label>
                            <textarea value={editBlocker} onChange={e => setEditBlocker(e.target.value)} placeholder="Any blockers or issues..." rows={2} />
                          </div>
                          <div className="tracker-edit-actions">
                            <button className="btn btn-sm btn-primary" onClick={saveEdit}>Save</button>
                            <button className="btn btn-sm" onClick={cancelEdit}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="tracker-note-display" onClick={() => startEdit(task)}>
                          {note && (note.update || note.blockers) ? (
                            <React.Fragment>
                              {note.update && <div className="tracker-note-item update">✓ {note.update}</div>}
                              {note.blockers && <div className="tracker-note-item blocker">⚠ {note.blockers}</div>}
                            </React.Fragment>
                          ) : (
                            <div className="tracker-note-placeholder">Click to add notes...</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="tracker-footer">
          <button className="btn btn-sm" onClick={generateReport}>
            {copied ? '✓ Copied to clipboard!' : '📋 Copy Daily Report'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

Object.assign(window, { TrackerPanel });
