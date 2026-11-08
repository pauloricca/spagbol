# Spagbol

An extensible graph editor extracted from the interaction patterns in Teia and visual-visual. This repository is independent of both applications. Teia now consumes the complete shared canvas/controller through a patch codec and domain bindings; visual-visual remains unchanged.

Spagbol owns graph editing and presentation. Consumers own their node catalogues, node bodies, execution, persistence services, assets and runtime observations. There is no audio engine, shader compiler, MIDI access or server client in the package.

## Package

`@pauloricca/spagbol` contains the complete graph model, registries, atomic edits, undo/redo, graph transformations, nesting, areas, observations and codecs together with the extensible React canvas, node frames/ports and controls. All public model and UI symbols come from the same entry point. Import `@pauloricca/spagbol/styles.css` explicitly.

The package is version `0.1.0`, local and unpublished. React/React DOM 19 and React Flow 12.11 are peer dependencies. Source remains organised into internal `src/core` and `src/react` modules, with a single build, version and tarball. This is an initial implementation, not a claim of complete Teia interaction parity.

## Docker development

Start the library build watchers:

```sh
docker compose up
```

The library has no HTTP server or port. Its container builds the package into `dist`, then watches TypeScript and CSS changes. Dependencies live in a Docker volume. Restart Compose after changing package manifests/lockfiles so `npm ci` picks them up. Run the [minimal example](examples/minimal/README.md) to see the UI; its Compose stack includes a library watcher, so running both stacks is unnecessary.

Build and run the headless regression suite, without launching a browser or either reference application:

```sh
docker compose run --rm --build check
```

Produce local package artifacts:

```sh
docker compose run --rm check npm run build
docker compose run --rm check npm run pack:local
```

The tarball appears in `artifacts/`. It is an ignored build output, not a published package. Both check and development containers mount this checkout; their builds update only this repository's `dist` outputs. No Docker service refers to Teia or visual-visual.

## Runnable example

[`examples/minimal`](examples/minimal/README.md) is a React/TypeScript starter: a full-page canvas, four example nodes and one connection, without application chrome. `src/main.tsx` mounts the editor; `src/nodes.tsx` shows custom node definitions and shared controls. It installs the packed library rather than aliasing source.

```sh
cd examples/minimal
docker compose up
```

Open http://localhost:5187. This replaces the separate client checkout. The example lives in this repository and is excluded from the npm package. Remove the sample graph assignments in `src/main.tsx` for an empty canvas.

## Minimal consumer

```tsx
import { GraphEditor, NodeRegistry, SpagbolCanvas } from "@pauloricca/spagbol";
import "@pauloricca/spagbol/styles.css";

const nodes = new NodeRegistry([
  {
    kind: "value",
    label: "Value",
    createData: () => ({}),
    ports: () => [
      { id: "amount", label: "amount", direction: "input", defaultValue: 0.5 },
      { id: "signal", label: "signal", direction: "output" },
    ],
  },
]);
const editor = new GraphEditor({ nodes });
editor.addNode("value", { x: 80, y: 100 });

// Mount inside a container with an explicit width and height.
export function Editor() {
  return <SpagbolCanvas editor={editor} />;
}
```

Create controllers once, outside render or with a React lazy initializer. A canvas supplies its own React Flow provider. Different canvas instances have independent focus, selection, overlays and render targets. Supply one controller per independently edited document. Rendering the same controller twice intentionally shares its editor session.

## Naming and layout conventions

React components follow ownership order: `SpagbolControlSlider` → `spagbol-control-slider`, `SpagbolControlButton` → `spagbol-control-button`, `SpagbolControlNumber` → `spagbol-control-number`, `SpagbolCanvasMenu` → `spagbol-canvas-menu`, and `SpagbolNodeFrame` → `spagbol-node-frame`. Props use the component name plus `Props`. Child/state classes extend the root; host-provided classes are added alongside canonical roots. Third-party React Flow classes remain for interoperability.

`spagbol-node-frame-body` has **zero padding**. A body view can add its own padded wrapper when appropriate; sliders and buttons render flush against the node frame. This prerelease replaces the old unnamespaced React exports rather than retaining aliases. Headless model classes and functions keep their model-oriented names.

## Hosts with an existing graph controller

`SpagbolCanvasFlow<N, E>` is the controlled integration boundary. It accepts typed React Flow nodes/edges, custom renderer registries, existing interaction callbacks and overlay children, with a configurable shared grid (`grid={false}` disables it). Mount it under the host's React Flow provider. It does not translate host documents, subscribe to a `GraphEditor`, or add edit gestures of its own. The higher-level `SpagbolCanvas` uses this same surface with Spagbol's controller.

`SpagbolControlZoom` accepts `zoom`, an optional `onReset` callback and an `extra` slot (for example a host CPU meter); its default layout retains React Flow control classes for existing themes. `SpagbolCanvasMenu` accepts host-owned action children and optional wrapper/menu/trigger classes, sharing focus, hover, keyboard and dismissal mechanics. These primitives need no Spagbol stylesheet when a host supplies their styling. The viewport bounds/clamp helpers and their typed geometry contracts are also public exports. Teia uses this boundary while retaining its specialised renderers and controller.

## Custom nodes

Register the domain definition in `NodeRegistry`. Supply its view separately in the React `views` map, keyed by the same kind. `defineNode<T>()` and `defineNodeView<T>()` retain typed domain payloads at those boundaries.

```tsx
import { defineNodeView, type SpagbolNodeViewProps } from "@pauloricca/spagbol";

function Slider({
  node,
  setValue,
  beginGesture,
  endGesture,
  readOnly,
}: SpagbolNodeViewProps) {
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={node.values.amount ?? 0}
      disabled={readOnly}
      onPointerDown={() => beginGesture("Adjust slider")}
      onPointerUp={() => endGesture()}
      onPointerCancel={() => endGesture(true)}
      onBlur={() => endGesture()}
      onChange={(event) => setValue("amount", Number(event.target.value))}
    />
  );
}
const views = { value: defineNodeView({ body: Slider }) };
```

Use `body` to retain the standard frame/ports or `render` to replace the complete node geometry. Complete renderers use the public `SpagbolNodePort` primitive and a `.spagbol-canvas-drag-handle` region. Dynamic port resolvers derive stable IDs from node data. Call `patchData(update, true)` for topology-changing edits; invalid incident links and their dependent modulation chains are removed atomically and restored by undo. SpagbolNodePort labels may change independently of IDs.

`SpagbolNodeFrame`, `SpagbolNodePort`, `SpagbolControlNumber`, `SpagbolNodePanel`, `useGraphEditor`, `useSpagbol`, `useEditorSnapshot`, `useObservation` and `useRenderTarget` are public extension primitives. A custom control must stop graph gestures where needed and end/cancel its gesture on focus loss or pointer cancellation. Consumers remain responsible for their node-specific validation and accessible controls.

## Slider and button controls

`SpagbolControlSlider` and `SpagbolControlButton` are Teia's extracted control components, used directly by Teia and the minimal client. They retain the original sizing, fill colours and pointer handling, using neutral `spagbol-control-slider`, `spagbol-control-slider-fill` and `spagbol-control-button` CSS classes. The full stylesheet includes them; consumers using their own canvas styles can import only `@pauloricca/spagbol/controls.css`. Existing Teia theme tokens are honoured, with Spagbol-token/default fallbacks for other apps. `--node-display-height` changes their default 48px height.

```tsx
import {
  SpagbolControlSlider,
  SpagbolControlButton,
} from "@pauloricca/spagbol";

<SpagbolControlSlider
  value={value}
  direction="horizontal"
  onChange={setValue}
/>;
<SpagbolControlButton
  mode="toggle"
  pressed={pressed}
  onPressedChange={setPressed}
  onClickPulse={trigger}
/>;
```

The slider accepts normalized values from 0 to 1 and an optional external `displayValue` (for example a runtime observation), plus horizontal/vertical orientation. Cmd/Ctrl uses one-fifth drag speed; Shift+Alt uses one-third speed. Switching modifiers reanchors without snapping. Shift or Alt enables wheel adjustment on the matching axis, with the same precision modifiers and original wheel scaling. It retains Teia's pointer-only focus behaviour.

Buttons support `toggle`, `trigger` and `temporary` modes. Toggle changes the pressed value on click; temporary emits 1 on press and 0 on release, cancellation or lost capture; trigger calls `onClickPulse` on press with a 120ms visual flash. External pressed-value rises also flash in trigger mode. Callbacks are controlled by the host: these components do not implement graph execution, MIDI, signal mapping or DSP timing. Consumers decide how values enter their model/history and how read-only UI is enforced.

## Rich links

Standard descriptors are `set`, `add`, `multiply` and `bend`, with mode colours, labels, descriptions and shortcuts. Register more with `LinkModeRegistry`, and optionally constrain the offered modes using `policy.modes`. A descriptor does not implement execution: consumers supply their own arithmetic/compiler and capability policy.

Each link has a stable ID, a source port, and either a destination port or another link's named property. Teia-style strength connections are enabled by default:

```tsx
const editor = new GraphEditor({
  nodes,
});
<SpagbolCanvas editor={editor} />;
```

Dragging an output to a cable creates a strength connection. Pin targets take priority. Recursive modulation is supported; property cycles and duplicate endpoint pairs are rejected. Reconnection retains identity, settings and dependent links. The core accepts any explicitly allowed link property; the canvas currently offers cable-body drops for `weight`. Mode arithmetic, numeric bounds and feedback scheduling remain consumer responsibilities. Consumers can register extra modes and supply their own evaluator.

To disable strength connections, supply `policy: { linkProperties: [] }`; `features={{ linkProperties: false }}` hides the canvas interaction and presentation. During a connection drag, a collapsed node reveals its ports only while the pointer is over it. The single selected node also reveals its ports, as in Teia.

Supply optional `linkPresentation` classifications for feedback/control/virtual drawing. Self links get the feedback geometry automatically. Virtual relations are display-only. Standard connected links support weights, enabling/disabling, mode editing, endpoint reconnection and insertion.

## Canvas controls

The default canvas includes a bottom-left zoom stack (in, out, fit), a percentage button that resets zoom to 100%, and bottom-right undo/redo buttons with a **MORE** menu containing the layout lock. Nested graphs also get an exit button and breadcrumbs. These controls use the shared theme and work without app callbacks.

Apps supply their own outside buttons and menu entries through `controls`. Saving, loading, transport and other domain actions remain app responsibilities:

```tsx
<SpagbolCanvas
  editor={editor}
  controls={{
    buttons: [{ id: "save", label: "SAVE", onSelect: saveDocument }],
    menuItems: [
      { id: "settings", label: "SETTINGS", onSelect: openSettings },
      { id: "separator", separator: true },
      {
        id: "guides",
        label: "GUIDES",
        checked: guides,
        onSelect: toggleGuides,
      },
    ],
  }}
/>
```

Actions accept `ariaLabel`, `title`, `disabled`, optional `checked` state and synchronous or asynchronous callbacks. Pending actions are disabled; failures appear in the controls and can also be handled with `onActionError`. The menu opens on hover, focus or click; arrow keys/Home/End move through enabled entries, and Escape, outside click, focus loss or an action closes it.

Use `leading` for host content beside the outside buttons and `zoomExtra` for content beside the zoom stack. `showZoom`, `showHistory`, `showLayoutLock` and `showBreadcrumbs` independently hide built-ins; `controls={false}` hides them all. `SpagbolCanvasControls`, `SpagbolCanvasActions` and `SpagbolCanvasControlsZoom` are exported for composition inside the canvas's provider. The older `toolbar` prop remains available for replacing the entire overlay.

## Optional features

The complete canvas enables areas, compact nodes, nesting and projected group controls by default. Feature flags remain available for compatibility:

```tsx
<SpagbolCanvas
  editor={editor}
  views={views}
  features={{
    compact: true,
    areas: true,
    linkProperties: true,
    nestedGraphs: true,
    panels: true,
  }}
/>
```

- **Areas:** create, move, resize, title, collapse, clone and freeze membership. Unlocked membership follows top-left containment; locking snapshots node/nested-area membership. A `controlHeight` section stays visible on collapse. Hidden member links are projected to the area's header; internal links are hidden.
- **Nested graphs:** nodes may own `graph`; navigate through the header arrow and breadcrumb bar. `groupSelection()` uses Spagbol-owned Group, Ins and Outs kinds (`spagbolGroupKinds`), preserving original mode/strength at the destination. Existing custom boundary-kind options remain compatible. Spagbol does not flatten or execute groups.
- **Shared structure:** an explicit `sharedGraphId` synchronizes edited nested graph contents across linked instances. Each instance retains its own overrides. Cloning an already linked group retains that relationship; nodes without a shared ID remain independent.
- **Projected panels:** `panelNodeIds` selects nested controls; `overrides` stores instance values independently of shared defaults. `panels` requires `nestedGraphs`. A custom projected/body renderer receives `setValue` mapped to the parent override. Double-click a projected control label to reset it. Numeric and JSON payload overrides are instance-specific, including nested projected controls; double-click the projected header to reset them. UI/Controls areas determine the projected layout, matching Teia.
- **Layout lock:** `editor.setMode('controls')` hides cables and blocks layout/topology while retaining numeric controls. `'readonly'` also blocks values. This is distinct from area membership locking.

## Interactions

| Gesture                                    | Action                                                                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Double-click canvas                        | Search the node catalogue and create a node. Escape cancels before document mutation.                                                                            |
| Drag pins                                  | Connect ports. Drag from either direction.                                                                                                                       |
| Cmd/Ctrl-drop a connection on empty canvas | Pick and create a compatible connected node as one transaction.                                                                                                  |
| Double-click a link                        | Pick a node with an input/output and insert it.                                                                                                                  |
| Select link                                | Show mode, weight and enable controls.                                                                                                                           |
| S / A / M / B                              | Choose set/add/multiply/bend for a new or selected link. Registered modes can add shortcuts.                                                                     |
| Drag selected link endpoint                | Reconnect; Cmd/Ctrl/Alt at start duplicates the link. Empty-space drop cancels.                                                                                  |
| Drag canvas / Shift-select                 | Rectangle selection / additive selection.                                                                                                                        |
| Scroll / pinch / middle- or right-drag     | Pan / zoom / pan.                                                                                                                                                |
| Cmd/Ctrl+0                                 | Reset to 100% zoom.                                                                                                                                              |
| Drag node header                           | Move nodes. Alt-drag shows a moving copy while originals and their links stay in place; drop commits the duplicate. Add Cmd/Ctrl/Shift to retain boundary links. |
| Cmd/Ctrl+C / V / D                         | Copy / paste / duplicate selection. Browser clipboard is best effort with per-controller fallback.                                                               |
| Delete or Backspace                        | Delete selection and dependent modulation links. Deleting an area leaves its nodes.                                                                              |
| Cmd/Ctrl+Z; Cmd/Ctrl+Shift+Z or Y          | Undo; redo.                                                                                                                                                      |
| X                                          | Toggle selected nodes, otherwise selected links.                                                                                                                 |
| Cmd/Ctrl-drag empty canvas                 | Draw an area when enabled.                                                                                                                                       |
| Double-click selected node name / area title | Change node type inline / edit the area title.                                                                                                                                            |
| Drag numeric field / click                 | Scrub / type a value. Shift is finer; Cmd/Ctrl is coarser.                                                                                                       |
| Shift/Alt-wheel on number                  | Scrub without panning.                                                                                                                                           |

Canvas shortcuts are scoped to focused editors and ignored in inputs and numeric fields. A cancelled transaction restores the document without consuming redo. Numeric gesture changes are previews until the gesture commits; subscribers receive one logical history event.

Duplicate drag previews are editor-only presentation: the saved node positions, link identities and runtime graph remain unchanged while dragging. Escape discards the preview; dropping creates the copy as one undo step. Standard and fully custom nodes use the same preview behavior. Shared port geometry centres input and output pins on their node borders, including while hovered.

Cmd/Ctrl/Alt-dragging a selected cable endpoint duplicates its connection and keeps the original cable visible throughout the drag, including connections targeting another link's strength. Ordinary endpoint dragging reconnects the existing link. Canvas measurements are retained across drag previews rather than reinitializing nodes on each movement.

Panning uses Teia's content-based limit by default: visible content is surrounded by a margin equal to 70% of the screen width/height at the current zoom. The limit is recalculated after zooming, resizing, changing graphs or changing visible content, so the graph cannot be lost in unlimited empty space. Invisible link anchors and temporary duplication previews do not expand that limit. Hosts can configure `panBounds={{ emptyScreenRatio: 0.7 }}` or explicitly opt out with `panBounds={false}`. Limits include visible areas as well as nodes.

## Documents, observations and integration

`readDocument`/`writeDocument` handle Spagbol's own JSON envelope (`format: 'spagbol', version: 1`). They validate finite JSON data and shapes, retain extension payloads, and preserve link order. Document objects exposed by the controller are frozen. Unknown node kinds stay in the document with diagnostics. This generic format does **not** replace existing Teia or visual-visual formats: Teia supplies a compatibility codec; other applications supply their own codecs.

`onCommit` provides change categories (`structure`, `values`, `layout`, `metadata`) plus edit/undo/redo/replace origin. `onPreview` receives transient gesture edits and `null` on completion/cancellation. Consumers can compile structure/value changes while ignoring layout. Persistence is opt-in, owned by the host. Atomic custom transformations use `editor.edit(...)`; the transform receives a mutable clone and cannot partially mutate the current document if it throws.

Runtime feedback belongs in `ObservationStore<T>`, keyed by graph path, node ID and instance. Each key has its own subscribers. `useRenderTarget(nodeId, slot)` registers a scoped DOM target through the canvas's `onRenderTarget` callback for app-owned GPU/canvas rendering. There are no device acquisitions or idle polling timers in Spagbol.

Styles are explicitly imported and use `.spagbol-*` classes and `--spagbol-*` tokens; the library does not reset the page's body, root or native controls. `SpagbolTheme` accepts token overrides. Hosts supply dimensions and application chrome.

The stylesheet defaults to Teia's standard black-and-white theme: its monospace font stack at 13px, white frames and headers, yellow selected headers, square pins, flat translucent black surfaces, 28px corner controls and 28px-spaced background dots. Standard cable colours match Teia (white set, yellow add, blue multiply, purple bend). Input and output columns sit beside one another. Consumers need no theme configuration; `SpagbolTheme` token overrides remain available. The minimal example uses these defaults without overrides. Selected nodes retain their individual frames and yellow headers; no surrounding group-selection box or green focus outline is drawn. Custom node renderers and application chrome remain consumer-owned.

## Review before application adoption

Standard port rows have explicit input/output columns and row positions. Numeric controls keep a fixed width, while labels truncate within narrow frames; output pins stay on the frame's right edge when input counts change.

The headless regression suite establishes model/controller behavior, not browser interaction or audio/firmware equivalence. Browser QA is still needed for custom layouts, gesture cancellation, cable targeting/reconnection, area occlusion, nested panels and independent editors.

The initial controller uses immutable whole-document snapshots and JSON equality for transactions. It is suitable for reviewing the API and interactions; large-graph profiling and incremental indexes/subscriptions remain work before adopting Teia-sized patches. Runtime observations already have targeted subscriptions, but document edits currently rerender interested canvas components broadly.

See [the adoption roadmap](docs/adoption.md) for the Teia ownership boundary and functional verification scope. No Teia/FM-1/hosted support claim is made by this release.

## Complete-editor migration contract

Teia must consume one `SpagbolCanvas` and shared `GraphEditor`. Low-level controlled-flow wiring is temporary and does not count as migration. Node frames/ports, link controls/reconnection, selection/history, Group/Ins/Outs, nesting and exposed-control panels belong to Spagbol. Teia owns its catalogue, specialised node content, patch codec and runtime/asset/host bindings. Teia now uses this boundary: its former editor state, graph gestures and cable renderer have been removed. Static checks cover document/compiler compatibility; browser, audio and host/hardware behavior still require functional verification.

The canvas now owns circular node enable toggles, the accepted +/− compact controls, inline type conversion, the Teia-style selected-link box above the canvas and transparent reconnect targets over green selected pins. Grouping is a default menu action. Built-in boundaries support inline add/rename, drag reorder and selected-port deletion. Structural changes synchronize linked groups and prune invalid dependent connections in the same undo entry. Group UI areas named `ui` or `controls` and explicit exposure metadata project nested content with independent numeric/data overrides; these layouts and edits are part of the canvas, not app-assembled widgets.

The shared number control uses Teia's numeric entry, vertical scrubbing and modifier-wheel behavior. `capture` optionally supplies an external input event while editing; Teia binds MIDI learning without an audio dependency in the library. Node views can use `autoWidth` for intrinsic domain content, `compact: false` for always-visible parameter tables and frame `renderPortContent` for specialized parameter widgets. The frame still owns handles and graph interactions. `nodeKinds` restricts creation/type menus while retaining unsupported existing nodes. `virtualLinks` renders read-only domain relations. An area's `ownerNodeId` travels with copy/paste and deletion. `normalizeDocument` maintains domain invariants within the same atomic edit and history entry; `policy.deletePort` updates editable domain port metadata through shared selection/deletion.

Ins/Outs new-port placeholders accept connection drops as well as typed names. Port creation and connection/reconnection share one transaction, so undo removes both together. Boundary defaults use the shared numeric input.

Additional complete-canvas extension points: `NodeDefinition.editablePorts`/`createPort` provide domain-owned port metadata with shared temporary pins and atomic creation. `onChangeNodeKind` keeps asset/DSP conversion in the host while the canvas owns inline editing. `onPaste` supplies source/copy IDs for external resources. Views can mark decorations nonselectable/nondraggable and place specialized port widgets through frame `portVisible`, `headerOutput`, `renderPortContent` and `overlay` slots; their ports remain shared `SpagbolNodePort` handles. `scale` and `compactLabel` are graph UI fields. Areas duplicate their full hierarchy through transient previews, support inline titles, and Ctrl/Cmd-delete bridges selected nodes. UI-area group panels crop to the specified area bounds, preserving Teia's exposure layout and resettable control labels.

Frame `rootRef` exposes the canonical element for intrinsic domain display measurements. Content remains padding-free, and hosts can pass explicit frame widths without replacing frame/port interactions.

`GraphEditor.changeNodeKind(id, kind, data?)` performs type replacement, ordered port remapping and invalid-cable pruning in one undo entry; optional data carries app-prepared assets. `scaleSelection(factor, measuredSizes?)` scales selected nodes around their shared visual center, also as one undo entry. The default canvas menu supplies scaling actions.

Sliders show the requested value immediately during pointer and wheel edits, independently of delayed `displayValue` observations. On release they wait for matching feedback for at most 200 ms before resuming the live display. Inside a node view, pass `onGestureStart={() => beginGesture("Change slider value")}` and `onGestureEnd={endGesture}` so a whole drag or wheel burst is one undo step; cancellation restores the prior document. Port-definition functions are pure functions of their node; Spagbol reuses results for immutable node snapshots.

## Publishing to npm

The package is structured as `@pauloricca/spagbol` with JavaScript, TypeScript declarations and explicit CSS exports. Confirm that `pauloricca` is your npm username/scope. Before the first release, choose your intended license (currently `UNLICENSED`; add a matching LICENSE file if granting reuse rights), and add your real repository URL to package.json once the repository exists. Nothing has been published automatically.

From this repository root, open a release shell in Docker. Authentication stays outside the checkout in a named volume:

```sh
docker compose run --rm --build \
  -v spagbol-npm-auth:/root/.npm \
  -e NPM_CONFIG_USERCONFIG=/root/.npm/userconfig \
  check sh
```

Inside that shell:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm pack --dry-run
npm login
npm whoami
npm publish --access public
```

Review the dry-run file list first. `prepack` builds before normal packing/publishing. Follow npm's browser login and two-factor prompts; scoped public packages require `--access public`. The `files` allowlist excludes examples, tests, development configuration and artifacts. See [npm's scoped publishing guide](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).

Consumers install the published release:

```sh
npm install @pauloricca/spagbol @xyflow/react react react-dom
```

Import `@pauloricca/spagbol/styles.css` once and mount `SpagbolCanvas` in a sized container, as above. Teia currently uses a local tarball; switching its dependency to the published version and updating its lockfile is a separate consumer change.

For updates, change the version first (for example `npm version patch --no-git-tag-version`), rerun the checks and dry run, then publish again. Commit the manifest/lockfile through your normal release workflow. Published name/version pairs cannot be reused. Local example preparation reads the package version to select its tarball. See [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/).
