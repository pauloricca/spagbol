import { useReactFlow } from "@xyflow/react";
import { isGroupBoundary } from "../core/index.js";
import { useRef, useState, type ReactNode } from "react";
import { SpagbolControlZoom } from "./SpagbolControlZoom.js";
import { SpagbolCanvasMenu } from "./SpagbolCanvasMenu.js";
import { useEditorSnapshot, useSpagbol } from "./context.js";

export interface SpagbolCanvasAction {
  id: string;
  label: ReactNode;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  checked?: boolean;
  onSelect(): void | Promise<void>;
}
export interface SpagbolCanvasMenuSeparator {
  id: string;
  separator: true;
}
export type SpagbolCanvasMenuItem =
  | SpagbolCanvasAction
  | SpagbolCanvasMenuSeparator;
export interface SpagbolCanvasControlsOptions {
  /** Host actions beside the menu; history buttons follow these by default. */
  buttons?: readonly SpagbolCanvasAction[];
  menuItems?: readonly SpagbolCanvasMenuItem[];
  menuLabel?: string;
  leading?: ReactNode;
  zoomExtra?: ReactNode;
  showZoom?: boolean;
  showHistory?: boolean;
  showLayoutLock?: boolean;
  showBreadcrumbs?: boolean;
  onActionError?(error: unknown, action: SpagbolCanvasAction): void;
}
const labelFor = (action: SpagbolCanvasAction) =>
  action.ariaLabel ??
  (typeof action.label === "string" ? action.label : action.id);

/** Standard zoom stack and percentage/reset button, independent of app actions. */
export function SpagbolCanvasControlsZoom({ extra }: { extra?: ReactNode }) {
  const { zoom } = useSpagbol();
  return (
    <SpagbolControlZoom
      className="spagbol-canvas-controls-zoom"
      zoom={zoom}
      extra={extra}
      layout="corner"
    />
  );
}

/** Teia/visual-visual corner menu. Domain actions stay in the consumer. */
export function SpagbolCanvasActions(options: SpagbolCanvasControlsOptions) {
  const flow = useReactFlow();
  const scale = (factor: number) => editor.scaleSelection(factor, new Map(flow.getNodes().filter(node => node.id.startsWith("node:")).map(node => [node.id.slice(5), { width: node.measured?.width ?? node.width ?? 180, height: node.measured?.height ?? node.height ?? 100 }])));
  const { editor } = useSpagbol();
  const snapshot = useEditorSnapshot(editor);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const busyRef = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const buttons: SpagbolCanvasAction[] = [
    ...(snapshot.path.length
      ? [
          {
            id: "spagbol:exit",
            label: "EXIT",
            ariaLabel: "Exit nested graph",
            onSelect: () => editor.exit(),
          },
        ]
      : []),
    ...(options.buttons ?? []),
    ...(options.showHistory === false
      ? []
      : [
          {
            id: "spagbol:undo",
            label: "UNDO",
            ariaLabel: "Undo",
            title: "Undo (Cmd/Ctrl+Z)",
            disabled: !snapshot.canUndo || !editor.editing,
            onSelect: () => editor.undo(),
          },
          {
            id: "spagbol:redo",
            label: "REDO",
            ariaLabel: "Redo",
            title: "Redo (Cmd/Ctrl+Shift+Z)",
            disabled: !snapshot.canRedo || !editor.editing,
            onSelect: () => editor.redo(),
          },
        ]),
  ];
  const members = editor.graph.nodes.filter(node => snapshot.selection.nodeIds.includes(node.id) && !isGroupBoundary(node));
  const exposed = editor.graph.data?.exposedNodeIds;
  const exposureChecked = members.length > 0 && Array.isArray(exposed) && members.every(node => exposed.includes(node.id));
  const items: SpagbolCanvasMenuItem[] = [
    { id: 'spagbol:group', label: 'GROUP TO SUBPATCH', ariaLabel: 'Group to subpatch', disabled: !editor.editing || !members.length, onSelect: () => { editor.groupSelection(); } },

    { id: 'spagbol:scale-up', label: 'SCALE UP SELECTION', disabled: !editor.editing || !snapshot.selection.nodeIds.length, onSelect: () => scale(2) },
    { id: 'spagbol:scale-down', label: 'SCALE DOWN SELECTION', disabled: !editor.editing || !snapshot.selection.nodeIds.length, onSelect: () => scale(0.5) },
    ...(options.menuItems ?? []),
    ...(options.showLayoutLock === false
      ? []
      : [
          {
            id: "spagbol:lock",
            label: "LOCK UI",
            ariaLabel: snapshot.mode === "edit" ? "Lock UI" : "Unlock UI",
            checked: snapshot.mode !== "edit",
            disabled: snapshot.mode === "readonly",
            onSelect: () =>
              editor.setMode(editor.editing ? "controls" : "edit"),
          },
        ]),
  ];
  const hasMenu = items.some((item) => !("separator" in item));
  async function invoke(action: SpagbolCanvasAction, fromMenu: boolean) {
    if (action.disabled || busyRef.current.has(action.id)) return;
    busyRef.current.add(action.id);
    setBusy(new Set(busyRef.current));
    setError(null);
    try {
      await action.onSelect();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      options.onActionError?.(cause, action);
    } finally {
      busyRef.current.delete(action.id);
      setBusy(new Set(busyRef.current));
    }
  }
  function actionButton(action: SpagbolCanvasAction, fromMenu = false) {
    return (
      <button
        key={action.id}
        type="button"
        role={
          fromMenu
            ? action.checked === undefined
              ? "menuitem"
              : "menuitemcheckbox"
            : undefined
        }
        aria-label={labelFor(action)}
        title={action.title ?? labelFor(action)}
        disabled={action.disabled || busy.has(action.id)}
        aria-busy={busy.has(action.id) || undefined}
        aria-checked={fromMenu ? action.checked : undefined}
        aria-pressed={fromMenu ? undefined : action.checked}
        onClick={() => {
          void invoke(action, fromMenu);
        }}
      >
        {action.checked !== undefined && fromMenu ? (
          <span className="spagbol-canvas-menu-check" aria-hidden="true">
            {action.checked ? "✓" : ""}
          </span>
        ) : null}
        {action.label}
      </button>
    );
  }
  return (
    <div
      className="spagbol-canvas-actions nodrag nopan"
      role="group"
      aria-label="Canvas actions"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {options.leading && (
        <div className="spagbol-canvas-actions-leading">{options.leading}</div>
      )}
      {buttons.map((action) => actionButton(action))}
      {hasMenu && (
        <SpagbolCanvasMenu
          label={
            <>
              {options.menuLabel ?? "MORE"} <span aria-hidden="true">ˆ</span>
            </>
          }
        >
          {items.map((item) =>
            "separator" in item ? (
              <div
                key={item.id}
                role="separator"
                className="spagbol-canvas-menu-separator"
              />
            ) : (
              actionButton(item, true)
            ),
          )}
        </SpagbolCanvasMenu>
      )}
      {error && (
        <div className="spagbol-canvas-actions-error" role="alert">
          {error}
          <button
            type="button"
            aria-label="Dismiss action error"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export function SpagbolCanvasControls(options: SpagbolCanvasControlsOptions) {
  const { editor } = useSpagbol();
  const snapshot = useEditorSnapshot(editor);
  return (
    <>
      {options.showBreadcrumbs !== false && snapshot.path.length > 0 && (
        <nav
          className="spagbol-canvas-breadcrumbs nodrag nopan"
          aria-label="Graph navigation"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => editor.navigate([])}>
            ROOT
          </button>
          {snapshot.path.map((id, index) => (
            <button
              key={`${index}:${id}`}
              type="button"
              aria-current={
                index === snapshot.path.length - 1 ? "page" : undefined
              }
              onClick={() => editor.navigate(snapshot.path.slice(0, index + 1))}
            >
              {id}
            </button>
          ))}
        </nav>
      )}
      <div
        className={`spagbol-canvas-controls${options.showZoom === false ? " spagbol-canvas-controls-no-zoom" : ""}`}
      >
        {options.showZoom !== false && (
          <SpagbolCanvasControlsZoom extra={options.zoomExtra} />
        )}
        <SpagbolCanvasActions {...options} />
      </div>
    </>
  );
}
