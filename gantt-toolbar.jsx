// === Toolbar Components ===
const { useState, useRef, useEffect, useCallback } = React;

// --- Dropdown wrapper ---
function Dropdown({ label, children, count }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handler = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      let left = rect.left;
      if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
      setPos({ top: rect.bottom, left });
    }
  }, [open]);

  return (
    <div className="dropdown">
      <button className="btn btn-sm" ref={btnRef} onClick={() => setOpen(!open)}>
        {label}{count != null && count > 0 ? ` (${count})` : ''}
        <svg width="10" height="10" viewBox="0 0 10 10" style={{marginLeft: 2, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s'}}>
          <path d="M2 4 L5 7 L8 4" stroke="currentColor" fill="none" strokeWidth="1.5"/>
        </svg>
      </button>
      {open && ReactDOM.createPortal(
        <div className="dropdown-menu" ref={menuRef} style={{position: 'fixed', top: pos.top, left: pos.left}}>
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}

// --- Stream Filter ---
function StreamFilter({ streams, streamColors, selected, onChange }) {
  const allSelected = selected === null;
  const activeCount = allSelected ? 0 : streams.length - selected.size;
  const toggle = (s) => {
    if (allSelected) {
      const next = new Set(streams); next.delete(s); onChange(next);
    } else {
      const next = new Set(selected);
      if (next.has(s)) next.delete(s); else next.add(s);
      onChange(next.size === streams.length ? null : next);
    }
  };
  const selectAll = () => onChange(allSelected ? new Set() : null);
  return (
    <Dropdown label="Streams" count={activeCount}>
      <div className="dropdown-item" onClick={selectAll}>
        <input type="checkbox" checked={allSelected} readOnly style={{accentColor: 'var(--accent)', pointerEvents: 'none'}} />
        <span style={{fontWeight: 600}}>All Streams</span>
      </div>
      <div style={{height: 1, background: 'var(--border)', margin: '4px 0'}}></div>
      {streams.map(s => (
        <div key={s} className="dropdown-item" onClick={() => toggle(s)}>
          <input type="checkbox" checked={allSelected || selected.has(s)} readOnly style={{accentColor: streamColors[s], pointerEvents: 'none'}} />
          <span className="stream-pill" style={{background: streamColors[s], fontSize: 10, padding: '1px 6px'}}>{s}</span>
        </div>
      ))}
    </Dropdown>
  );
}

// --- RAG Filter ---
function RAGFilter({ selected, onChange }) {
  const allSelected = selected === null;
  const toggle = (rag) => {
    if (allSelected) {
      const next = new Set(['green','amber','red']); next.delete(rag); onChange(next);
    } else {
      const next = new Set(selected);
      if (next.has(rag)) next.delete(rag); else next.add(rag);
      onChange(next.size === 3 ? null : next);
    }
  };
  return (
    <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
      {['green','amber','red'].map(r => (
        <button key={r}
          className={`rag-pill ${r} ${!allSelected && !selected.has(r) ? 'inactive' : ''}`}
          onClick={() => toggle(r)}>
          <span style={{width:6,height:6,borderRadius:'50%',background: RAG_COLORS[r],display:'inline-block'}}></span>
          {RAG_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

// --- Search Box ---
function SearchBox({ value, onChange }) {
  return (
    <div className="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
      </svg>
      <input type="text" placeholder="Search tasks..." value={value} onChange={e => onChange(e.target.value)} />
      {value && <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',fontSize:14,padding:0,lineHeight:1}} onClick={() => onChange('')}>✕</button>}
    </div>
  );
}

// --- Toggle ---
function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle" onClick={(e) => { e.preventDefault(); onChange(!checked); }}>
      <div className={`toggle-track ${checked ? 'active' : ''}`}>
        <div className="toggle-thumb"></div>
      </div>
      {label}
    </label>
  );
}

// --- Group By Segmented ---
function GroupByControl({ value, onChange }) {
  return (
    <div className="segmented">
      <button className={value === 'hierarchy' ? 'active' : ''} onClick={() => onChange('hierarchy')}>Tasks</button>
      <button className={value === 'stream' ? 'active' : ''} onClick={() => onChange('stream')}>Streams</button>
    </div>
  );
}

// --- Zoom Control ---
function ZoomControl({ dayWidth, onChange, onFit }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap: 2}}>
      <button className="btn btn-sm" onClick={() => onChange(Math.max(1.5, dayWidth / 1.4))} title="Zoom out">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button className="btn btn-sm" onClick={onFit} title="Fit to screen">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>
      </button>
      <button className="btn btn-sm" onClick={() => onChange(Math.min(30, dayWidth * 1.4))} title="Zoom in">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>
  );
}

// --- Theme Toggle ---
function ThemeToggle({ theme, onChange }) {
  const isDark = theme === 'dark';
  return (
    <button className="btn btn-sm btn-icon" onClick={() => onChange(isDark ? 'light' : 'dark')} title={isDark ? 'Light mode' : 'Dark mode'}
      style={{fontSize: 16, padding: '4px 6px'}}>
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}

// --- Legend ---
function Legend({ streams, streamColors }) {
  if (!streams || !streams.length) return null;
  return (
    <div className="legend">
      <span style={{fontWeight: 600, color: 'var(--text-secondary)', marginRight: 4}}>Streams</span>
      {streams.map(s => (
        <div key={s} className="legend-item">
          <span className="legend-dot" style={{background: streamColors[s]}}></span>
          <span>{s}</span>
        </div>
      ))}
      <span style={{margin: '0 8px', color: 'var(--border)'}}>|</span>
      <span style={{fontWeight: 600, color: 'var(--text-secondary)', marginRight: 4}}>Status</span>
      {['green','amber','red'].map(r => (
        <div key={r} className="legend-item">
          <span className="legend-dot" style={{background: RAG_COLORS[r]}}></span>
          <span>{RAG_LABELS[r]}</span>
        </div>
      ))}
    </div>
  );
}

// --- Toolbar ---
function Toolbar({
  hasData, streams, streamColors,
  selectedStreams, onStreamChange,
  selectedRAG, onRAGChange,
  searchQuery, onSearchChange,
  groupBy, onGroupByChange,
  hideCompleted, onHideCompletedChange,
  showDeps, onShowDepsChange,
  dayWidth, onDayWidthChange,
  theme, onThemeChange,
  onUpload, onLoadSample, onExportSVG,
  onFitToScreen, onDownloadCSV,
  onCompareUpload, onClearCompare, compareFileName,
  taskCount, subtaskCount,
  notesOpen, onToggleNotes,
  currentView, onViewChange,
}) {
  const fileRef = useRef(null);
  const compareRef = useRef(null);
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (file) onUpload(file);
    e.target.value = '';
  };
  const handleCompareFile = (e) => {
    const file = e.target.files[0];
    if (file) onCompareUpload(file);
    e.target.value = '';
  };

  return (
    <div className="toolbar-wrap">
      <div className="top-bar">
        <h1>Gantt Chart</h1>
        <div style={{flex:1}}></div>
        {hasData && <span style={{fontSize:11, color:'var(--text-tertiary)'}}>
          {taskCount} epics · {subtaskCount} items
        </span>}
        {hasData && !compareFileName && (
          <button className="btn btn-sm" onClick={() => compareRef.current.click()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="3" x2="10" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/><line x1="21" y1="21" x2="14" y2="14"/></svg>
            Compare...
          </button>
        )}
        {hasData && compareFileName && (
          <button className="btn btn-sm btn-primary" onClick={onClearCompare} title="Clear comparison">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="3" x2="10" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/><line x1="21" y1="21" x2="14" y2="14"/></svg>
            vs {compareFileName} ✕
          </button>
        )}
        <input ref={compareRef} type="file" accept=".csv" onChange={handleCompareFile} style={{display:'none'}} />
        <button className="btn btn-sm btn-primary" onClick={() => fileRef.current.click()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          Upload CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{display:'none'}} />
        {!hasData && <button className="btn btn-sm" onClick={onLoadSample}>Load Sample</button>}
        {hasData && (
          <button className={`btn btn-sm ${currentView === 'issues' ? 'btn-primary' : ''}`}
            onClick={() => onViewChange(currentView === 'issues' ? 'gantt' : 'issues')}
            title="Issues & Blockers tracker">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Issues
          </button>
        )}
        {hasData && (
          <button className={`btn btn-sm ${notesOpen ? 'btn-primary' : ''}`} onClick={onToggleNotes} title="Daily notes panel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Notes
          </button>
        )}
        <ThemeToggle theme={theme} onChange={onThemeChange} />
      </div>
      {hasData && (
        <div className="filter-bar">
          <StreamFilter streams={streams} streamColors={streamColors} selected={selectedStreams} onChange={onStreamChange} />
          <RAGFilter selected={selectedRAG} onChange={onRAGChange} />
          <div style={{width: 1, height: 24, background: 'var(--border)'}}></div>
          <SearchBox value={searchQuery} onChange={onSearchChange} />
          <div style={{width: 1, height: 24, background: 'var(--border)'}}></div>
          <GroupByControl value={groupBy} onChange={onGroupByChange} />
          <div style={{width: 1, height: 24, background: 'var(--border)'}}></div>
          <Toggle label="Hide done" checked={hideCompleted} onChange={onHideCompletedChange} />
          <Toggle label="Arrows" checked={showDeps} onChange={onShowDepsChange} />
          <div style={{width: 1, height: 24, background: 'var(--border)'}}></div>
          <ZoomControl dayWidth={dayWidth} onChange={onDayWidthChange} onFit={onFitToScreen} />
          <div style={{flex:1}}></div>
          <button className="btn btn-sm" onClick={onDownloadCSV}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Download CSV
          </button>
          <button className="btn btn-sm" onClick={onExportSVG}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export SVG
          </button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Toolbar, Legend, Toggle, SearchBox });
