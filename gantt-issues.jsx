// === Issues & Blockers Page ===

function IssuesPage({ allNotes, onNotesChange, onBack, streams }) {
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('all');
  const [streamFilter, setStreamFilter] = useState('all');

  const items = useMemo(() => {
    const result = [];
    const keys = Object.keys(allNotes).sort((a, b) => b.localeCompare(a));
    keys.forEach(key => {
      const { date, stream } = parseNoteKey(key);
      const day = allNotes[key];
      (day.blockers || []).forEach((item, idx) => {
        result.push({ ...item, type: 'blocker', noteKey: key, date, stream, field: 'blockers', index: idx });
      });
      (day.issues || []).forEach((item, idx) => {
        result.push({ ...item, type: 'issue', noteKey: key, date, stream, field: 'issues', index: idx });
      });
    });
    return result;
  }, [allNotes]);

  const allStreamsInNotes = useMemo(() => {
    const set = new Set();
    items.forEach(i => set.add(i.stream));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (tab !== 'all') list = list.filter(i => i.type === (tab === 'blockers' ? 'blocker' : 'issue'));
    if (filter !== 'all') list = list.filter(i => filter === 'resolved' ? i.resolved : !i.resolved);
    if (streamFilter !== 'all') list = list.filter(i => i.stream === streamFilter);
    return list;
  }, [items, filter, tab, streamFilter]);

  const toggleResolved = (item) => {
    const updated = { ...allNotes };
    const day = { ...updated[item.noteKey] };
    const arr = [...(day[item.field] || [])];
    arr[item.index] = { ...arr[item.index], resolved: !arr[item.index].resolved };
    day[item.field] = arr;
    updated[item.noteKey] = day;
    onNotesChange(updated);
  };

  const fmtDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const openCount = items.filter(i => !i.resolved).length;
  const resolvedCount = items.filter(i => i.resolved).length;
  const blockerOpen = items.filter(i => i.type === 'blocker' && !i.resolved).length;
  const issueOpen = items.filter(i => i.type === 'issue' && !i.resolved).length;

  const handleExport = () => {
    let md = '# Issues & Blockers Report\n\n';
    md += `Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;
    md += `**Open:** ${openCount} | **Resolved:** ${resolvedCount}\n\n`;
    ['blocker', 'issue'].forEach(type => {
      const typeItems = items.filter(i => i.type === type);
      if (typeItems.length === 0) return;
      md += `## ${type === 'blocker' ? 'Blockers' : 'Issues'}\n\n`;
      typeItems.forEach(item => {
        md += `- ${item.resolved ? '[x]' : '[ ]'} ${item.text} _(${fmtDate(item.date)} — ${item.stream})_\n`;
      });
      md += '\n';
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `issues-report-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div className="issues-page">
      <div className="issues-toolbar">
        <button className="btn btn-sm" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to Chart
        </button>
        <h2 className="issues-title">Issues & Blockers</h2>
        <div className="issues-stats">
          <span className="issues-stat open">{openCount} open</span>
          <span className="issues-stat resolved">{resolvedCount} resolved</span>
        </div>
        <div style={{flex:1}}></div>
        <button className="btn btn-sm" onClick={handleExport}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          Export
        </button>
      </div>
      <div className="issues-filters">
        <div className="segmented">
          <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All</button>
          <button className={tab === 'blockers' ? 'active' : ''} onClick={() => setTab('blockers')}>
            Blockers{blockerOpen > 0 ? ` (${blockerOpen})` : ''}
          </button>
          <button className={tab === 'issues' ? 'active' : ''} onClick={() => setTab('issues')}>
            Issues{issueOpen > 0 ? ` (${issueOpen})` : ''}
          </button>
        </div>
        <div className="segmented">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>Open</button>
          <button className={filter === 'resolved' ? 'active' : ''} onClick={() => setFilter('resolved')}>Resolved</button>
        </div>
        {allStreamsInNotes.length > 1 && (
          <select className="notes-stream-select" value={streamFilter} onChange={e => setStreamFilter(e.target.value)} style={{marginLeft:8}}>
            <option value="all">All streams</option>
            {allStreamsInNotes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
      <div className="issues-list">
        {filtered.length === 0 && (
          <div className="issues-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
            <p>{filter !== 'all' || tab !== 'all' ? 'No matching items' : 'No issues or blockers logged yet'}</p>
            <p style={{fontSize:11,color:'var(--text-tertiary)'}}>Add them from the Daily Notes panel</p>
          </div>
        )}
        {filtered.map((item) => (
          <div key={`${item.noteKey}-${item.field}-${item.index}`} className={`issue-card ${item.resolved ? 'resolved' : ''}`}>
            <button className="issue-check" onClick={() => toggleResolved(item)}>
              {item.resolved ? (
                <svg width="18" height="18" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="var(--accent)"/><polyline points="9 12 11.5 14.5 16 9.5" fill="none" stroke="white" strokeWidth="2.5"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
              )}
            </button>
            <div className="issue-content">
              <div className="issue-text">{item.text}</div>
              <div className="issue-meta">
                <span className={`issue-type-badge ${item.type}`}>
                  {item.type === 'blocker' ? '⚠ Blocker' : '! Issue'}
                </span>
                <span className="issue-stream-badge">{item.stream}</span>
                <span className="issue-date">{fmtDate(item.date)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { IssuesPage });
