import { ReactNode, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

export type KanbanColumn = {
  id: string | number;
  label: string;
  color: string;
  meta?: string;
};

export type KanbanItem = {
  id: string | number;
  columnId: string | number;
};

type Props<T extends KanbanItem> = {
  columns: KanbanColumn[];
  items: T[];
  renderCard: (item: T) => ReactNode;
  onMove: (item: T, newColumnId: string | number) => void;
  onCardClick?: (item: T) => void;
  emptyHint?: string;
};

export default function KanbanBoard<T extends KanbanItem>({
  columns,
  items,
  renderCard,
  onMove,
  onCardClick,
  emptyHint = "Drop a card here",
}: Props<T>) {
  // 6px activation distance lets a tap-to-open coexist with drag without lag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [activeId, setActiveId] = useState<string | number | null>(null);

  const grouped: Record<string, T[]> = {};
  for (const col of columns) grouped[String(col.id)] = [];
  for (const it of items) {
    const k = String(it.columnId);
    (grouped[k] ??= []).push(it);
  }

  const findItem = (id: string | number) => items.find((it) => it.id === id);

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id);
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const item = findItem(active.id);
    if (!item) return;
    const overColId = columns.find((c) => String(c.id) === String(over.id))?.id;
    if (overColId === undefined) return;
    if (overColId === item.columnId) return;
    onMove(item, overColId);
  };

  const active = activeId !== null ? findItem(activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="overflow-x-auto scroll-thin px-4 py-4">
        <div className="flex gap-3 min-w-max">
          {columns.map((col) => (
            <Column
              key={String(col.id)}
              column={col}
              items={grouped[String(col.id)] ?? []}
              renderCard={renderCard}
              onCardClick={onCardClick}
              emptyHint={emptyHint}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {active ? (
          <div className="opacity-90 rotate-1 shadow-kanban">
            {renderCard(active)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column<T extends KanbanItem>({
  column,
  items,
  renderCard,
  onCardClick,
  emptyHint,
}: {
  column: KanbanColumn;
  items: T[];
  renderCard: (item: T) => ReactNode;
  onCardClick?: (item: T) => void;
  emptyHint: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div className="w-[280px] flex-shrink-0">
      <div
        className="bg-white rounded-t-md border-t-[3px] px-3 py-2 flex items-center justify-between"
        style={{ borderTopColor: column.color }}
      >
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
            {column.label}
          </div>
          {column.meta && (
            <div className="text-[11px] text-slate-400">{column.meta}</div>
          )}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`rounded-b-md p-2 space-y-2 min-h-[200px] transition-colors ${
          isOver ? "bg-sai-bluepale" : "bg-ui-surface"
        }`}
      >
        {items.map((it) => (
          <DraggableCard key={String(it.id)} id={it.id} onClick={() => onCardClick?.(it)}>
            {renderCard(it)}
          </DraggableCard>
        ))}
        {items.length === 0 && (
          <div className="text-[11px] text-slate-400 italic text-center py-8">
            {emptyHint}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  id,
  onClick,
  children,
}: {
  id: string | number;
  onClick?: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (!isDragging) onClick?.();
        e.stopPropagation();
      }}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: isDragging ? "grabbing" : "grab" }}
    >
      {children}
    </div>
  );
}
