# Node drag performance fix

## Cause and change

`GraphEditor.edit()` clones the complete document, normalizes and validates it, restores unchanged references and publishes an immutable snapshot. The old canvas called this for every native node-position event. Restoring references after cloning did not avoid copy costs, and rebuilding controlled node presentations also fed positions back into React Flow while its native drag was already moving them.

Ordinary node movement now uses native React Flow geometry as a transient preview. A map collects the latest positions without publishing controller documents or writing controlled nodes back on every move. On drop, one layout edit applies all moved positions and the existing gesture commits one undo entry. Escape, pointer cancellation and external controller cancellation discard pending geometry; a revision forces native positions back to the saved document. Alt duplication retains its existing independent preview path.

The canvas no longer subscribes to all native node records when cable-property anchors are disabled. Dimension notifications still invalidate content bounds; cable-property anchors retain live geometry subscriptions when enabled.

Generic `GraphEditor.edit()` is unchanged. Numeric controls continue to publish live previews. Node frames, ports and cable controls also subscribe to relevant selection slices, so selecting one node does not notify every node body through a whole-selection dependency. This targeted fix removes cloning/normalization/validation from the node-drag loop without changing the generic mutation contract or adopting a new state-management dependency. Hosts now observe ordinary layout edits at drop, as documented in README.

## Evidence

Visual Visual production builds, Chrome 156.0.8078.80 on the same Mac, active WebGL, three fresh contexts per case, 120 drag steps then 20 horizontal pan events. At 107 nodes, 1440×900:

| Version | Combined main-thread CPU | Pointer-to-next-frame p95 |
| --- | --- | --- |
| Published Spagbol 0.1.0 | 2.368s | 16.24ms |
| Fixed local packed build | 0.468s | 0.70ms |
| Original Visual Visual, fresh recheck | 0.572s | 1.33ms |

The fixed drag and pan CPU medians are 0.318s and 0.124s respectively. Original recheck drag and pan medians are 0.305s and 0.255s: the drag-only CPU difference is small relative to run variability; the measured combined workload improves. Frame interval p95 remains 16.67ms. Pointer timing is a browser capture-listener-to-rAF measurement, not INP or physical input latency.

The initial host-Node controller benchmark measured about 50ms for 120 edits at 107 nodes and 457–479ms at 1000 nodes. JSON stringification alone was roughly 6ms and 57–58ms respectively (not complete clone timings). A first state-based canvas preview removed per-move edits but still cost about 2.03s; the remaining redundant controlled-position updates and broad subscription also needed removal.

## Validation

Docker regression suite: 61 passing tests. The consumer's 109 patch/compiler compatibility tests pass. Browser checks in Visual Visual cover drop, undo/redo, Escape with late pointer movement, pointer cancellation, multiple selected nodes, Alt duplication, and unchanged persistent documents while dragging. The test also counts full-graph JSON serialization: zero during movement; one edit clone plus the two existing gesture comparisons at drop.

Run headless checks and the isolated controller benchmark (Docker timings differ from the initial host-Node diagnostic):

```sh
docker compose run --rm check npm test
docker compose run --rm check node scripts/benchmark-edits.mjs
```

The full raw browser results and screenshots are in the adjacent Visual Visual checkout, `benchmarks/spagbol-fixed/`, with the fresh original-editor comparison in `benchmarks/original-recheck/`. They were collected sequentially with no builds or browser smoke tests running concurrently.

The fix is included in version 0.1.1. These performance measurements used a locally packed build before release; Visual Visual records validation of the registry package in its migration report.

The final fixed combined CPU medians are lower than the fresh original-editor recheck in all four cases. This does not imply every sub-operation is faster: large narrow drag-only CPU is 0.300s versus 0.228s originally, while pan CPU is 0.125s versus 0.240s. The raw data also retains long-task and worst-frame measurements.
