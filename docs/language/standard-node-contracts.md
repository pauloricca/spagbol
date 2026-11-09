# Recommended standard node contracts

**Status:** Proposed baseline 0.4, 2026-11-09. **Scope:** 26 optional vocabulary contracts, not a runtime API or a claim of runtime implementation. Envelope, Playhead and Time are app-specific. See the [proposal](standard-nodes.md) and [source comparison](standard-node-comparison.md).

Phases 1–3 establish recommendations and review examples. They do not add catalogue entries, rename existing pins, change saved patches or mandate one execution engine. Applications can omit nodes and publish explicit execution profiles or extensions. The six semantic anchors are Expression, Selector, Conditional Execution, Spread, Spawn and Accumulator. The other twenty contracts complete the vocabulary. Phase 4 provides controlled Curve/Sequencer/Joystick UI; applications retain their own data layouts and edit operations. See [UI components](ui-components.md). Executable evaluator conformance remains future application/tooling work.

## Shared conventions

### Pins, configuration and naming

Every connection carries one numeric float signal, including triggers, gates and link-weight modulation. Objects, strings, textures, asset references, expression source and editor structures are configuration, never values carried by links. Numeric parameters remain float pins unless explicitly described as configuration. A discrete numeric choice can be a float pin with a documented conversion; a mode stored as configuration is not modulatable.

Names in backticks below are recommended **display labels**, in lowercase English with spaces. Stable serialized IDs are separate from labels and need not change when labels change. Dynamic inputs use labels such as `value 1`; Sequence outputs use `row 1`. Expression symbol bindings map source identifiers to independently named ports (for example `left_value` to `left value`). Do not rename existing app IDs or serialize these suggestions as a new patch format without a migration.

Signatures list `input = default -> output`; unspecified output units match the input. Dynamic data-input defaults are 0. A signature describes effective node inputs after the application's existing weighted-link resolution. A Multiply node does not replace or reinterpret Multiply link mode. These contracts do not redefine link arithmetic, reduction order or feedback delay; an execution profile must specify them.

### Numeric policy

The proposed portable baseline replaces a non-finite effective input with that input's default (0 if none), and replaces non-finite arithmetic results with 0. Finite values are not globally clipped. Invalid configuration produces a diagnostic and prevents that node/scope from executing; it is not silently accepted. Configuration numbers must be finite JSON numbers. Overflow must not poison persistent state. Runtime-specific epsilon guards, saturation or raw GPU undefined results are deviations to document, not implied by this baseline.

Comparisons in examples are exact for integers and logical states. For finite arithmetic, a future conformance runner should accept absolute error `1e-6` plus relative error `1e-5 * abs(expected)`; profiles may document precision limits and narrower valid ranges. Examples here are specification vectors, not executed tests of either application.

### Evaluation, state and triggers

An evaluation is one logical tick with duration `delta time` in seconds supplied by the application; it is not a graph pin. Pure nodes have no state. Stateful nodes update **once** per tick per instance even with multiple consumers. On-demand runtimes must distinguish reading an output from advancing a tick. A GPU evaluation may be per pixel; any per-pixel state ownership must be explicit. A trigger is high at `>= 0.5`, low below it. A rising edge is low-to-high; initial previous level is low, so an initially high signal fires on its first executed tick. Gate means level, not edge. A pulse lasts one executed tick unless an application specifies an event-latching profile for different producer/consumer rates.

State belongs to `(graph instance path, execution instance identity, node ID)`, never just a shared graph definition. New instances start clean; deletion disposes their mutable resources. Unchanged identities should preserve state across edits where supported; incompatible node changes reset affected state with a documented policy. Shared immutable assets are allowed. Saving graph data does not implicitly snapshot running state. Stopping, seeking, recompilation and reload policies are execution-profile responsibilities.

### Scope and lifecycle profile requirements

Use **areas** for the umbrella and **Container** for a plain visual area. Spread, Spawn and Conditional Execution are **execution areas**; a Container has no execution effect. Group remains a nested-graph construct. See [area kinds](standard-nodes.md#areas-and-their-kinds).

Spread, Spawn and Conditional Execution describe logical scopes, independent of their visual representation as areas or nested graphs. Input sources outside a scope continue normally. Internal-only ports cannot connect outside their owning scope. A scope output means each outgoing boundary contribution, even where an app renders no explicit output pin. Link modes still apply at the boundary.

An application must specify tick/block sampling, ordering, boundary reduction (including zero instances), feedback latency, state migration, membership, supported nesting/overlap, and resource limits. Unsupported combinations must be diagnosed before execution. For the portable examples below use ordered evaluations, no feedback, Add boundary reduction with empty sum 0, and stable IDs. Other link modes need profile-specific fixtures; no generic empty-product or last-writer rule is assumed here.

Resource allocation failure must yield an explicit diagnostic rather than silent partial creation; a bounded runtime may instead publish a capacity/drop policy as a named deviation. Scope inactivity does not imply destroying scene entities. Persistent objects may be retained with inactive visibility/update status; rendering, audio and external side effects must obey the scope's execution gate.

## Six semantic anchors

### Expression

**Purpose/signature:** evaluate a numeric formula. Dynamic named float inputs default to 0; output `value`. No clock or persistent evaluation state.

**Configuration:** expression source (default `0`), stable symbol-to-port bindings and declared dialect/version. The portable subset is finite decimal/scientific literals, parentheses, identifiers, unary `+`/`-`, binary `+`, `-`, `*`, `/`, and `abs`, `min`, `max`, `clamp`. Calls have arity 1, 2, 2 and 3 respectively. Precedence is calls/parentheses, unary, multiplication/division, addition/subtraction; binary operators associate left. Names are case-sensitive. `clamp` sorts its two bounds as in Clamp. Division by exactly zero returns 0; sanitize each intermediate result using the numeric policy. Evaluation has no side effects and cannot create a scope.

**Errors/extensions:** empty source acts as `0`. Unknown symbols, invalid syntax, wrong arity or duplicate bindings produce a compilation diagnostic. Ports and bindings must agree; deleting a bound input requires an explicit edit, not unnoticed rebinding by position. An app may infer bindings from source, but must keep IDs stable across harmless edits. Trigonometry, comparisons, logical operators, power, constants and GPU syntax are declared dialect extensions. Specify radians/units and boolean-to-float conversion when adding them. A numeric branch does not promise short-circuit execution of upstream nodes.

**Examples:** `left + right * 2`, inputs 3 and 4 → 11; `(left + right) * 2` → 14; `1 / 0` → 0; `clamp(-2, 1, -1)` → -1; `unknown(1)` → diagnostic. Expression text/bindings remain configuration; no shared specialized editor format is required.

### Selector

**Purpose/signature:** `select = 0`, `slide = 0` seconds, dynamic `value 1` … `value n` (at least one) → `signal`. Choose a live input, retaining the previous selection between selection pulses.

**Behaviour/state:** floor `select`. Valid indices are one-based `1..n`; zero, negative and out-of-range values retain the previous selection. Initially no selection exists and output is 0. A first valid selection immediately outputs that input. Subsequent index changes capture the current output as a transition start. With `slide <= 0` switch immediately; otherwise on the switch tick elapsed is 0, and on later ticks it advances by `delta time`, with output `start + (current selected input - start) * min(elapsed / slide, 1)`. The selected input stays live; slide is temporal, not interpolation between adjacent indices. A new change during a slide starts from the current output. Changing slide changes the current transition duration; reaching 0 completes it immediately.

**Configuration/edges/extensions:** stable ordered input IDs; negative slide becomes 0. Removing the selected port clears selection and outputs 0; reordering preserves selected port identity, while future numeric indices follow the new order. Each scope instance owns selection and transition state. An app can offer clamped, wrapped, non-latching or adjacent-input interpolation modes, but must name their different behaviour. No required shared specialized editor data.

**Examples:** values `[10, 20]`, slide 0, selections `[0, 2.9, 0, 99, 1]` → `[0, 20, 20, 20, 10]`. After selecting 10, switch to 20 with slide 1 second → 10 on switch tick, 15 after 0.5 seconds, 20 after 1 second. Selecting an input does not suppress computation of the others; use Conditional Execution for that.

### Conditional Execution

**Purpose/signature:** `gate = 0` → no fixed public output; enables one contained scope.

**Behaviour/state:** high gate executes the scope once on that tick. Low gate skips all contained updates and side effects, freezes local state and makes every outgoing boundary contribution zero, including Multiply-mode contributions. It does not merely stop reading results. Gate must originate outside the controlled scope; a dependency cycle through its own gated work is invalid. First opening creates clean state if not already allocated. Closing retains resources; reopening resumes them. Deletion disposes resources. Skipped ticks do not accumulate local elapsed time, and contained edge detectors retain their previous executed levels.

**Configuration/edges/extensions:** scope membership and boundary wiring are configuration. Nested/overlapping scope support must be explicit; rejection is allowed. No automatic fade, tail draining, note-off, reset or resource destruction on close. A retained scene entity must cease active rendering/side effects while closed according to the app profile. Reset-on-open and destroy-on-close are named extensions. No dedicated editor data beyond membership is standardized here.

**Examples:** a contained Accumulator in continuous mode, range 0..10, increment 1, gates `[1, 0, 0, 1]` → boundary outputs `[1, 0, 0, 2]`; internal values `[1, 1, 1, 2]`. An external counter advances on all four ticks. A contained sender emits nothing on the two closed ticks. A trigger held high across close/reopen does not retrigger an already-high local edge detector.

### Spread

**Purpose/signature:** external `count = 1` → internal-only `item index`. Evaluate an indexed set of independently stateful scope instances.

**Behaviour/state:** `n = max(0, floor(count))`. Active indices are one-based `1..n`, evaluated in increasing order. Zero count performs no contained work. Inputs are broadcast; boundary outputs contribute in item order using the profile's link semantics. Instance identity is the stable Spread ID plus index, independent of screen location or count changes. Increasing count allocates new indices cleanly; decreasing count suspends removed indices and retains their state/resources until the Spread is deleted. Regrowth resumes them; suspended indices do not advance clocks. Apps with disposal-on-shrink must document that deviation and its memory policy.

**Configuration/edges/extensions:** membership and wiring are configuration. No universal maximum is imposed; capacity and sampling cadence must be declared. Non-finite count uses default 1 under the numeric policy, not an unbounded allocation. Fractional and negative counts are handled before allocation. Nested scope support is profile-dependent. Counts must not recreate existing scene objects every tick. No specialized shared editor format is mandated.

**Examples:** counts `[2.9, 0, 1, 2]` expose indices `[[1, 2], [], [1], [1, 2]]`. A continuous Accumulator in each item (0..10, increment 1) produces Add boundary sums `[2, 0, 2, 5]`: item 1 progresses 1→2→3, item 2 resumes at 2. The zero-count scope sends no external events.

### Spawn

**Purpose/signature:** external `trigger = 0`, `release trigger = 0`; internal-only `kill trigger = 0` → internal-only `instance gate`. Create independently lived instances; this is not a value-distribution node.

**Behaviour/state:** a trigger rising edge creates one fresh instance tagged with that tick's numeric trigger value. Creation order defines stable monotonic identities and evaluation order; tags are not identities and duplicates are allowed. New `instance gate` is 1. A release rising edge sets the gate to 0 on every live instance with an exactly equal tag. Release does not destroy or stop evaluation. Each instance has its own kill edge detector; a kill rising edge destroys only that instance and its mutable resources. Immutable assets and external input sources can be shared.

**Tick order:** sample external lifecycle inputs; create; apply releases (including to a just-created matching tag); evaluate live instances in creation order; collect their boundary contributions; then dispose instances with kill edges. Thus a killed instance contributes on its final tick. New high kill signals can kill immediately after that first evaluation. A trigger held high does not repeatedly spawn, and changing its positive tag without dropping below threshold does not create another instance. With no instances, there is no contained work; boundary empty reduction follows the profile.

**Configuration/edges/extensions:** membership/wiring are configuration. A tag below 0.5 cannot trigger; zero is not an event tag in this baseline. Equality is exact, not epsilon matching. Retriggering never resets existing instances. Release-before-create, pre-collection kill, voice stealing, capacity drops and external kill-all are profile extensions/deviations to document. No built-in timeout; applications must expose capacity policy and dispose on scope deletion. Shared specialized editor data is not required.

**Examples:** external trigger `[7, 0, 7, 0]`, release `[0, 0, 0, 7]` yields live counts `[1, 1, 2, 2]` and gates `[[1], [1], [1, 1], [0, 0]]`. A later local kill on the first instance leaves the second alive with gate 0. Trigger/release 7 on the same tick creates an instance whose first gate is 0. Two independent Accumulators prove overlapping instances do not share state.

### Accumulator

**Purpose/signature:** `trigger = 0`, `reset = 0`, `increment = 1`, `min = 0`, `max = 1` → `signal`. Maintain one numeric value per instance. Configuration `mode` is `trigger` (default) or `continuous`; it is not a numeric mode pin in the baseline.

**Behaviour/state:** sort bounds into low/high. Initialize value to low; on each tick clamp stored value into current bounds. A reset rising edge assigns low and suppresses increment on that tick. Otherwise increment on a trigger rising edge, or every tick in continuous mode. Add increment once; if the result exceeds high assign low, if below low assign high; equal endpoints are retained. Overshoot is discarded, not modulo-wrapped. Output is the resulting value. Record both input levels even on reset ticks. Continuous increment is per tick, not per second.

**Edges/extensions:** equal bounds always output that bound. Finite addition overflow resets value to 0 under numeric policy, then clamps it to the bounds. Negative increments are valid. Bounds changes alone clamp; they do not count as trigger/reset. Trigger and reset initially high produce only a reset. Each scope owns value and edge history. Clamp/modulo/unbounded/integration modes must be named extensions. No required shared editor structure.

**Examples:** bounds 0..2, increment 1, trigger `[0, 1, 1, 0, 1, 0, 1]` → `[0, 1, 1, 1, 2, 2, 0]`. From 2, increment 4 → 0; from 0, increment -1 → 2. Simultaneous reset/trigger rise → 0 and a held trigger on the next tick does not advance. Continuous mode for three ticks → `[1, 2, 0]`.

## Remaining twenty contracts

These pure maths nodes have no non-pin configuration, clocks, instance state or specialized shared editor data. They accept extra named modes only as documented extensions. The shared numeric policy applies to all examples and dynamic modulation.

### Constant

**Purpose/signature:** `value = 1` → `signal`; output the effective value, including modulation, on every evaluation. No implicit sample-and-hold. **Edges:** non-finite value falls back to 1. **Extensions:** UI presets or display formatting do not change the numeric contract. **Examples:** value 3 → 3; modulated values `[2, -1]` → `[2, -1]`.

### Pass

**Purpose/signature:** `signal = 0` → `signal`; forward the effective input unchanged. Observation/UI does not delay or filter it. **Edges:** non-finite input becomes 0. **Extensions:** metering is allowed if it does not change the signal. **Examples:** -2 → -2; no input → 0.

### Abs

**Purpose/signature:** `signal = 0` → `signal`; `abs(signal)`. **Edges:** signed zero may normalize to 0; non-finite input becomes 0. **Extensions:** display only. **Examples:** -3 → 3; 2 → 2.

### Add

**Purpose/signature:** `signal = 0`, `amount = 0` → `signal`; `signal + amount`. Pure arithmetic; no configuration or state. **Edges/extensions:** overflow follows the shared result policy; additional summands must be explicit pins. **Examples:** 3 + -2 → 1; unconnected → 0. This node is independent of Add link mode.

### Subtract

**Purpose/signature:** `signal = 0`, `amount = 0` → `signal`; `signal - amount`. Pure arithmetic; no configuration or state. **Edges/extensions:** operand order is fixed, and overflow follows shared policy. **Examples:** 3 - 5 → -2; -2 - -4 → 2.

### Divide

**Purpose/signature:** `signal = 0`, `divisor = 1` → `signal`; `signal / divisor`. Pure arithmetic; no configuration or state. **Edges/extensions:** exactly zero divisor (including negative zero) returns 0. Tiny nonzero divisors use the actual value, with non-finite results replaced by 0. An epsilon guard is a named deviation. **Examples:** 6 / -2 → -3; 1 / 0 → 0; 0 / 0 → 0; 1 / 0.000001 → 1000000.

### Modulo

**Purpose/signature:** `signal = 0`, `divisor = 1` → `signal`; `signal - divisor * floor(signal / divisor)`. Pure float arithmetic; no configuration or state. This is floor modulo, not truncating remainder. **Edges/extensions:** exactly zero divisor returns 0; intermediate non-finite arithmetic returns 0 for the operation. For a positive divisor, ordinary finite results lie in `[0, divisor)`; a negative divisor gives results in `(divisor, 0]`. Near boundaries, finite precision can affect the endpoint; no integer-only conversion is implied. **Examples:** 5.5 modulo 2 → 1.5; -0.25 modulo 1 → 0.75; 5 modulo -2 → -1; 4 modulo 2 → 0; modulo zero → 0.

### Min

**Purpose/signature:** `signal = 0`, `other = 0` → `signal`; the lesser of the two effective floats. Pure arithmetic; no configuration or state. **Edges/extensions:** sanitize each input using the shared policy before comparison; signed zeros are equivalent. Additional inputs must be explicit extensions. **Examples:** min(3, -2) → -2; min(4, 4) → 4.

### Max

**Purpose/signature:** `signal = 0`, `other = 0` → `signal`; the greater of the two effective floats. Pure arithmetic; no configuration or state. **Edges/extensions:** same input sanitization and signed-zero policy as Min. Additional inputs must be explicit extensions. **Examples:** max(3, -2) → 3; max(-4, -1) → -1.

### Multiply

**Purpose/signature:** `signal = 0`, `factor = 1` → `signal`; `signal * factor`. Both parameters are floats and may be modulated independently. **Edges:** overflow becomes 0; negative factor inverts sign. **Extensions:** multiple factors may be explicit extra pins; do not reinterpret link weights. **Examples:** 3 × -2 → -6; factor 0 → 0.

### Pow

**Purpose/signature:** `signal = 0`, `exponent = 1` → `signal`; real arithmetic power. Negative bases are valid only for integer exponents. `0^0 = 1`; zero to negative exponent, negative base with non-integer exponent and non-finite results produce 0. No implicit absolute value, sign-preserving distortion or complex result.

**Extensions:** Teia's sign-preserving power must be identified as a distinct mode/profile rather than assumed mathematically equivalent. **Examples:** `2^3 = 8`, `(-2)^2 = 4`, `(-2)^3 = -8`, `(-2)^0.5 = 0`, `0^-1 = 0`, `0^0 = 1`.

### Map

**Purpose/signature:** `signal = 0`, `source min = 0`, `source max = 1`, `target min = 0`, `target max = 1` → `signal`. Compute `target min + (signal - source min) / (source max - source min) * (target max - target min)`. Do not clamp or sort either interval; reversed intervals reverse direction. Equal source bounds output target min. There is no epsilon substitution in the baseline.

**Edges/extensions:** arbitrarily small nonzero spans use the same formula, subject to numeric precision/overflow policy. Clamping and epsilon regularization are explicit extensions. **Examples:** 0.25 from 0..1 to 10..20 → 12.5; 2 → 30; 0.25 from 1..0 to 10..20 → 17.5; equal source bounds and target min 10 → 10.

### Clamp

**Purpose/signature:** `signal = 0`, `min = 0`, `max = 1` → `signal`. Sort the bounds, then `min(high, max(low, signal))`. **Edges:** equal bounds output that bound. **Extensions:** rejecting reversed bounds instead must be documented. **Examples:** 3 clamped to 0..1 → 1; -2 to 1..-1 → -1; 8 to 2..2 → 2.

### Random

**Purpose/signature:** `trigger = 0`, `range min = -1`, `range max = 1` → `signal`. Draw a normalized uniform pseudorandom value `u` in `[0, 1)` once on first executed tick, then once per subsequent trigger rising edge; an initially high trigger does not cause two draws. Hold `u` between events, and compute `range min + (range max - range min) * u` using the live bounds. Reversed ranges are valid; equal bounds yield a constant while the random stream still advances on triggers.

**State/configuration:** each instance owns its held value, generator state and previous trigger level. Optional deterministic seed is non-pin configuration; changing it explicitly reinitializes that instance. Publish algorithm/version and seed-to-instance derivation before promising repeatability. An unseeded restart may reseed; outputs are not required to match across apps.

**Edges/extensions/data:** no trigger pulse queue is implicit. Non-finite inputs use defaults; numeric output sanitization applies. Distribution, per-event resampling of already-mapped values, runtime reseeding and shared streams are named extensions. No required shared editor format.

**Examples:** with an injected draw stream `[0.25, 0.75]`, range -1..1, trigger `[0, 1, 1, 0]` → `[-0.5, 0.5, 0.5, 0.5]` using two draws. Changing range to 0..4 while holding `u = 0.75` → 3 without a draw. This fixture tests lifecycle/mapping, not a particular PRNG.

### Noise

**Purpose/signature:** `range min = -1`, `range max = 1` → `signal`. Baseline is temporal white uniform noise: draw one `u` in `[0, 1)` per executed tick and map it as Random does. Re-reading in one tick does not redraw. No implicit elapsed-time clock is required.

**State/configuration:** instance-local generator; optional seed configuration and determinism rules as Random. Configuration may name algorithm/version. **Edges:** reversed/equal ranges and non-finite inputs follow Random; suspension pauses stream advancement. Sample and frame rates give different spectra. **Extensions:** coordinate-driven coherent noise, octaves, Gaussian distributions and smoothing require named profiles with their own pin/range contracts. They are not equivalent to temporal white noise. No required shared editor format.

**Examples:** injected draws `[0, 0.25, 0.75]` with range -1..1 → `[-1, -0.5, 0.5]` over three ticks; a second consumer gets the same tick's value. A suspended instance consumes no draws. Statistical quality requires separate testing; these examples do not establish it.

### Slider

**Purpose/signature:** `value = 0.5` normalized, `min = 0`, `max = 1` → `signal`, optional `inverse`. Set `u = clamp(value, 0, 1)`; output `min + (max - min) * u` and inverse `min + (max - min) * (1 - u)`. Unlike Clamp, do not sort range bounds.

**State/configuration:** saved normalized manual value is node data/parameter state. Orientation and UI presentation are non-pin configuration. Connected/modulated value drives the effective output; a UI drag updates the base manual value through normal graph edits, not by deleting links. Output computation is pure; a headless instance can evaluate a saved value. No evaluation clock is needed.

**Edges/extensions/data:** reversed range, equal bounds and non-finite inputs follow shared policy. Drag cancellation must release pointer/gesture state. Log curves, signal crossfading, pickup and MIDI are named extensions. Shared Spagbol slider control is usable but does not itself implement this signal contract. No new serialized editor model is mandated.

**Examples:** value 0.25 and range 10..20 → signal 12.5, inverse 17.5; value 2 → 20 and 10; range 20..10 at 0.25 → 17.5 and 12.5.

### Button

**Purpose/signature:** no required numeric inputs → `signal`, optional `inverse`. Produce a numeric interactive control with configuration `mode = temporary` by default; `toggle` and `trigger` are other baseline modes. Output is 0/1 and inverse is `1 - signal`.

**Behaviour/state:** temporary outputs 1 while pressed, then 0 on release, cancellation, lost pointer capture or focus. Toggle flips the saved state once per accepted activation; initial state is 0 unless a saved toggle value says otherwise. Trigger queues one pulse for each accepted press activation: each pulse is one executed tick high with at least one low tick between pulses so edge consumers see each event. Release alone does not add a trigger. Initially idle temporary/trigger states are not restored as held presses on reload. Each instance owns its state and pending activations.

**Edges/extensions/data:** a UI-only flash duration is not the signal pulse length. Apps must state event delivery when UI and execution rates differ, and queue capacity/overflow policy. A suspended scope retains queued activations unless its profile says otherwise. Numeric signal routing, MIDI, smoothing and retrigger counters are extensions. Shared button UI callbacks require a host scheduling adapter; they are not a signal runtime or queue implementation. No new specialized editor format is required.

**Examples:** temporary press/release → 1 then 0; two toggle activations → 1 then 0; two queued trigger activations → `[1, 0, 1, 0]`. A cancelled temporary press → 0; ordinary activation does not mutate graph topology.

### Joystick

**Purpose/signature:** `x min = 0`, `x max = 1`, `y min = 0`, `y max = 1` → `x`, `y`, optional `x inverse`, `y inverse`. Saved normalized positions initially `(0.5, 0.5)` are interactive parameter state. Clamp each normalized coordinate to 0..1 and map each axis and inverse using Slider's formulas. Left/bottom mean 0; right/top mean 1, regardless of screen Y direction.

**State/configuration:** orientation/appearance are configuration; no required runtime clock. Holding position after release is baseline. Instances own positions; projected controls must target the correct instance. Non-finite saved positions use 0.5; numeric range inputs use their declared defaults. **Edges/extensions/data:** reversed/equal ranges work independently per axis. Pointer cancellation ends the gesture and retains the latest valid position. Elastic return, MIDI, snapping and numeric coordinate input pins are extensions. The shared Joystick component emits normalized x/y callbacks without defining a saved format.

**Examples:** position `(0, 1)` with both ranges 0..1 → x 0, y 1, x inverse 1, y inverse 0; x range -2..2 at x 0.75 → x 1, inverse -1. Releasing without elasticity leaves values unchanged.

### Curve

**Purpose/signature:** `position = 0` → `value`. Stateless lookup of configured numeric curve data, independent of clock, tempo, trigger, playback or evaluation rate.

**Logical configuration:** normalized positions 0..1, finite ordered points/segments, interpolation (baseline linear), and boundary mode (default clamp; repeat and mirror optional). Default shape is the constant-zero curve, with points `(0, 0)` and `(1, 0)`. Baseline points must include both endpoints and have unique strictly increasing positions. Duplicate positions, missing endpoints or non-finite data are invalid configuration; import adapters may normalize legacy data explicitly. Values need not be restricted to -1..1.

**Behaviour/edges:** clamp position to 0..1, find the containing segment and interpolate linearly. Exact point positions produce their point value. Repeat uses `p - floor(p)`, so 1 maps to 0 and -0.25 to 0.75. Mirror uses `q = p - 2 * floor(p / 2)`, then `q` if `q <= 1`, otherwise `2 - q`; 1 remains 1. Non-finite position uses 0. No state or hidden oscillator phase.

**Editor/data/extensions:** phase 4 extracts Teia's advanced UI with host callbacks, leaving model/edit operations in Teia, preserving curve banks, base-level endpoints, sustain regions, grid/group controls, gesture history and playback metadata through app wrappers. These logical rules do not define a shared wire schema; do not discard existing serialized data to fit a new two-point-only editor. Additional interpolation must define segment parameters and evaluation rules. Teia frequency/phase/trigger and playback modes are extensions, not requirements for arbitrary position evaluation.

**Examples:** points `[(0, 0), (0.5, 1), (1, 0)]`, linear clamp: positions `[-1, 0.25, 0.5, 1, 2]` → `[0, 0.5, 1, 0, 0]`. Ramp `[(0, 0), (1, 1)]`: position 1 → clamp 1, repeat 0, mirror 1; position -0.25 → repeat 0.75, mirror 0.25.

### Sequence

**Purpose/signature:** `position = 0` → `row 1` … `row n` (default one row). Stateless lookup of stored numeric rows. Baseline position uses normalized 0..1, not a clock pulse, musical beat or raw step index.

**Logical configuration:** positive integer step count (default 8), one or more stable-ID rows with finite numeric cells (default all zero), and boundary mode (default clamp; repeat/mirror optional as Curve). Each row has exactly the configured number of cells. Numeric cell values are unrestricted by musical notes, gates or velocity. Duplicate row IDs, zero steps/rows, mismatched lengths and non-finite cells produce configuration diagnostics. Resizing must be an explicit editor operation with a documented data-preservation policy.

**Behaviour/edges:** transform position with the chosen boundary mode; for `N` steps use `index = min(N - 1, floor(p * N))`. Cells hold their value until the next boundary; an exact internal boundary selects the following step. Clamp at 1 selects the last step; repeat at 1 selects the first. No implicit interpolation, trigger emission or skipped-step event playback when position jumps. Evaluation can run backward or revisit any position without mutation. Non-finite position uses 0. No instance playback state is required.

**Editor/data/extensions:** phase 4 reuses Teia's row/step editing, labels, moving/resizing gates, non-overlap rules, fractional positions, per-step velocities, mode conversion and hidden-data retention through a lossless adapter/extension model. These requirements preserve advanced app data; they do not force the generic numeric baseline to emit musical events. There is no Spagbol-owned serialized schema; applications supply view projections and handle edit callbacks. App clocks, trigger/reset inputs, multiple event outputs and beat length are wrappers/extensions. Step-index position must be an explicit mode or adapter, not silently substituted for normalized position.

**Examples:** row `[10, 20, 30, 40]`, clamp, positions `[-1, 0, 0.249, 0.25, 0.999, 1, 2]` → `[10, 10, 10, 20, 40, 40, 40]`. Repeat at 1 → 10; mirror at 1.25 → 40 (mapped position 0.75). A second row `[1, 2, 3, 4]` at 0.25 outputs 2 independently. The shared Sequencer UI is an editor surface, not this lookup evaluator.

## Adopting a contract

An application's profile should list each implemented node, its label/ID mapping, baseline revision and deviations. State the numeric precision and non-finite policy, evaluation cadence, time origin where app-specific clocks exist, trigger delivery, feedback, lifecycle order, resource limits and serialization adapter. Then translate the examples into that runtime's own checks. A matching label alone does not certify conformance; unsupported nodes and unevaluated edge cases remain explicit.

No conformance tests or application functionality were executed to produce this specification. The [comparison](standard-node-comparison.md) separates source observations from recommendations and records work still needed. Documentation completion does not establish web/firmware parity, hardware verification or identical sample/frame scheduling.
