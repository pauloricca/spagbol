# Controlled node editor components

Stage 4 ships three React components in Spagbol 0.1.3, extracted from Teia. Spagbol owns reusable rendering and pointer interaction. **Applications own saved data, validation/normalization, edit operations, undo transactions, transport, assets, MIDI and evaluation.** The TypeScript point/item types below are temporary view projections, not a shared document schema. Spagbol introduces no curve/sequence persistence format, reducer, musical clock or reference evaluator.

Import components from `@pauloricca/spagbol` and styling from `@pauloricca/spagbol/editors.css` (already included by `styles.css`). React/React DOM remain the shared package's peer dependencies. These components need no canvas/controller, provider, audio engine or Teia import. They include `nodrag nopan` classes for use inside graph editors. The existing Spagbol graph editor/model API remains available; this ownership decision concerns the new domain editors, not removing established graph APIs.

## Curve

`SpagbolCurveEditor` renders a controlled set of normalized view points: `x` in 0..1 and `y` in -1..1. `locked` prevents dragging/deleting individual points; Teia locks its two endpoints. Applications can map any numeric domain into these coordinates without changing their saved data. Point order and normalization are host responsibilities.

Required props are `points`, on-screen `displaySize`, and `onInsertPoint`, `onMovePoint`, `onRemovePoint`. Insert applies a host edit and returns the new index (or null to reject); move/remove callbacks request host edits by index. `onGestureEnd` lets an adapter flush throttled updates. Keep point ordering stable during a drag; replace/remount the component when switching the edited curve. The host may reject any requested edit.

The extracted interactions include click-to-insert, dragging points between neighbors, double-click removal of unlocked points, locked endpoints, pointer capture/cancellation, hover/drag value labels and screen-sized hit targets as the canvas zooms. The default point spacing is 0.001. `screenEmphasis` and `pointScale` preserve Teia's zoom adjustments; `formatValue` maps view values to displayed application units.

`backgroundCurves` and `pathClassName` support multi-curve previews and colors. `toolbar`, `underlay`, SVG `overlay` and `footer` slots preserve complex app UI without putting its model or runtime into Spagbol. SVG overlays use the fixed 300 × 128 viewBox with 12-unit padding. Overlays are decorative; interactive controls belong in toolbar/footer slots. Applications supply grid legends, modes, sustain regions, range controls, playback markers and bank-selection shortcuts.

```tsx
<SpagbolCurveEditor
  points={projectCurve(appCurve)}
  displaySize={{ width: 400, height: 180 }}
  onInsertPoint={(point) => insertAppPoint(point)}
  onMovePoint={(index, point) => moveAppPoint(index, point)}
  onRemovePoint={(index) => removeAppPoint(index)}
/>
```

These example functions are host adapters, not Spagbol API. The component performs no curve lookup, DSP compilation or clock advancement.

## Sequencer

`SpagbolSequencer` is a controlled step/interval editing surface. Required props include `ariaLabel`, `rows`, `steps`, `rowLabel`, `itemsForRow`, `onCreateItem`, `onUpdateItem` and `onDeleteItem`. Each view item has a row-local stable numeric `id`, `start`, `end` in **step coordinates**, and normalized `level` for its displayed height. This UI coordinate system is independent of the standard Sequence evaluator's normalized position input. There is no evaluator in this component.

Adapters choose how their own model becomes intervals or step bars. The host handles allocation of new IDs, storage keys, row data, non-overlap validation and edit application. The component constrains pointer proposals against neighboring intervals; the host still validates them. Supply positive finite row/step counts and valid finite view values. A numeric-cell editor can map cells to bars; a musical app can map trigger/gate data without changing the shared component.

`mode` chooses trigger painting or interval editing. Trigger mode supports drawing across multiple cells in either direction; `onCreateItems` batches that operation when supplied. Gate mode supports click-to-create, drag-to-extend a new interval, movement, edge resizing, neighbor collision bounds and level adjustment. Clicking an existing item's body without dragging requests deletion. Defaults preserve Teia's minimum interval length of 0.05 steps and `minLevel=0.1`; set `minLevel=0` for zero-height numeric bars. `allowMove`, `allowResize` and `allowLevel` independently disable the associated gestures. Cancelled creation discards its preview; cancellation of an existing drag leaves already accepted host edits in place, as in Teia's original editor.

`groupSize` (default 4) is a visual grouping width, not BPM or a transport. `currentStep` is supplied visual feedback. `renderRowLabel`, `labelPosition` and `onRowRef` let an application insert editable labels, graph ports, pitch names or other row chrome without shared knowledge of those systems. Host CSS sets height; `--spagbol-sequencer-label-width` controls the right label column. All internal classes extend `spagbol-sequencer`.

```tsx
<SpagbolSequencer
  ariaLabel="My pattern" rows={2} steps={8}
  rowLabel={(row) => `row ${row + 1}`}
  itemsForRow={(row) => projectAppRow(pattern, row)}
  onCreateItem={(row, start, end) => addAppItem(row, start, end)}
  onUpdateItem={(row, id, patch) => updateAppItem(row, id, patch)}
  onDeleteItem={(row, id) => deleteAppItem(row, id)}
/>
```

## Joystick

`SpagbolControlJoystick` accepts controlled normalized `x`, `y`, and `onChange(x, y)`. Left/bottom are 0; right/top are 1. Optional `elasticity` defaults to 0 (hold position); a positive value animates return to centre at that normalized-unit-per-second speed. This is UI animation, not a graph clock. Pointer release, cancellation and lost capture finish dragging; unmount cancels its animation. The adapter owns saved positions, range/inverse mapping, MIDI and history.

```tsx
<SpagbolControlJoystick
  x={appPosition.x} y={appPosition.y}
  elasticity={0}
  onChange={(x, y) => saveAppPosition(x, y)}
/>
```

Each component keeps its canonical root class when a host supplies `className`. Colors support existing Teia tokens with Spagbol/default fallbacks. Host wrappers remain responsible for read-only policy, graph history and projected-instance identity, as with the existing Slider/Button controls.

## Teia integration

`editor/src/editor/TeiaNodeContent.tsx` adapts Teia's existing data directly:

- Custom Wave retains `CustomWaveSettings`, normalization, bank selection (including keys 1–8), base-level/range mapping, sustain/playback modes, grid grouping, live playhead overlays and throttled history-aware audio edits. Shared UI receives only view points, chrome slots and callbacks.
- Sequencer retains numeric parameter keys, row labels/ports, Trigger/Gate conversion, fractional step positions, velocities and hidden-data retention. Its adapter maps slot/velocity to view id/level and maps callbacks back into the original parameter edits.
- Roll uses the same Sequencer surface with Teia's pitch labels and note storage adapter. No musical data or scale system moves into Spagbol.
- Joystick retains saved x/y, ranges/inverses, MIDI and elasticity configuration; its shared component handles the pointer and return animation.

Teia consumes the published `@pauloricca/spagbol@0.1.3` registry package, pinned with matching lockfile integrity. The minimal Spagbol example is updated to consume the same package version. The package includes these language/UI docs.

## Validation and handoff boundary

Static library compilation, Teia compilation/build, package integrity, documentation coverage and the FM-1 source audit are the validation targets. No browser, audio or functional interaction test is implied by those checks. No Rust/WASM code changes; FM-1 status/version claims are unchanged because data adapters still issue the same existing edits and compile the same application models.

For Teia's Docker development setup, update the installed dependency before exercising the controls: its startup `npm ci` installs the vendored package. A user-initiated `docker compose restart editor` performs that startup step; this task does not restart the container. After it is ready, use an ordinary refresh if the existing tab does not recover through hot reload. Check point insertion/drag/deletion, wave bank/sustain edits, sequence painting/movement/resizing/velocity/row labels, piano-roll edits, joystick hold/elastic return, undo and saved-patch reload. Visual Visual adoption and interactive cross-app validation remain future work.
