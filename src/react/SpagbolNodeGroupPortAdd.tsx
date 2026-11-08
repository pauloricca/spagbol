import { useEffect, useRef, useState } from "react";
export function SpagbolNodeGroupPortAdd({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function finish() {
    if (draft.trim()) onAdd(draft);
    setDraft('');
    setEditing(false);
  }

  return (
    <div className="spagbol-node-group-port-add nodrag nopan">
      {editing ? (
        <input
          ref={inputRef}
          className="spagbol-node-group-port-add-editor nodrag nopan"
          aria-label={label}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={finish}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') finish();
            if (event.key === 'Escape') { setDraft(''); setEditing(false); }
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          spellCheck={false}
        />
      ) : (
        <button
          type="button"
          className="spagbol-node-group-port-add-placeholder nodrag nopan"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); setEditing(true); }}
          onDoubleClick={(event) => event.stopPropagation()}
        >{label}</button>
      )}
    </div>
  );
}

