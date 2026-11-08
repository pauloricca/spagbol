import { useEffect, useRef, useState, type PointerEvent } from "react";
interface SpagbolNodeGroupPortProps {
  name: string;
  editable: boolean;
  draggable?: boolean;
  selected?: boolean;
  preview?: boolean;
  activeDragTarget?: boolean;
  activeDragSource?: boolean;
  onPointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onChange: (nextName: string) => void;
}

export function SpagbolNodeGroupPort({
  name,
  editable,
  draggable = false,
  selected = false,
  preview = false,
  activeDragTarget = false,
  activeDragSource = false,
  onPointerDown,
  onChange,
}: SpagbolNodeGroupPortProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(name);
    }
  }, [editing, name]);

  useEffect(() => {
    if (!editing) return;

    const animationFrame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [editing]);

  function commitDraft() {
    onChange(draft);
    setEditing(false);
  }

  function cancelDraft() {
    setDraft(name);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="spagbol-node-group-port-editor nodrag nopan"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            commitDraft();
          }
          if (event.key === 'Escape') {
            cancelDraft();
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        spellCheck={false}
      />
    );
  }

  return (
    <span
      className={[
        'spagbol-node-group-port',
        editable ? 'spagbol-node-group-port-editable' : '',
        draggable ? 'spagbol-node-group-port-draggable nodrag nopan' : '',
          selected ? 'spagbol-node-group-port-selected' : '',
          preview ? 'spagbol-node-group-port-preview' : '',
        activeDragTarget ? 'spagbol-node-group-port-drag-target' : '',
        activeDragSource ? 'spagbol-node-group-port-drag-source' : '',
      ].filter(Boolean).join(' ')}
      draggable={draggable}
        title={preview
          ? 'Drop a connection here to create this port'
          : editable
            ? 'Drag to reorder. Double-click to rename'
            : undefined}
        onPointerDown={(event) => {
          onPointerDown?.(event);
        }}
      onDoubleClick={(event) => {
        if (!editable) return;
        event.preventDefault();
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {name}
    </span>
  );
}

