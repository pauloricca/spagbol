import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphNode } from '../core/index.js';
import { useSpagbol } from './context.js';

/** Teia's inline type-editing interaction, backed by the host's node catalogue. */
export function SpagbolNodeFrameTypePicker({ node, compact, selected, disabled }: { node: GraphNode; compact: boolean; selected: boolean; disabled: boolean }) {
  const { editor, nodeKinds, features, changeNodeKind } = useSpagbol();
  const typeLabel = node.label ?? editor.nodes.get(node.kind)?.label ?? node.kind;
  const label = compact && node.compactLabel?.trim() ? node.compactLabel : typeLabel;
  const press = useRef({ time: 0, compact: false });
  const [editingLabel, setEditingLabel] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(label);
  const [highlight, setHighlight] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const options = useMemo(() => [...editor.nodes.list().filter(item => !nodeKinds || nodeKinds.includes(item.kind)), ...(features.areas ? [{ kind: 'spagbol.area', label: 'Area' }] : [])].filter(item =>
    `${item.kind} ${item.label}`.toLowerCase().includes(query.trim().toLowerCase())
  ).sort((a, b) => Number(b.label.toLowerCase().startsWith(query.toLowerCase())) - Number(a.label.toLowerCase().startsWith(query.toLowerCase()))), [editor, query, nodeKinds, features.areas]);
  useEffect(() => { if (!selected || disabled) setOpen(false); }, [selected, disabled]);
  useEffect(() => { if (open) { input.current?.focus({ preventScroll: true }); input.current?.select(); } }, [open]);
  useEffect(() => { menu.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [highlight]);
  function commitLabel() { editor.updateNode(node.id, { compactLabel: query.trim() }, "metadata"); setOpen(false); }
  function choose(kind: string) { if (kind === 'spagbol.area') editor.convertNodeToArea(node.id); else if (changeNodeKind) void changeNodeKind(node.id, kind); else editor.changeNodeKind(node.id, kind); setOpen(false); }
  return <span className="spagbol-node-frame-type-picker">
    {!open ? <button type="button" className="spagbol-node-frame-type-picker-button" onPointerDown={() => { const now = performance.now(); if (now - press.current.time > 500) press.current = { time: now, compact }; }} onDoubleClick={event => {
      event.preventDefault(); event.stopPropagation();
      if (disabled || !selected) return;
      const rename = press.current.compact; setEditingLabel(rename);
      setQuery(rename ? node.compactLabel ?? "" : typeLabel); setHighlight(0); setOpen(true);
    }}>{label}</button> : <>
      <span className="spagbol-node-frame-type-picker-placeholder" aria-hidden="true">{label}</span>
      <div className="spagbol-node-frame-type-picker-editor nodrag nopan nowheel" onMouseDown={event => event.stopPropagation()}>
        <input ref={input} className="spagbol-node-frame-type-picker-input" aria-label={editingLabel ? "Node label" : "Node type"} role="combobox" aria-expanded="true" aria-controls={`node-type-${node.id}`} aria-autocomplete="list" value={query} spellCheck={false}
          onChange={event => { setQuery(event.target.value); setHighlight(0); }} onBlur={() => editingLabel ? commitLabel() : setOpen(false)}
          onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
          onKeyDown={event => {
            event.stopPropagation();
            if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight(i => Math.min(i + 1, Math.max(0, options.length - 1))); }
            if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight(i => Math.max(0, i - 1)); }
            if (event.key === 'Enter') { event.preventDefault(); if (editingLabel) { commitLabel(); return; } const item = options[highlight] ?? options[0]; if (item) choose(item.kind); }
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
          }} />
        {!editingLabel && <div ref={menu} className="spagbol-node-frame-type-picker-menu nowheel" id={`node-type-${node.id}`} role="listbox" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }} onWheel={event => event.stopPropagation()}>
          {options.map((item, index) => <button key={item.kind} type="button" role="option" aria-selected={index === highlight} className={index === highlight ? 'active' : ''} onMouseDown={event => { event.preventDefault(); event.stopPropagation(); choose(item.kind); }}>{item.label}</button>)}
          {!options.length && <div className="spagbol-node-frame-type-picker-empty">no match</div>}
        </div>}
      </div>
    </>}
  </span>;
}
