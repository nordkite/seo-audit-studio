import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { I18nField } from "./I18nField";
import { cn } from "@/lib/utils";
import type { FieldStatus, Lang, ListItem } from "@/lib/types";
import { paths, uniqueId } from "@/lib/report";

interface Props {
  collection: "roadmap" | "notCovered";
  items: ListItem[];
  lang: Lang;
  sourceLang: Lang;
  statusOf: (path: string) => FieldStatus | undefined;
  onChange: (next: ListItem[]) => void;
  numbered?: boolean;
  disabled?: boolean;
}

function Row({
  item,
  index,
  numbered,
  collection,
  lang,
  sourceLang,
  statusOf,
  onChange,
  onDelete,
  disabled,
}: {
  item: ListItem;
  index: number;
  numbered?: boolean;
  collection: string;
  lang: Lang;
  sourceLang: Lang;
  statusOf: (p: string) => FieldStatus | undefined;
  onChange: (next: ListItem) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex gap-2 rounded-lg border bg-card p-3", isDragging && "opacity-40")}
    >
      <div className="flex flex-col items-center gap-1 pt-1">
        <button
          {...attributes}
          {...listeners}
          disabled={disabled}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-3.5" />
        </button>
        {numbered && (
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            {index + 1}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <I18nField
          label="Title"
          value={item.title}
          onChange={(v) => onChange({ ...item, title: v })}
          lang={lang}
          sourceLang={sourceLang}
          status={statusOf(paths.item(collection, item.id, "title"))}
        />
        <I18nField
          label="Body"
          multiline
          rows={2}
          value={item.body}
          onChange={(v) => onChange({ ...item, body: v })}
          lang={lang}
          sourceLang={sourceLang}
          status={statusOf(paths.item(collection, item.id, "body"))}
        />
      </div>

      <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive">
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export function ListPanel({
  collection,
  items,
  lang,
  sourceLang,
  statusOf,
  onChange,
  numbered,
  disabled,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(items, from, to));
  };

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item, index) => (
            <Row
              key={item.id}
              item={item}
              index={index}
              numbered={numbered}
              collection={collection}
              lang={lang}
              sourceLang={sourceLang}
              statusOf={statusOf}
              disabled={disabled}
              onChange={(next) => onChange(items.map((x) => (x.id === item.id ? next : x)))}
              onDelete={() => onChange(items.filter((x) => x.id !== item.id))}
            />
          ))}
        </SortableContext>
      </DndContext>

      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...items,
            {
              id: uniqueId(`new-${collection === "roadmap" ? "step" : "item"}`, items.map((i) => i.id)),
              title: { [sourceLang]: "" },
              body: { [sourceLang]: "" },
            },
          ])
        }
      >
        <Plus className="size-3.5" /> Add {collection === "roadmap" ? "step" : "item"}
      </Button>
    </div>
  );
}
