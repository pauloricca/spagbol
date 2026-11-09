# Spagbol Standard Node Conventions

> Phases 1–3 documentation, 2026-11-09: read the [26 baseline contracts](standard-node-contracts.md) and [source-based application comparison](standard-node-comparison.md). Envelope, Playhead and Time are app-specific by request. No catalogue or runtime migration is included; phase 4 now provides reusable UI; runtime conformance and cross-app validation remain future work.

**Status:** Proposal / draft 0.4  
**Scope:** A recommended vocabulary of 26 nodes for Spagbol-based applications  
**Origin:** Common concepts identified in Teia's node catalogue, intended for reuse in Visual Visual and future applications.

## Purpose

Spagbol is an opinionated **float-signal graph language**, not a generic typed-node workflow system. All graph connections carry numeric values and share Spagbol's established connection, weighting and modulation semantics. Nodes may also hold non-numeric configuration (dropdowns, text, file references, etc.), but that configuration is **not connected or modulated through pins**.

This proposal establishes a shared **vocabulary and behavioural conventions** for 26 commonly useful nodes. It does **not** require applications to install a particular catalogue or use a shared runtime. Teia can compile to its audio DSP engine; Visual Visual can compile to shaders or update a scene; other applications supply their own evaluators. Spagbol supplies specifications and reusable UI.

The aim is for a user moving between Spagbol applications to recognise familiar node names and behaviours, without constraining domain-specific implementations.

## Three levels of standardisation

1. **Language invariants (core Spagbol):** Float-only connections; link modes and weighted modulation; graph and scope semantics; the distinction between numeric pins and non-modulatable node configuration. These describe language intent, not optional catalogue nodes. The current editor does not enforce all of these runtime semantics; see the implementation boundary in the application comparison.
2. **Recommended standard nodes (this document):** Names, intent, baseline inputs/outputs and behavioural contracts. Applications are encouraged—not required—to implement them.
3. **Optional conformance tooling:** Applications may implement the examples as executable fixtures. Runtime evaluation and saved models remain app-owned.

Applications may add pins, modes, UI and domain-specific functionality. Where behaviour differs materially, they should document the variation rather than silently using a standard name for incompatible semantics.

## Areas and their kinds

**Area** is the generic structural term, not a selectable plain kind. The four area kinds are:

| Kind | Meaning | Execution effect |
| --- | --- | --- |
| **Container** | Plain visual organisation, membership, movement and collapse. Previously displayed as Area. | None: it does not create instances, reset state or suppress work. |
| **Spread** | A count-driven set of indexed instances of the contained graph. | Evaluate one instance per active index. |
| **Spawn** | Independently lived instances created by triggers. | Create, release and kill instances according to lifecycle inputs. |
| **Conditional Execution** | A gate-controlled contained scope. | Execute or skip the contained work. |

Spread, Spawn and Conditional Execution are collectively **execution areas**. Container is a **visual area**. They share area editing interactions where supported: header, bounds, membership, locking, moving and collapsing. Sharing the visual structure does not imply shared execution semantics or support for every nested combination.

Container is a core editing construct outside the 26 recommended node contracts. The three execution kinds are already counted among those contracts. **Group** is separate: it encapsulates a nested graph and its interface; it is not another area kind.

Spagbol represents the umbrella through `GraphArea` and saved `areas`. Optional `ownerNodeId` connects an area to an app node that supplies its execution semantics. The UI calls the ownerless visual kind Container, including creation/type pickers and default titles. Existing serialized keys, `spagbol.area`, `addArea()`/`convertNodeToArea()` APIs, IDs and user-supplied titles remain compatible; no saved graph migration or title rewrite is required. Teia calls the behavioural subset execution areas in its helper names and diagnostics.

## The 26 recommended nodes

The following are **conventions**, not a mandate to copy Teia's current node implementations verbatim. Names below reflect Teia where possible. The six nodes that most strongly shape execution and programming semantics are marked **★**.

### Maths (14)

| Node | Recommended role | Behavioural notes |
|---|---|---|
| **Expression** ★ | Evaluate a numeric expression with named float inputs and a float result. | Expressions and their input names can be non-pin configuration; define supported operators/functions and error behaviour per runtime. |
| **Constant** | Produce a fixed or modulated numeric value. | Numeric value should remain a float parameter. |
| **Pass** | Forward a float unchanged. | Useful for routing, graph organisation and observation. |
| **Abs** | Return the absolute value of a float. | `abs(x)`. |
| **Add** | Add a float to an incoming signal. | `signal + amount`. |
| **Subtract** | Subtract a float from an incoming signal. | `signal - amount`; operand order matters. |
| **Divide** | Divide a signal by a divisor. | Zero divisor returns 0 in the proposed baseline. |
| **Modulo** | Wrap a float using floor-based modulo. | Result follows divisor sign; zero divisor returns 0. |
| **Min** | Return the smaller of two floats. | Numeric minimum; no state. |
| **Max** | Return the larger of two floats. | Numeric maximum; no state. |
| **Multiply** | Scale an incoming float by a factor. | `signal × factor`; independent of Spagbol's link-level Multiply mode. |
| **Pow** | Raise an incoming float to an exponent. | Specify handling of negative bases with non-integer exponents and other non-finite results. |
| **Map** | Remap from a source interval to a target interval. | Agree on behaviour when source min equals source max; do not silently assume clamping. |
| **Clamp** | Limit a float to a minimum and maximum. | Agree on reversed bounds. |

### Logic (2)

| Node | Recommended role | Behavioural notes |
|---|---|---|
| **Selector** ★ | Choose among numeric inputs using a numeric selection parameter. | Define indexing, rounding, out-of-range selection and any interpolation/slide option. Teia's existing `select` and `slide` controls are a useful starting point. |
| **Conditional Execution** ★ | Enable or suppress execution of a contained scope using a numeric gate. | Unlike a numeric conditional selector, this affects *whether work happens*. Specify gate threshold, instance state and resource lifecycle. |

A future **Condition** (numeric if/else) node could be a useful addition, but it is **not** counted among these 26: the current Teia catalogue has `ConditionalExecution` and `Selector`, not a separate `Condition` node.

### Instantiation (2)

| Node | Recommended role | Behavioural notes |
|---|---|---|
| **Spread** ★ | Evaluate a contained scope across an indexed set of instances. | Teia currently exposes a numeric `count` input and `item index` output. Define zero count, instance indices, ordering, and stable identity. |
| **Spawn** ★ | Create and manage independently lived instances of a contained scope. | Teia currently uses trigger, release trigger, kill trigger and instance gate. Preserve the distinction between spawning and distributing values; applications may specialise lifecycle controls. |

**Key distinction:** Spread is about a set of indexed evaluations; Spawn is about instances with lifecycles. Neither needs object-valued connections. A Visual Visual scene object can exist simply because its node exists within an active graph/instance.

### State (3)

| Node | Recommended role | Behavioural notes |
|---|---|---|
| **Accumulator** ★ | Maintain a numeric value across evaluations, optionally incremented, reset or bounded. | Define reset precedence, trigger semantics, wrapping/clamping and state ownership per instance. |
| **Random** | Generate numeric random values. | Define when a new value is generated, range and optional deterministic seeding. Teia uses a trigger. |
| **Noise** | Generate a numeric noise signal. | Define distribution and whether output is time-dependent; algorithms may differ. |

### Interaction (3)

| Node | Recommended role | Behavioural notes |
|---|---|---|
| **Slider** | Interactive one-dimensional numeric control. | Standardise the meaning of value, range and optional inverse output; Teia-specific MIDI binding remains an extension. |
| **Button** | Interactive momentary, toggle or trigger-style numeric control. | Define numeric outputs and transitions; UI appearance can vary. |
| **Joystick** | Interactive two-axis numeric control. | Standardise X/Y outputs and range mapping; elasticity and MIDI mapping are optional extensions. |

### Structured modulators (2)

**Curve** and **Sequence** are recommended standard nodes with an additional goal: Spagbol should provide **shared, reusable controlled UI editors**, not merely document their behaviour. They are general-purpose float modulators, independent of any musical clock. The shared UI should be extracted from Teia's existing sophisticated editors, not recreated from scratch.

| Node | Teia origin | Recommended baseline | Shared UI |
|---|---|---|---|
| **Curve** | `CustomWave` (renamed conceptually) | `position` float input → `value` float output; evaluate a stored curve at the requested position. | Curve drawing/editing, points or segments, interpolation and shape controls. |
| **Sequence** | `Sequencer` | `position` float input → numeric value output(s); evaluate stored steps at the requested position. | Step/row editing, sequence data manipulation and visual feedback. |

#### Position-driven baseline

The **standard forms are time-independent**: neither node requires its own clock, tempo, trigger or playback engine. A position is supplied by any float source (an app-specific clock or Playhead, mouse, an LFO, another Curve, etc.). This makes them suitable for per-sample DSP, per-frame animation, GLSL compilation and arbitrary evaluation.

- **Curve:** Define a documented position domain (suggested default: normalised `0..1`), interpolation, out-of-range behaviour (clamp/repeat/mirror), and numeric output. Its shape and editor metadata are non-pin configuration. A reference evaluator may be supplied, but specialised runtimes can evaluate the application data differently for performance, subject to the shared behavioural contract.
- **Sequence:** Define how position maps to step index, boundary behaviour, and how values are read (including optional multiple rows/outputs). The editor's steps and rows are structured node data, **not** values travelling over graph links. Avoid baking BPM or musical note concepts into the baseline. The baseline uses normalized position; apps may adapt step-index or musical positions explicitly.
- **Teia extensions:** Curve may add frequency, phase, trigger, subdivisions and other waveform/musical controls; Sequence may add beat-length, clock/trigger, reset, multiple rows and musical sequencing behaviour. These extensions should preserve compatibility with the shared view prop contract wherever possible.
- **Visual Visual usage:** Drive either node from arbitrary floats to animate transforms, shader uniforms, opacity, lighting or other numeric scene parameters.

**Separation of responsibilities:**

| Spagbol may provide | Each application provides |
|---|---|
| Recommended node contracts and stable UI prop contracts | Runtime evaluation / compilation strategy |
| Shared React Curve, Sequence and Joystick editors | Musical or visual extensions to controls |
| Typed view projections and edit-intent callbacks | Clock, transport and scheduling integrations |
| Documented conformance examples | Optimised DSP / GPU implementations |

Shared UI does **not** require a shared runtime. The editors should support extension points rather than being hardwired to Teia-specific controls. Extract existing Teia behaviour incrementally; do not discard advanced editing features merely to make the baseline generic.

**Total: 14 + 2 + 2 + 3 + 3 + 2 = 26.**

## Not part of the 26

- **Core graph constructs:** Container (the plain visual area), Group, Ins and Outs are Spagbol-owned editing/interface constructs, not ordinary catalogue nodes. Teia's Params deserves a separate review of group/interface conventions.
- **Potential later standard extensions:** Oscillators, Perlin noise, follower/smoothing, Send/Receive, tempo, scope/meter and generic numeric Condition.
- **App-specific time and shaping nodes:** Envelope, Playhead and Time. Applications own their clocks, shapes, transport and playback semantics; none has a shared standard-node contract.
- **Domain-specific Teia nodes:** Audio I/O, MIDI, musical quantisation, sample playback, filters, effects, distortion, FFT and other DSP-specific components.
- **Visual Visual scene nodes:** Sphere, Camera, Light, Painty, Image and Video belong to Visual Visual's catalogue. Their existence declares persistent scene entities; their numeric pins remain modulatable. Non-numeric file paths and modes remain node configuration.

## Runtime and semantic boundaries

**What Spagbol should specify:**

- The common meaning of float pins, weighted links and link modulation.
- The recommended contract for each standard node, including defaults, numeric units and edge cases.
- Scope and instance semantics for Spread, Spawn and Conditional Execution.
- Which operations are stateful, and how state relates to graph and instance identity.

**What applications should decide:**

- Evaluation frequency: per sample, per frame, on demand or on events.
- Execution backend: Rust/WASM DSP, GLSL/GPU, TypeScript or another engine.
- Domain-specific node implementations, controls, optimisations and additional pins.
- How non-numeric node configuration is stored and acted upon.

The same graph language need not imply identical scheduling. However, scheduling differences that alter observable results—especially around triggers, feedback, state and instance lifecycle—must be documented as execution profiles rather than assumed away.

## Proposed documentation contract for each node

A standard-node entry should eventually specify:

1. **Canonical name and purpose.**
2. **Recommended float inputs and outputs**, including defaults and units.
3. **Non-pin configuration**, where relevant.
4. **Observable behaviour** and formulas.
5. **State, clock, trigger and instance semantics**, if applicable.
6. **Edge cases** (NaN, infinity, division by zero, zero instances, reset order, etc.).
7. **Allowed extension points** and known domain-specific differences.
8. **Shared editor data/UI contracts**, where applicable (notably Curve and Sequence).
9. **Small conformance examples**, ideally executable in a reference runtime.

Avoid freezing Teia's exact parameter naming or DSP-specific assumptions until compared against Visual Visual's needs.

## Implementation phases

**Phase 1 — Document, don't migrate (documented).** Publish this proposal under `docs/language/standard-nodes.md`. Compare Teia's actual definitions and execution behaviour with Visual Visual's equivalents. Record disagreements explicitly.

**Phase 2 — Specify the six semantic anchors (documented).** Start with Expression, Selector, Conditional Execution, Spread, Spawn and Accumulator. These carry the most consequential language and lifecycle assumptions.

**Phase 3 — Complete the remaining twenty contracts (documented).** Establish defaults, formulas, pin conventions and edge-case behaviour for maths, state, interaction and structured modulator nodes.

**Phase 4 — Extract controlled Curve, Sequencer and Joystick UI (implemented, functional validation pending).** Spagbol owns view components and callbacks. Teia retains persistence, model edits, musical wrappers, clocks and runtime evaluation; its piano roll also reuses the Sequencer surface. No shared saved-data schema or edit-operation engine is introduced. See [UI ownership and integration](ui-components.md). Visual Visual adoption remains future work.

**Phase 5 — Optional conformance tooling.** Provide sample UI integrations and executable contract fixtures where useful. Applications retain models and evaluators; this plan does not add a shared runtime or persistence model to Spagbol.

**Phase 6 — Validate across applications.** Exercise the conventions with Teia's DSP runtime, Visual Visual's shader/scene runtime and a minimal standalone app. Measure performance separately from semantic correctness.

## Design principles

- **One numeric signal language.** Do not introduce object-, texture- or event-valued connections just to make standard nodes more general. Triggers and gates are represented numerically.
- **Convention over enforcement.** Applications can omit, extend or specialise recommended nodes.
- **Stable meaning over identical implementation.** Shared names should imply recognisably shared behaviour.
- **Persistent instances, cheap updates.** Scene entities and DSP components should not be recreated merely because a modulated float changes.
- **Reuse complex editors without coupling runtimes.** Curve and Sequence share UI contracts while Teia and Visual Visual retain their own evaluation and domain-specific controls.
- **No runtime or data-model unification.** Spagbol supplies specifications and controlled UI; Teia and Visual Visual retain execution engines, serialized data and model editing.
- **Ground the specification in working applications.** Extract the common language from real Teia and Visual Visual behaviour, not a hypothetical universal graph system.

---

*This is a proposal for a recommended standard vocabulary, not a claim that Spagbol currently implements these nodes or that all their edge cases have already been standardised.*
