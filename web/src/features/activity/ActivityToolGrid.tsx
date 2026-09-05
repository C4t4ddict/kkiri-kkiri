import {
  Check,
  EyeOff,
  GripVertical,
  LayoutGrid,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

const GRID_COLUMNS = 12;
const GRID_ROW_HEIGHT = 28;
const MAX_ROWS = 18;
const STORAGE_VERSION = 1;

type ToolPlacement = {
  columns: number;
  rows: number;
  visible: boolean;
};

type ToolLayout = {
  version: number;
  order: string[];
  items: Record<string, ToolPlacement>;
};

export type ActivityToolDefinition = {
  id: string;
  title: string;
  description: string;
  className: string;
  defaultColumns: number;
  defaultRows: number;
  minColumns: number;
  minRows: number;
  content: ReactNode;
};

type ResizeState = {
  pointerId: number;
  toolId: string;
  startX: number;
  startY: number;
  startColumns: number;
  startRows: number;
  columnStep: number;
  rowStep: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

const createDefaultLayout = (tools: ActivityToolDefinition[]): ToolLayout => ({
  version: STORAGE_VERSION,
  order: tools.map((tool) => tool.id),
  items: Object.fromEntries(tools.map((tool) => [tool.id, {
    columns: tool.defaultColumns,
    rows: tool.defaultRows,
    visible: true,
  }])),
});

const normalizeLayout = (value: unknown, tools: ActivityToolDefinition[]): ToolLayout => {
  const defaults = createDefaultLayout(tools);
  if (!value || typeof value !== 'object') return defaults;
  const saved = value as Partial<ToolLayout>;
  const savedItems = saved.items && typeof saved.items === 'object' ? saved.items : {};
  const knownIds = new Set(tools.map((tool) => tool.id));
  const savedOrder = Array.isArray(saved.order)
    ? [...new Set(saved.order.filter((id): id is string => typeof id === 'string' && knownIds.has(id)))]
    : [];
  const order = [...savedOrder, ...tools.map((tool) => tool.id).filter((id) => !savedOrder.includes(id))];
  const items = Object.fromEntries(tools.map((tool) => {
    const candidate = savedItems[tool.id];
    return [tool.id, {
      columns: clamp(Number.isFinite(candidate?.columns) ? Math.round(candidate.columns) : tool.defaultColumns, tool.minColumns, GRID_COLUMNS),
      rows: clamp(Number.isFinite(candidate?.rows) ? Math.round(candidate.rows) : tool.defaultRows, tool.minRows, MAX_ROWS),
      visible: typeof candidate?.visible === 'boolean' ? candidate.visible : true,
    }];
  }));
  return { version: STORAGE_VERSION, order, items };
};

const loadLayout = (storageKey: string, tools: ActivityToolDefinition[]) => {
  try {
    return normalizeLayout(JSON.parse(localStorage.getItem(storageKey) || 'null'), tools);
  } catch {
    return createDefaultLayout(tools);
  }
};

export function ActivityToolGrid({ userId, tools }: { userId?: number; tools: ActivityToolDefinition[] }) {
  const storageKey = `kkiri:activity-tool-grid:v1:${userId || 'guest'}`;
  const definitionSignature = tools.map((tool) => [
    tool.id,
    tool.defaultColumns,
    tool.defaultRows,
    tool.minColumns,
    tool.minRows,
  ].join(':')).join('|');
  const [layout, setLayout] = useState<ToolLayout>(() => loadLayout(storageKey, tools));
  const [editing, setEditing] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  useEffect(() => {
    setLayout(loadLayout(storageKey, tools));
    setEditing(false);
    setDraggedId(null);
    setDragOverId(null);
    resizeRef.current = null;
    // 도구 정의 변경은 signature로 추적하며 content의 매 렌더링에는 반응하지 않습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitionSignature, storageKey]);

  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // 브라우저 저장소가 비활성화되어도 현재 세션의 배치는 유지합니다.
    }
  }, [layout, storageKey, userId]);

  const toolMap = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [tools]);
  const orderedTools = layout.order.map((id) => toolMap.get(id)).filter((tool): tool is ActivityToolDefinition => Boolean(tool));
  const visibleTools = orderedTools.filter((tool) => layout.items[tool.id]?.visible !== false);
  const hiddenCount = orderedTools.length - visibleTools.length;

  const updatePlacement = (toolId: string, update: Partial<ToolPlacement>) => {
    setLayout((current) => ({
      ...current,
      items: {
        ...current.items,
        [toolId]: { ...current.items[toolId], ...update },
      },
    }));
  };

  const moveTool = (toolId: string, targetIndex: number) => {
    setLayout((current) => {
      const fromIndex = current.order.indexOf(toolId);
      if (fromIndex < 0) return current;
      const order = [...current.order];
      order.splice(fromIndex, 1);
      const nextIndex = clamp(targetIndex, 0, order.length);
      order.splice(nextIndex, 0, toolId);
      return { ...current, order };
    });
  };

  const dropTool = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggedId || event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) {
      setDragOverId(null);
      return;
    }
    const targetIndex = layout.order.indexOf(targetId);
    moveTool(sourceId, targetIndex);
    setAnnouncement(`${toolMap.get(sourceId)?.title || '도구'} 위치를 변경했습니다.`);
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleMoveKey = (event: KeyboardEvent, toolId: string) => {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = layout.order.indexOf(toolId);
    const backwards = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const targetIndex = clamp(currentIndex + (backwards ? -1 : 1), 0, layout.order.length - 1);
    if (targetIndex === currentIndex) return;
    moveTool(toolId, targetIndex);
    setAnnouncement(`${toolMap.get(toolId)?.title || '도구'} 순서를 ${backwards ? '앞' : '뒤'}으로 이동했습니다.`);
  };

  const beginResize = (event: PointerEvent<HTMLButtonElement>, tool: ActivityToolDefinition) => {
    if (!editing || !gridRef.current) return;
    event.preventDefault();
    const placement = layout.items[tool.id];
    const gridStyle = getComputedStyle(gridRef.current);
    const columnGap = Number.parseFloat(gridStyle.columnGap) || 0;
    const rowGap = Number.parseFloat(gridStyle.rowGap) || 0;
    const columnStep = (gridRef.current.getBoundingClientRect().width - (columnGap * (GRID_COLUMNS - 1))) / GRID_COLUMNS + columnGap;
    resizeRef.current = {
      pointerId: event.pointerId,
      toolId: tool.id,
      startX: event.clientX,
      startY: event.clientY,
      startColumns: placement.columns,
      startRows: placement.rows,
      columnStep,
      rowStep: GRID_ROW_HEIGHT + rowGap,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueResize = (event: PointerEvent<HTMLButtonElement>, tool: ActivityToolDefinition) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId || resize.toolId !== tool.id) return;
    const columns = clamp(resize.startColumns + Math.round((event.clientX - resize.startX) / resize.columnStep), tool.minColumns, GRID_COLUMNS);
    const rows = clamp(resize.startRows + Math.round((event.clientY - resize.startY) / resize.rowStep), tool.minRows, MAX_ROWS);
    updatePlacement(tool.id, { columns, rows });
  };

  const finishResize = (event: PointerEvent<HTMLButtonElement>, tool: ActivityToolDefinition) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId || resize.toolId !== tool.id) return;
    resizeRef.current = null;
    setAnnouncement(`${tool.title} 크기 조절을 완료했습니다.`);
  };

  const handleResizeKey = (event: KeyboardEvent, tool: ActivityToolDefinition) => {
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    if (!horizontal && !vertical) return;
    event.preventDefault();
    setLayout((current) => {
      const placement = current.items[tool.id];
      const columns = horizontal
        ? clamp(placement.columns + (event.key === 'ArrowRight' ? 1 : -1), tool.minColumns, GRID_COLUMNS)
        : placement.columns;
      const rows = vertical
        ? clamp(placement.rows + (event.key === 'ArrowDown' ? 1 : -1), tool.minRows, MAX_ROWS)
        : placement.rows;
      return {
        ...current,
        items: { ...current.items, [tool.id]: { ...placement, columns, rows } },
      };
    });
    setAnnouncement(`${tool.title} 크기를 그리드 한 칸 조절했습니다.`);
  };

  const resetLayout = () => {
    setLayout(createDefaultLayout(tools));
    setAnnouncement('도구 배치를 기본값으로 되돌렸습니다.');
  };

  return <section className={`activity-tools-section ${editing ? 'is-editing' : ''}`}>
    <header className="activity-tool-customizer">
      <div><span><LayoutGrid /></span><div><strong>활동 도구</strong><small>{editing ? '손잡이로 이동하고 오른쪽 아래 모서리로 크기를 조절하세요.' : '내 작업 순서에 맞게 배치할 수 있습니다.'}</small></div></div>
      <div>
        {editing && <button type="button" className="activity-tool-reset" onClick={resetLayout}><RotateCcw /> 기본 배치</button>}
        <button type="button" className={`activity-tool-edit-toggle ${editing ? 'active' : ''}`} aria-pressed={editing} onClick={() => setEditing((current) => !current)}>
          {editing ? <Check /> : <SlidersHorizontal />}{editing ? '편집 완료' : '도구 편집'}
        </button>
      </div>
    </header>

    {editing && <div className="activity-tool-catalog" aria-label="활동 도구 표시 설정">
      <span>도구 추가·숨김</span>
      <div>{orderedTools.map((tool) => {
        const visible = layout.items[tool.id]?.visible !== false;
        return <button type="button" className={visible ? 'active' : ''} aria-pressed={visible} title={tool.description} onClick={() => {
          updatePlacement(tool.id, { visible: !visible });
          setAnnouncement(`${tool.title} 도구를 ${visible ? '숨겼습니다' : '추가했습니다'}.`);
        }} key={tool.id}>{visible ? <Check /> : <Plus />}{tool.title}</button>;
      })}</div>
      {hiddenCount > 0 && <small>숨긴 도구 {hiddenCount}개</small>}
    </div>}

    <div
      className="activity-tool-grid"
      ref={gridRef}
      onDragOver={(event) => { if (editing && draggedId) event.preventDefault(); }}
      onDrop={(event) => {
        if (event.target !== event.currentTarget || !draggedId) return;
        event.preventDefault();
        moveTool(draggedId, layout.order.length);
        setAnnouncement(`${toolMap.get(draggedId)?.title || '도구'}를 마지막으로 이동했습니다.`);
        setDraggedId(null);
        setDragOverId(null);
      }}
    >
      {!visibleTools.length && <div className="activity-tool-grid-empty"><LayoutGrid /><strong>표시 중인 도구가 없습니다.</strong><span>위 도구 추가·숨김 목록에서 필요한 도구를 다시 선택하세요.</span></div>}
      {visibleTools.map((tool) => {
        const placement = layout.items[tool.id];
        const style = {
          '--tool-columns': placement.columns,
          '--tool-rows': placement.rows,
        } as CSSProperties;
        return <section
          className={`${tool.className} activity-tool-card ${draggedId === tool.id ? 'is-dragging' : ''} ${dragOverId === tool.id ? 'is-drag-over' : ''}`}
          style={style}
          onDragOver={(event) => { if (editing && draggedId && draggedId !== tool.id) { event.preventDefault(); setDragOverId(tool.id); } }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverId(null); }}
          onDrop={(event) => dropTool(event, tool.id)}
          key={tool.id}
        >
          {editing && <div className="activity-tool-card-controls">
            <button
              type="button"
              className="activity-tool-drag-handle"
              draggable
              aria-label={`${tool.title} 이동. Alt와 방향키로도 이동할 수 있습니다.`}
              title="드래그해서 위치 이동"
              onDragStart={(event) => {
                setDraggedId(tool.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', tool.id);
              }}
              onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
              onKeyDown={(event) => handleMoveKey(event, tool.id)}
            ><GripVertical /><span>{tool.title}</span></button>
            <span>{placement.columns}열 · {placement.rows}칸</span>
            <button type="button" className="activity-tool-hide" aria-label={`${tool.title} 숨기기`} title="도구 숨기기" onClick={() => updatePlacement(tool.id, { visible: false })}><EyeOff /></button>
          </div>}
          <div className="activity-tool-content">{tool.content}</div>
          {editing && <button
            type="button"
            className="activity-tool-resize-handle"
            aria-label={`${tool.title} 크기 조절. 방향키로 한 칸씩 조절할 수 있습니다.`}
            title="드래그해서 그리드 단위로 크기 조절"
            onPointerDown={(event) => beginResize(event, tool)}
            onPointerMove={(event) => continueResize(event, tool)}
            onPointerUp={(event) => finishResize(event, tool)}
            onPointerCancel={(event) => finishResize(event, tool)}
            onKeyDown={(event) => handleResizeKey(event, tool)}
          ><span /></button>}
        </section>;
      })}
    </div>
    <p className="sr-only" aria-live="polite">{announcement}</p>
  </section>;
}
