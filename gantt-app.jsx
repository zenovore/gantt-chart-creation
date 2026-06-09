// === Main App ===
const { useState, useMemo, useCallback, useEffect } = React;

function flattenRows(tasks, expanded, groupBy) {
  const rows = [];
  if (groupBy === 'stream') {
    const byStream = {};
    tasks.forEach(t => {
      if (!byStream[t.stream]) byStream[t.stream] = [];
      byStream[t.stream].push(t);
    });
    Object.keys(byStream).sort().forEach(stream => {
      rows.push({ type: 'stream-header', name: stream, id: `sh-${stream}`, isSubtask: false });
      byStream[stream].forEach(task => {
        rows.push({ ...task, type: 'task', hasChildren: task.subtasks.length > 0 });
        if (expanded.has(task.id)) {
          task.subtasks.forEach(st => rows.push({ ...st, type: 'subtask' }));
        }
      });
    });
  } else {
    tasks.forEach(task => {
      rows.push({ ...task, type: 'task', hasChildren: task.subtasks.length > 0 });
      if (expanded.has(task.id)) {
        task.subtasks.forEach(st => rows.push({ ...st, type: 'subtask' }));
      }
    });
  }
  return rows;
}

function applyFilters(tasks, filters) {
  return tasks.map(task => {
    const subs = task.subtasks.filter(st => {
      if (filters.hideCompleted && st.progress >= 100) return false;
      if (filters.selectedRAG && !filters.selectedRAG.has(st.rag)) return false;
      return true;
    });

    return { ...task, subtasks: subs };
  }).filter(task => {
    if (filters.selectedStreams && !filters.selectedStreams.has(task.stream)) return false;
    if (filters.hideCompleted && task.progress >= 100 && task.subtasks.every(s => s.progress >= 100)) return false;

    if (filters.selectedRAG) {
      const taskMatch = filters.selectedRAG.has(task.rag);
      const subMatch = task.subtasks.some(s => filters.selectedRAG.has(s.rag));
      if (!taskMatch && !subMatch) return false;
    }

    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const m = task.name.toLowerCase().includes(q) || task.id.toLowerCase().includes(q);
      const sm = task.subtasks.some(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
      if (!m && !sm) return false;
    }

    return true;
  });
}

function App() {
  const [rawData, setRawData] = useState(null);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('gantt-theme') || 'light');
  const [selectedStreams, setSelectedStreams] = useState(null);
  const [selectedRAG, setSelectedRAG] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [showDeps, setShowDeps] = useState(true);
  const [groupBy, setGroupBy] = useState('hierarchy');
  const [expanded, setExpanded] = useState(new Set());
  const [dayWidth, setDayWidth] = useState(5);

  // Theme persistence
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gantt-theme', theme);
  }, [theme]);

  // Process CSV data
  const processedData = useMemo(() => {
    if (!rawData) return null;
    return processCSVData(rawData);
  }, [rawData]);

  // Auto-expand all tasks on first load and calculate dayWidth
  useEffect(() => {
    if (processedData) {
      const ids = new Set(processedData.tasks.map(t => t.id));
      setExpanded(ids);
      // Auto-scale dayWidth
      if (processedData.timelineStart && processedData.timelineEnd) {
        const totalDays = diffDays(processedData.timelineStart, processedData.timelineEnd);
        const availWidth = window.innerWidth - LEFT_W - 60;
        const auto = Math.max(2, Math.min(20, Math.floor(availWidth / totalDays)));
        setDayWidth(auto);
      }
    }
  }, [processedData]);

  // Filter and flatten
  const filteredTasks = useMemo(() => {
    if (!processedData) return [];
    return applyFilters(processedData.tasks, { selectedStreams, selectedRAG, searchQuery, hideCompleted });
  }, [processedData, selectedStreams, selectedRAG, searchQuery, hideCompleted]);

  const flatRows = useMemo(() => flattenRows(filteredTasks, expanded, groupBy), [filteredTasks, expanded, groupBy]);

  const toggleExpand = useCallback((id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (processedData) setExpanded(new Set(processedData.tasks.map(t => t.id)));
  }, [processedData]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const handleFitToScreen = useCallback(() => {
    if (processedData && processedData.timelineStart && processedData.timelineEnd) {
      const totalDays = diffDays(processedData.timelineStart, processedData.timelineEnd);
      const availWidth = window.innerWidth - LEFT_W - 60;
      setDayWidth(Math.max(2, Math.min(20, Math.floor(availWidth / totalDays))));
    }
  }, [processedData]);

  // CSV upload handler
  const handleUpload = useCallback((file) => {
    setError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          setError('CSV file is empty or could not be parsed.');
          return;
        }
        const headers = Object.keys(results.data[0]);
        const validation = validateCSVColumns(headers);
        if (!validation.valid) {
          setError(`Missing required columns: ${validation.missing.join(', ')}`);
          return;
        }
        // Validate dates
        let badRows = 0;
        results.data.forEach((row, i) => {
          if (row.start_date && !parseDate(row.start_date)) badRows++;
          if (row.end_date && !parseDate(row.end_date)) badRows++;
        });
        if (badRows > 0) {
          setError(`${badRows} date(s) could not be parsed. Expected format: DD-MMM-YYYY (e.g. 15-Jan-2026)`);
          return;
        }
        setRawData(results.data);
        setSelectedStreams(null);
        setSelectedRAG(null);
        setSearchQuery('');
      },
      error: (err) => setError(`Parse error: ${err.message}`),
    });
  }, []);

  // Load sample
  const handleLoadSample = useCallback(() => {
    setError(null);
    const parsed = Papa.parse(SAMPLE_CSV_TEXT, { header: true, skipEmptyLines: true });
    setRawData(parsed.data);
  }, []);

  // SVG export
  const handleExportSVG = useCallback(() => {
    if (!processedData) return;
    const svg = generateSVGExport(flatRows, processedData, dayWidth);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'gantt-chart.svg';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [processedData, flatRows, dayWidth]);

  // Drag and drop
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleUpload(file);
    else setError('Please drop a .csv file');
  }, [handleUpload]);

  const taskCount = filteredTasks.length;
  const subtaskCount = filteredTasks.reduce((a, t) => a + t.subtasks.length, 0);

  return (
    <div className="app" onDragOver={handleDragOver} onDrop={handleDrop}>
      <Toolbar
        hasData={!!processedData}
        streams={processedData ? processedData.streams : []}
        streamColors={processedData ? processedData.streamColors : {}}
        selectedStreams={selectedStreams} onStreamChange={setSelectedStreams}
        selectedRAG={selectedRAG} onRAGChange={setSelectedRAG}
        searchQuery={searchQuery} onSearchChange={setSearchQuery}
        groupBy={groupBy} onGroupByChange={setGroupBy}
        hideCompleted={hideCompleted} onHideCompletedChange={setHideCompleted}
        showDeps={showDeps} onShowDepsChange={setShowDeps}
        dayWidth={dayWidth} onDayWidthChange={setDayWidth}
        theme={theme} onThemeChange={setTheme}
        onUpload={handleUpload} onLoadSample={handleLoadSample}
        onExportSVG={handleExportSVG}
        onFitToScreen={handleFitToScreen}
        taskCount={taskCount} subtaskCount={subtaskCount}
      />
      {processedData && <Legend streams={processedData.streams} streamColors={processedData.streamColors} />}
      {error && (
        <div className="error-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
          <button style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:'inherit',fontSize:14}} onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {!processedData ? (
        <div className="upload-area">
          <div className="upload-dropzone" onClick={() => document.querySelector('input[type=file]').click()}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{marginBottom: 8}}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <h2>Upload a CSV file</h2>
            <p>Drag & drop or click to browse</p>
            <p style={{marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)'}}>
              Required columns: task_id, subtask_id, task, subtask, stream, description, start_date, end_date, progress, dependencies
            </p>
          </div>
          <button className="btn" onClick={handleLoadSample}>
            Or load sample data to explore
          </button>
        </div>
      ) : (
        <GanttChart
          data={processedData}
          flatRows={flatRows}
          expanded={expanded}
          toggleExpand={toggleExpand}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          dayWidth={dayWidth}
          showDeps={showDeps}
        />
      )}
    </div>
  );
}

const LEFT_W = 340;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
