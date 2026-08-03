import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FindingCard } from "./FindingCard";
import { cn } from "@/lib/utils";
import { SEVERITIES, type FieldStatus, type Finding, type Lang, type Severity } from "@/lib/types";
import { SEVERITY_CLASS, SEVERITY_LABEL, blankFinding, bySeverity, relocate } from "@/lib/report";

interface Props {
  findings: Finding[];
  lang: Lang;
  sourceLang: Lang;
  statusOf: (path: string) => FieldStatus | undefined;
  onChange: (next: Finding[]) => void;
  onMoved: (message: string) => void;
  disabled?: boolean;
}

function Column({
  severity,
  children,
  count,
}: {
  severity: Severity;
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${severity}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-32 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors",
        isOver ? "border-primary/60 bg-accent/40" : "border-border/60"
      )}
    >
      <div className="flex items-baseline justify-between px-1">
        <h3 className={cn("text-xs font-semibold tracking-wide uppercase", SEVERITY_CLASS[severity])}>
          {SEVERITY_LABEL[severity]}
        </h3>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      {children}
    </div>
  );
}

export function FindingsBoard({
  findings,
  lang,
  sourceLang,
  statusOf,
  onChange,
  onMoved,
  disabled,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const active = findings.find((f) => f.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over) return;

    const dragged = findings.find((f) => f.id === a.id);
    if (!dragged) return;

    const overId = String(over.id);
    // A drop lands either on a card (reorder next to it) or on the column
    // background (append to that severity).
    const targetSeverity = overId.startsWith("column:")
      ? (overId.slice(7) as Severity)
      : (findings.find((f) => f.id === overId)?.severity ?? dragged.severity);

    const next = relocate(
      findings,
      String(a.id),
      targetSeverity,
      overId.startsWith("column:") ? null : overId
    );
    if (next === findings) return;

    onChange(next);

    // Moving between columns rewrites the finding's severity — that changes the
    // report's data and its cover counts, so say so rather than let it pass as
    // a cosmetic reorder.
    if (targetSeverity !== dragged.severity) {
      onMoved(
        `"${dragged.title?.[sourceLang] || dragged.id}" is now ${SEVERITY_LABEL[targetSeverity]}`
      );
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        {SEVERITIES.map((sev) => {
          const items = bySeverity(findings, sev);
          return (
            <Column key={sev} severity={sev} count={items.length}>
              <SortableContext
                items={items.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((f) => (
                  <FindingCard
                    key={f.id}
                    finding={f}
                    lang={lang}
                    sourceLang={sourceLang}
                    statusOf={statusOf}
                    disabled={disabled}
                    onChange={(next) =>
                      onChange(findings.map((x) => (x.id === f.id ? next : x)))
                    }
                    onDelete={() => onChange(findings.filter((x) => x.id !== f.id))}
                  />
                ))}
              </SortableContext>

              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="mt-auto justify-start text-xs text-muted-foreground"
                onClick={() =>
                  onChange([...findings, blankFinding(findings.map((f) => f.id), sev)])
                }
              >
                <Plus className="size-3.5" /> Add
              </Button>
            </Column>
          );
        })}
      </div>

      <DragOverlay>
        {active && (
          <div className="rounded-lg border bg-card p-2 text-sm shadow-lg">
            {active.title?.[lang] || active.title?.[sourceLang] || active.id}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
