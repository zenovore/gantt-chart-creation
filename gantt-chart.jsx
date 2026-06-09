// === Gantt Chart Components ===
const { useState, useRef, useEffect, useMemo, useCallback } = React;

const ROW_HEIGHT = 40;
const LEFT_W = 340;
const HEADER_H = 52;

// --- Left Panel Row ---
function LeftPanelRow({ row, isExpanded, onToggle, streamColors }) {
  const isSub = row.isSubtask;
  const isTask = row.type === 'task';
  const isStreamHeader = row.type === 'stream-header';

  if (isStreamHeader) {
    return (
      <div className="left-cell stream-header-cell" style={{height: ROW_HEIGHT}}>
        <span className="stream-pill" style={{background: streamColors[row.name] || '#888'}}>{row.name}</span>
      </div>
    );
  }

  return (
    <div className={`left-cell ${isSub ? 'subtask' : 'task'}`} style={{height: ROW_HEIGHT}} title={`${row.id} — ${row.name}`}>
      {isTask && row.hasChildren ? (
        <button className="expand-btn" onClick={() => onToggle(row.id)}>
          {isExpanded ? '▾' : '▸'}
        </button>
      ) : isTask ? (
        <span style={{width: 20, flexShrink: 0}}></span>
      ) : null}
      <span className="task-id">{row.id}</span>
      <span className="task-name">{row.name}</span>
      {!isSub && (
        <span className="stream-pill" style={{background: streamColors[row.stream] || '#888'}}>{row.stream}</span>
      )}
    </div>
  );
}

// --- Timeline Header ---
function TimelineHeader({ data, dayWidth, chartWidth }) {
  const months = useMemo(() => getMonthHeaders(data.timelineStart, data.timelineEnd, dayWidth), [data, dayWidth]);
  const weeks = useMemo(() => getWeekHeaders(data.timelineStart, data.timelineEnd, dayWidth), [data, dayWidth]);

  return (
    <div className="timeline-header" style={{width: chartWidth}}>
      <div className="timeline-months">
        {months.map((m, i) => (
          <div key={i} className="timeline-month" style={{position:'absolute', left: m.left, width: m.width}}>
            {m.width > 60 ? m.label : m.width > 35 ? m.short : ''}
          </div>
        ))}
      </div>
      <div className="timeline-weeks">
        {weeks.map((w, i) => (
          <div key={i} className="timeline-week" style={{position:'absolute', left: w.left, width: w.width}}>
            {w.width > 24 ? w.label : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Grid Lines ---
function GridLines({ data, dayWidth, chartWidth, totalHeight }) {
  const weeks = useMemo(() => getWeekHeaders(data.timelineStart, data.timelineEnd, dayWidth), [data, dayWidth]);
  return (
    <React.Fragment>
      {weeks.map((w, i) => (
        <div key={i} className="grid-line" style={{left: w.left, height: totalHeight}}></div>
      ))}
    </React.Fragment>
  );
}

// --- Task Bar ---
function TaskBar({ row, data, dayWidth, onHover, onLeave }) {
  if (!row.startDate || !row.endDate) return null;
  const left = diffDays(data.timelineStart, row.startDate) * dayWidth;
  const width = Math.max(3, diffDays(row.startDate, row.endDate) * dayWidth);
  const fillW = width * (row.progress / 100);
  const color = data.streamColors[row.stream] || '#888';
  const ragColor = RAG_COLORS[row.rag];
  const isParent = row.type === 'task' && row.hasChildren;

  return (
    <div className="task-bar"
      style={{left, width, height: isParent ? ROW_HEIGHT - 16 : ROW_HEIGHT - 14, top: isParent ? 8 : 7}}
      onMouseEnter={(e) => onHover(row, e)}
      onMouseLeave={onLeave}>
      <div className="bar-bg" style={{background: color}}></div>
      <div className="bar-fill" style={{width: fillW, background: color}}></div>
      {width > 32 && (
        <span className="bar-label">{row.progress}%</span>
      )}
      <span className="rag-dot" style={{background: ragColor}} title={RAG_LABELS[row.rag]}></span>
    </div>
  );
}

// --- Today Line ---
function TodayLine({ data, dayWidth, totalHeight }) {
  const todayX = diffDays(data.timelineStart, data.today) * dayWidth;
  if (todayX < 0) return null;
  return (
    <React.Fragment>
      <div className="today-line" style={{left: todayX, height: totalHeight}}>
        <div className="today-label">Today {formatDate(data.today)}</div>
      </div>
    </React.Fragment>
  );
}

// --- Dependency Arrows ---
function DependencyArrows({ flatRows, data, dayWidth, rowIndexMap }) {
  const paths = useMemo(() => {
    const result = [];
    flatRows.forEach((row, targetIdx) => {
      if (!row.dependencies || !row.startDate) return;
      row.dependencies.forEach(depId => {
        const sourceIdx = rowIndexMap[depId];
        if (sourceIdx === undefined) return;
        const sourceRow = flatRows[sourceIdx];
        if (!sourceRow || !sourceRow.endDate) return;

        const sx = diffDays(data.timelineStart, sourceRow.endDate) * dayWidth;
        const tx = diffDays(data.timelineStart, row.startDate) * dayWidth;
        const sy = sourceIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const ty = targetIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

        const gap = tx - sx;
        let d;
        if (gap >= 12) {
          const mx = sx + gap * 0.5;
          d = `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
        } else {
          const ox = sx + 12;
          const midY = (sy + ty) / 2;
          d = `M${sx},${sy} H${ox} V${midY} H${tx - 8} V${ty} H${tx}`;
        }
        result.push({ d, key: `${sourceRow.id}->${row.id}` });
      });
    });
    return result;
  }, [flatRows, data, dayWidth, rowIndexMap]);

  const totalH = flatRows.length * ROW_HEIGHT;
  const totalW = diffDays(data.timelineStart, data.timelineEnd) * dayWidth;

  return (
    <svg className="dep-arrows" style={{position:'absolute', top:0, left:0, width: totalW, height: totalH, pointerEvents:'none', zIndex:8}}>
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-tertiary)"/>
        </marker>
      </defs>
      {paths.map(p => (
        <path key={p.key} d={p.d} fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" markerEnd="url(#arrowhead)" opacity="0.6"/>
      ))}
    </svg>
  );
}

// --- Tooltip Card ---
function TooltipCard({ item, position }) {
  if (!item) return null;
  const { x, y } = position;
  const ragColor = RAG_COLORS[item.rag];
  const ragBg = RAG_BG[item.rag];

  return ReactDOM.createPortal(
    <div className="tooltip-card" style={{left: x, top: y}}>
      <div className="tt-header">{item.isSubtask ? item.name : item.name}</div>
      <div className="tt-row"><span className="tt-label">ID</span><span style={{fontFamily:'monospace'}}>{item.id}</span></div>
      {item.isSubtask && <div className="tt-row"><span className="tt-label">Parent</span><span>{item.taskName} ({item.taskId})</span></div>}
      <div className="tt-row"><span className="tt-label">Stream</span><span>{item.stream}</span></div>
      {item.description && <div className="tt-row" style={{flexDirection:'column'}}><span className="tt-label">Description</span><span style={{color:'var(--text-secondary)', marginTop: 2, lineHeight: 1.4}}>{item.description}</span></div>}
      <div style={{display:'flex', gap: 16, marginTop: 4}}>
        <div className="tt-row"><span className="tt-label">Start</span><span>{formatDate(item.startDate)}</span></div>
        <div className="tt-row"><span className="tt-label">End</span><span>{formatDate(item.endDate)}</span></div>
      </div>
      <div className="tt-row"><span className="tt-label">Progress</span>
        <div style={{display:'flex',alignItems:'center',gap:6,flex:1}}>
          <div style={{flex:1,height:6,background:'var(--bg-tertiary)',borderRadius:3,overflow:'hidden'}}>
            <div style={{width:`${item.progress}%`,height:'100%',background:'var(--accent)',borderRadius:3}}></div>
          </div>
          <span style={{fontWeight:600}}>{item.progress}%</span>
        </div>
      </div>
      <div className="tt-row"><span className="tt-label">Status</span>
        <span className="tt-rag" style={{background: ragBg, color: ragColor}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:ragColor,display:'inline-block'}}></span>
          {RAG_LABELS[item.rag]}
        </span>
      </div>
      {item.dependencies && item.dependencies.length > 0 && (
        <div className="tt-row"><span className="tt-label">Depends on</span><span style={{fontFamily:'monospace'}}>{item.dependencies.join(', ')}</span></div>
      )}
    </div>,
    document.body
  );
}

// --- Main Gantt Chart ---
function GanttChart({ data, flatRows, expanded, toggleExpand, dayWidth, showDeps, onExpandAll, onCollapseAll }) {
  const scrollRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({x: 0, y: 0});

  const chartWidth = useMemo(() => {
    if (!data.timelineStart || !data.timelineEnd) return 800;
    return diffDays(data.timelineStart, data.timelineEnd) * dayWidth;
  }, [data, dayWidth]);

  const rowIndexMap = useMemo(() => {
    const map = {};
    flatRows.forEach((r, i) => { map[r.id] = i; });
    return map;
  }, [flatRows]);

  const totalHeight = flatRows.length * ROW_HEIGHT;

  const allExpanded = useMemo(() => {
    const expandable = flatRows.filter(r => r.type === 'task' && r.hasChildren);
    return expandable.length > 0 && expandable.every(r => expanded.has(r.id));
  }, [flatRows, expanded]);

  const handleBarHover = useCallback((row, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let tx = rect.right + 12;
    let ty = rect.top - 20;
    if (tx + 320 > window.innerWidth) tx = rect.left - 332;
    if (ty + 300 > window.innerHeight) ty = window.innerHeight - 310;
    if (ty < 10) ty = 10;
    setTooltip(row);
    setTooltipPos({x: tx, y: ty});
  }, []);

  const handleBarLeave = useCallback(() => setTooltip(null), []);

  if (!data.timelineStart) return null;

  return (
    <div className="gantt-container" ref={scrollRef}>
      <div className="gantt-inner" style={{minWidth: LEFT_W + chartWidth + 40}}>
        {/* Header row */}
        <div className="gantt-header-row">
          <div className="gantt-corner">
            {onExpandAll && (
              <button className="expand-btn" onClick={allExpanded ? onCollapseAll : onExpandAll} title={allExpanded ? 'Collapse all' : 'Expand all'}>
                {allExpanded ? '▾' : '▸'}
              </button>
            )}
            <span style={{flex:1}}>Task</span>
            <span style={{width:60, textAlign:'right'}}>Stream</span>
          </div>
          <div className="gantt-timeline-wrap" style={{position:'relative', width: chartWidth, height: HEADER_H}}>
            <TimelineHeader data={data} dayWidth={dayWidth} chartWidth={chartWidth} />
          </div>
        </div>

        {/* Body */}
        <div className="gantt-body" style={{position:'relative'}}>
          {flatRows.length === 0 ? (
            <div style={{display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 0', color:'var(--text-tertiary)', fontSize:13}}>
              No tasks match current filters
            </div>
          ) : (
            <React.Fragment>
              {flatRows.map((row, i) => (
                <div key={row.id + '-' + i} className={`gantt-row ${i % 2 === 0 ? 'even' : ''}`}>
                  <div className="gantt-left-cell">
                    <LeftPanelRow row={row} isExpanded={expanded.has(row.id)} onToggle={toggleExpand} streamColors={data.streamColors} />
                  </div>
                  <div className="gantt-chart-cell" style={{width: chartWidth, minWidth: chartWidth, position:'relative', height: ROW_HEIGHT}}>
                    {row.type !== 'stream-header' && (
                      <TaskBar row={row} data={data} dayWidth={dayWidth} onHover={handleBarHover} onLeave={handleBarLeave} />
                    )}
                  </div>
                </div>
              ))}

              <div style={{position:'absolute', top:0, left: LEFT_W, width: chartWidth, height: totalHeight, pointerEvents:'none'}}>
                <GridLines data={data} dayWidth={dayWidth} chartWidth={chartWidth} totalHeight={totalHeight} />
                <TodayLine data={data} dayWidth={dayWidth} totalHeight={totalHeight} />
                {showDeps && <DependencyArrows flatRows={flatRows} data={data} dayWidth={dayWidth} rowIndexMap={rowIndexMap} />}
              </div>
            </React.Fragment>
          )}
        </div>
      </div>

      {/* Tooltip */}
      <TooltipCard item={tooltip} position={tooltipPos} />
    </div>
  );
}

Object.assign(window, { GanttChart });
