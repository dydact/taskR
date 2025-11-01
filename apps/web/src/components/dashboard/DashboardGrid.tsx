import React, { useCallback, useMemo } from "react";
import { DndContext, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DashboardWidget } from "../../types/dashboard";

const GRID_COLUMNS = 12;

export const packDashboardWidgets = (widgets: DashboardWidget[]): DashboardWidget[] => {
  let cursorX = 0;
  let cursorY = 0;
  let currentRowHeight = 1;

  return widgets.map((widget) => {
    const width = Math.max(1, Math.min(widget.position.w || 4, GRID_COLUMNS));
    const height = Math.max(1, widget.position.h || 3);

    if (cursorX + width > GRID_COLUMNS) {
      cursorX = 0;
      cursorY += currentRowHeight;
      currentRowHeight = height;
    } else {
      currentRowHeight = Math.max(currentRowHeight, height);
    }

    const packed: DashboardWidget = {
      ...widget,
      position: {
        ...widget.position,
        x: cursorX,
        y: cursorY,
        w: width,
        h: height
      }
    };

    cursorX += width;
    return packed;
  });
};

type DashboardGridProps = {
  widgets: DashboardWidget[];
  isEditing: boolean;
  onLayoutChange(nextWidgets: DashboardWidget[]): void;
  renderWidget(widget: DashboardWidget): React.ReactNode;
};

const computeGridStyle = (widget: DashboardWidget): React.CSSProperties => ({
  gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
  gridRow: `${widget.position.y + 1} / span ${widget.position.h}`
});

type SortableWidgetProps = {
  widget: DashboardWidget;
  isEditing: boolean;
  renderWidget(widget: DashboardWidget): React.ReactNode;
};

const SortableWidget: React.FC<SortableWidgetProps> = ({ widget, isEditing, renderWidget }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.widget_id,
    disabled: !isEditing
  });

  const style: React.CSSProperties = {
    ...computeGridStyle(widget),
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined
  };

  return (
    <div ref={setNodeRef} className={`dashboard-card${isDragging ? " is-dragging" : ""}`} style={style}>
      <header className="dashboard-card-header">
        <h3>{widget.title}</h3>
        {isEditing && (
          <button
            type="button"
            className="dashboard-card-handle"
            aria-label="Drag widget"
            {...attributes}
            {...listeners}
          >
            ⋮⋮
          </button>
        )}
      </header>
      <div className="dashboard-card-body">{renderWidget(widget)}</div>
    </div>
  );
};

export const DashboardGrid: React.FC<DashboardGridProps> = ({
  widgets,
  isEditing,
  onLayoutChange,
  renderWidget
}) => {
  const preparedWidgets = useMemo(
    () => (isEditing ? packDashboardWidgets(widgets) : widgets),
    [widgets, isEditing]
  );

  const itemIds = useMemo(() => preparedWidgets.map((widget) => widget.widget_id), [preparedWidgets]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      const activeIndex = itemIds.indexOf(active.id as string);
      const overIndex = itemIds.indexOf(over.id as string);
      if (activeIndex === -1 || overIndex === -1) {
        return;
      }
      const reordered = arrayMove(preparedWidgets, activeIndex, overIndex);
      const normalized = packDashboardWidgets(reordered);
      onLayoutChange(normalized);
    },
    [preparedWidgets, itemIds, onLayoutChange]
  );

  const gridStyle: React.CSSProperties = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`
    }),
    []
  );

  if (!isEditing) {
    return (
      <div className="dashboard-grid" style={gridStyle}>
        {preparedWidgets.map((widget) => (
          <div key={widget.widget_id} className="dashboard-card" style={computeGridStyle(widget)}>
            <header className="dashboard-card-header">
              <h3>{widget.title}</h3>
            </header>
            <div className="dashboard-card-body">{renderWidget(widget)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds}>
        <div className="dashboard-grid dashboard-grid--editing" style={gridStyle}>
          {preparedWidgets.map((widget) => (
            <SortableWidget
              key={widget.widget_id}
              widget={widget}
              isEditing={isEditing}
              renderWidget={renderWidget}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
