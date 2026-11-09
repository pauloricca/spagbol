# Standard nodes: Teia and Visual Visual comparison

**Source review:** 2026-11-09, against the [baseline 0.4 contracts](standard-node-contracts.md). This is the phase 1 comparison and decision record for phases 2–3. It is not an execution, audio, browser or hardware conformance report.

## Evidence boundary

Reviewed sibling checkouts:

| Repository | HEAD at review | Working-tree qualification |
| --- | --- | --- |
| Spagbol | `43e613cb685533c6812f97cc22b35c9ea9d1ed44` | Clean before this documentation task. Core/UI, not an evaluator. |
| Teia | `7f8e655539ad185bd58ee08117780be4a5b32573` | Clean at review. Definitions, compiler and Rust source inspected; no app execution. |
| Visual Visual | `0e409ecfa6614ff0bc27bde8bffab6484aaf5ed3` | Existing uncommitted editor, preview and persistence work. Observations describe the inspected working tree, not a claim that every detail is in HEAD. No files changed by this task. |

Source paths below are repository-relative evidence locations; function names identify the reviewed implementation without depending on shifting line numbers. HEAD hashes record provenance, not a promise about future versions.

| Ref | Repository and evidence |
| --- | --- |
| S1 | Spagbol `src/core/model.ts`: `PortDefinition`, `GraphNode`, `GraphPolicy`, `standardLinkModes`, `NodeRegistry`; `src/core/groups.ts`: `normalizeGroupPortLabel`, stable port creation. |
| S2 | Spagbol `README.md`: rich links, nested graphs, shared slider/button controls and host execution ownership; `src/react/Controls.tsx`. |
| T1 | Teia `editor/src/graph/nodeTypes.ts`: `NODE_DEFINITIONS`, `getNodeDefinition`, `sequencerShape` and pattern/gate helpers. |
| T2 | Teia `editor/src/audio/dspProgram.ts`: `ExpressionParser`, `EXPRESSION_FUNCTIONS`, `compileSelector`, `compileSequencer`, `resolveSliderUnitValue`, `applySliderCurve`, `resolveJoystickUnitValue` and per-type lowering. |
| T3 | Teia `rust/teia-kernel/src/lib.rs`: `render_dsp_selector`, `render_dsp_accumulator`, `advance_accumulator`, `render_dsp_random`, `render_dsp_function`, `sign_preserving_pow`, `DSP_OP_MAP` and repeat/Spawn scheduling in `render_dsp_ops`. |
| T4 | Teia `editor/src/graph/spread.ts`: `expandSpreads`, `expandOneSpread`, membership checks; `editor/src/audio/dspProgram.ts` block-latch lowering; `README.md` Spreads / Conditional Execution / Spawns. |
| T5 | Teia `editor/src/graph/customWave.ts`: `DEFAULT_CUSTOM_WAVE`, normalization, banks, base-level mapping and curve evaluation helpers; `editor/src/editor/TeiaNodeContent.tsx`: curve, sequencer, joystick and parameter editing. |
| T6 | Teia `firmware/fm1/support.json` and generated `firmware/fm1/SUPPORT.md`: authoritative firmware capability/verification contract. This document is not a second firmware support list. |
| V1 | Visual Visual `web/src/graph/nodeTypes.ts`: `NODE_DEFINITIONS`, unary/binary helpers and dynamic Expression ports. |
| V2 | Visual Visual `web/src/graph/glsl.ts`: `emitExpression`, `emitMap`, output resolution cases for maths/Noise, `emitEnvelope`, `collectEnvelopeSlots` and GLSL noise helpers. |
| V3 | Visual Visual `web/src/graph/expression.ts`: symbol extraction/replacement and float-literal normalization; `web/src/editor/WebGLPreview.tsx`: frame scheduling, uniforms and feedback textures. |

## Current infrastructure versus language intent

The proposal's float-signal language is a design contract, not a description of type enforcement already implemented in Spagbol. S1 exposes an optional arbitrary `dataType` string, numeric parameter storage, JSON node data, custom mode descriptors and host connection policy. S2 deliberately leaves numeric mode arithmetic, feedback and runtime scheduling to applications. Group/Ins/Outs editing is shared; Spread/Spawn/Conditional execution is not implemented by the library.

Keep numeric links and non-pin configuration distinct when adopting the conventions. Do not infer that an editor control, mode descriptor or nested graph already implements a node evaluator. The initial phases 1–3 review made no API/runtime changes. Phase 4 adds controlled UI exports and local packed consumption, leaving patch schemas and evaluators unchanged; see [UI components](ui-components.md).

## All 26 recommended nodes

“Absent” means no named entry in the inspected application catalogue (T1/V1), not proof the behaviour is impossible to express in a graph. Similar arithmetic does not establish matching numeric edge cases or scheduler behaviour. Labels shown in this table are existing app names/IDs, not new recommended labels.

| Node | Teia source behaviour | Visual Visual source behaviour | Baseline decision / remaining difference |
| --- | --- | --- | --- |
| Expression | Dynamic inputs → `value`; parsed scalar dialect, arithmetic/comparisons/logical operators and fixed function table; compiler diagnostics for unsupported syntax/functions (T1/T2). | Dynamic inputs → `value`; source substituted into GLSL after input discovery and float-literal normalization (V1–V3). | Specify a small portable arithmetic/function subset and explicit dialects. GLSL availability, syntax, boolean results and Teia's guarded functions are not automatically portable. |
| Constant | `value=1` → `signal` (T1/T2). | `value=1` → `value` (V1/V2). | Same basic role/default. Output label differs; no rename required now. |
| Pass | `signal` → `signal` (T1/T2). | Absent (V1). | Recommend transparent float routing; no new node installed. |
| Abs | `signal` → `signal` (T1–T3). | `value` → `value`, GLSL `abs` (V1/V2). | Same finite arithmetic, different labels; non-finite parity not established. |
| Add | No named Add catalogue entry; Expression and Add links can express addition (T1/T2). | `a=0`, `b=0` → `value`, scalar addition (V1/V2). | Recommend `signal=0`, `amount=0` → `signal`. Names differ; no Teia node is installed by this specification. |
| Subtract | No named catalogue entry; Expression supports subtraction (T1/T2). | `a=0`, `b=0` → `value` (V1/V2). | Same finite arithmetic; preserve left-minus-right operand order. |
| Divide | No named catalogue entry; Expression supports guarded division (T1/T2). | `a=0`, `b=1` → `value`, raw GLSL division (V1/V2). | Baseline exact-zero fallback is explicit; raw GPU zero/overflow results are not portable. |
| Modulo | No named catalogue entry (T1). | `Mod`, `a=0`, `b=1` → `value`, GLSL `mod` (V1/V2). | Choose floor-based float modulo, not JavaScript `%` remainder. Explicit zero fallback still requires an app adapter. |
| Min | No named catalogue entry; Expression has `min` (T1/T2). | `a=0`, `b=1` → `value` (V1/V2). | Baseline recommends both inputs default 0; Visual Visual's second default is 1. |
| Max | No named catalogue entry; Expression has `max` (T1/T2). | `a=0`, `b=1` → `value` (V1/V2). | Same default difference as Min. Finite comparison intent aligns. |
| Multiply | `signal=0`, `factor=1` → `signal` (T1/T2). | `a=0`, `b=1` → `value` (V1/V2). | Equivalent finite multiplication; labels differ. Link mode remains separate. |
| Pow | `signal=0`, `exponent=1`; `sign(base) * abs(base)^exponent`, with zero base forced to 0 (T1–T3). | `a=1`, `b=1`; raw GLSL `pow(a,b)` (V1/V2). | Baseline chooses mathematical real power with explicit invalid-domain fallback. Teia `(-2)^2=-4` and `0^0=0` differ from baseline 4 and 1. GLSL negative-base behaviour cannot be assumed to match either. Teia sign-preserving behaviour remains an app profile. |
| Map | `signal`, `srcMin`, `srcMax`, `trgtMin`, `trgtMax`; source span magnitude floored to `1e-6` with sign retained (T1/T3). | Same interval parameter IDs with `value` input; span below `1e-6` in magnitude replaced by **positive** `1e-6` (V1/V2). | Neither clamps. Baseline equal source bounds → target min; other finite nonzero spans use actual span. Both epsilon guards differ; a tiny reversed interval can even reverse direction differently between apps. |
| Clamp | `signal`, `min=0`, `max=1`; sorts bounds in scalar function (T1–T3). | `value`, `min=0`, `max=1`; direct GLSL `clamp` with unsorted arguments (V1/V2). | Baseline sorts reversed bounds as Teia does. Visual Visual does not encode this guarantee. |
| Selector | One-based numeric input names; floors selection, zero/out-of-range retains active selection; temporal `slide` in seconds (T1–T3). | Absent (V1). | Adopt latching intent, use human-readable labels/stable identities. Baseline switch tick starts slide elapsed at 0; Teia advances by one sample during rendering. Sparse numeric port indices, removal/reorder migration and dynamic slide edits need profile-specific checks. |
| Conditional Execution | `gate=0`; `>=0.5` executes per sample; closed scope skips instructions, retains state/resources, zeroes outgoing registers (T1/T3/T4). | Absent (V1). Numeric `Gate` passes/suppresses a value and does not establish execution suppression (V2). | Adopt execution semantics, not a numeric conditional. Record external side effects, scope restrictions and entity visibility in each profile. |
| Spread | `count=1`, one-based `item index`; nonnegative floored count, compiler block-latched; independent states/resources; shrinking resizes/truncates active storage (T1–T4). | Absent (V1). | Baseline explicitly retains suspended indices on shrink for stable persistent instances. Current dynamic Teia destroys removed state/resources and regrowth is clean; this is a recorded deviation, not a claim that Teia already retains it. Block versus tick count sampling also differs. |
| Spawn | Trigger/release edges at 0.5, per-instance gate/kill, independent state/resources. Scalar scheduler releases existing tags **before** creation, matching with absolute tolerance `1e-6`, and evaluates/collects before kill disposal (T1/T3/T4). | Absent (V1). | Baseline creates before release and uses exact tag equality; these are proposed explicit choices. Teia simultaneous matching trigger/release leaves the new instance gated on. Killing after final evaluation aligns in the inspected scalar path; other execution profiles need their own evidence. |
| Accumulator | Trigger or continuous mode; rising reset wins; sorted bounds; overshoot jumps to opposite endpoint (T1–T3). State begins as zero and is clamped to bounds. | Absent (V1). | Preserve edge/reset/endpoint-wrap semantics. Baseline initializes at low: for bounds -1..1 and no trigger its first value is -1; Teia's initially zero state remains 0. Continuous mode is per sample in Teia and per declared tick in the baseline. |
| Random | Initial draw then hold until trigger rise; per-node generator state; live range mapping, defaults -1..1; transport restart reseeds (T1–T3, README Random). | Absent (V1). | Adopt held normalized draw plus live mapping. Algorithm/seed/restart interoperability is not established. No cross-app identical sequence promised. |
| Noise | Raw temporal noise, default range -1..1 (T1–T3). | `x`, `y`, `scale=12`, `seed=0`, `octaves=4`; spatial coherent noise through GLSL helpers, plus separate 3D variants (V1/V2). | Baseline names temporal uniform noise; Visual Visual's coherent coordinate field is a different profile, not identical white-noise semantics. Pin names, units, ranges and distributions must be explicit. |
| Slider | `value=0.5`, curve shaping, range mapping/inverses, optional routed input signals, orientation and MIDI (T1/T2/T5). | No Slider catalogue node; scalar parameter widgets do not establish this node contract (V1). | Baseline specifies linear mapping and inverse. Curve, routing and MIDI are app extensions. Shared Spagbol slider is UI only (S2). |
| Button | Gate/toggle/trigger-style saved UI state, complementary signal routing, smoothing and MIDI (T1/T2/T5). | Absent (V1). | Baseline distinguishes numeric temporary/toggle/pulse transitions and event delivery. Shared UI's 120ms flash is not DSP pulse width; host adapters and scheduling remain necessary (S2). |
| Joystick | Saved normalized x/y default 0.5; min/max and inverse per axis, bottom-to-top Y, optional elastic centre return and MIDI (T1/T2/T5). | Absent (V1). | Adopt position/range intent; retain elasticity and MIDI as extensions. Joystick now uses the shared controlled component; saved positions, ranges and MIDI remain Teia-owned. |
| Curve | `CustomWave` / “Custom Wave”: waveform timing, frequency, phase, trigger, mode, multiple curves, base level, range and end triggers. Existing normalized model fixes endpoint values and supports sustain regions (T1/T5). | Absent (V1). | Standard is external `position` → `value`, no internal clock. Baseline generic curve allows arbitrary finite values; Teia normalizes stored points to -1..1. Preserve banks, endpoints and advanced editing with a lossless extraction adapter; do not rename/remove the musical wrapper. |
| Sequence | `Sequencer`: signal/reset-driven musical trigger or gate rows, beat length, row count, labels, fractional positions, velocities and `trigger index`; dynamic numeric row ports (T1/T2/T5). | Absent (V1). | Standard is normalized external `position` lookup of numeric cells, not a clock or event engine. Teia's event model is not already this evaluator. Specify baseline step boundaries now; use app-owned serialization adapters in phase 4 without losing richer Teia data. |

## App-specific exclusions

Envelope, Playhead and Time were removed from the recommended set at the user's request. Their existing nodes remain untouched. Teia's gate/trigger ADSR envelope and Visual Visual's attack/release frame follower already illustrate why the name alone is insufficient to standardize them. Visual Visual's `System.time` and Teia's sample-advanced Time have different clock ownership; neither is made a shared clock by this work. Teia's normalized Playhead remains part of its own catalogue. These observations do not establish new shared contracts for the excluded nodes.

Group, Ins and Outs remain shared editing/interface constructs. Teia Params still needs a separate interface review. Visual scene entities, shaders, audio/MIDI and domain-specific DSP remain application-owned. The proposal's Sphere/Light/Painty/Image/Video examples are possible scene vocabulary, not a claim that the inspected Visual Visual catalogue already contains them.

## Execution profiles still required

- **Teia web:** sample-driven Rust/WASM state, buffer-latched Spread counts, parameter smoothing and compiler-defined link accumulation. The inspected scalar path and README establish source intent; this task has not exercised state migration, side effects or timing. Existing nesting/overlap restrictions in T4 must be documented by an adopting profile; visual nesting alone does not establish executable nested containers.
- **Visual Visual:** GLSL evaluation per fragment, frame feedback via textures and UI-clock uniforms (V2/V3). Pure expressions can be inlined; persistent effects use explicit state textures. There is no evidence here for general execution-area or independently lived scene-instance support.
- **FM-1 / hosted / bounded policies:** consult T6 and their own source/evidence. Fixed pools, trigger drops, capped counts, reload resets and firmware support cannot be inferred from Teia web behaviour. This document intentionally adds no independent capability claims or version promises.

The proposed finite-value fallback, arithmetic error policy, low-bound Accumulator initialization, slide timing, shrink retention, exact Spawn matching, simultaneous lifecycle order and UI pulse queue are **design choices**. They are not source-discovered consensus. Applications may keep their existing behaviour by declaring deviations; any future migration must assess saved patches and performance first.

## Phases 1–3 completion and follow-up boundary

1. Proposal published in Spagbol, linked from README; all 26 nodes compared against both actual catalogues and relevant compiler/runtime source.
2. Six anchor contracts specify pins, configuration, execution/state/lifecycle order, errors, extension points and examples.
3. Twenty remaining contracts specify defaults, formulas, ranges, numeric edge cases and examples; Curve/Sequence logical position semantics are established without prematurely freezing their editor wire formats.

Phase 4 now provides controlled UI editors, used by Teia. There is no shared persistence model or model-edit engine. Visual Visual adoption is still future work. Phase 5 remains optional executable conformance tooling; evaluators remain app-owned. Phase 6 remains functional cross-application validation and separate performance measurements. Nothing in this documentation task certifies conformance or authorizes a runtime migration.

The initial phases 1–3 documentation did not touch app source. Phase 4 updates Teia UI imports/adapters and styles, with no changes to ports, saved models, compiler, DSP or firmware. Teia README and reviewed source fingerprints are updated for that extraction. FM-1 feature statuses and implementation/verification claims remain unchanged: this is a UI ownership refactor, not a web-engine capability change.
