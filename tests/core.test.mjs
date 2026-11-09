import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GraphEditor,
  NodeRegistry,
  LinkModeRegistry,
  ObservationStore,
  emptyGraph,
  areaMembers,
  readDocument,
  writeDocument,
  readFragment,
  portsFor,
  standardLinkModes,
} from "../dist/core/index.js";

const nodes = new NodeRegistry([
  {
    kind: "scalar",
    label: "Scalar",
    createData: () => ({}),
    ports: () => [
      { id: "input", label: "input", direction: "input", defaultValue: 0 },
      { id: "output", label: "output", direction: "output" },
    ],
  },
  {
    kind: "dynamic",
    label: "Dynamic",
    createData: () => ({ count: 2 }),
    ports: (node) =>
      Array.from({ length: Number(node.data.count) }, (_, i) => ({
        id: `p${i}`,
        label: `input ${i + 1}`,
        direction: "input",
      })),
  },
  ...["group", "ins", "outs"].map((kind) => ({
    kind,
    label: kind,
    createData: () => ({}),
    ports: (node) => node.ports ?? [],
  })),
]);
function setup(extra = {}) {
  const editor = new GraphEditor({
    nodes,
    policy: { linkProperties: ["weight"] },
    ...extra,
  });
  const a = editor.addNode("scalar", { x: 0, y: 0 }),
    b = editor.addNode("scalar", { x: 300, y: 0 }),
    c = editor.addNode("scalar", { x: 0, y: 200 });
  const link = editor.connect(
    { nodeId: a, portId: "output" },
    { type: "port", nodeId: b, portId: "input" },
  );
  return { editor, a, b, c, link };
}
test("core can be imported with no DOM or React dependency", () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(new GraphEditor({ nodes }).graph.nodes.length, 0);
});
test("a gesture emits previews and one commit; undo/redo restores its boundaries", () => {
  const commits = [],
    previews = [];
  const { editor, a } = setup({
    onCommit: (event) => commits.push(event),
    onPreview: (event) => previews.push(event),
  });
  commits.length = 0;
  editor.beginGesture("Scrub");
  editor.setValue(a, "input", 1);
  editor.setValue(a, "input", 2);
  editor.commitGesture();
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].kinds, ["values"]);
  assert.equal(previews.filter(Boolean).length, 2);
  assert.equal(previews.at(-1), null);
  editor.undo();
  assert.equal(
    editor.graph.nodes.find((node) => node.id === a).values.input,
    0,
  );
  editor.redo();
  assert.equal(
    editor.graph.nodes.find((node) => node.id === a).values.input,
    2,
  );
});
test("cancelled transactions preserve redo and do not emit a commit", () => {
  const { editor, a } = setup();
  editor.setValue(a, "input", 10);
  editor.undo();
  editor.beginGesture("Cancelled");
  editor.setValue(a, "input", 5);
  editor.cancelGesture();
  assert.equal(editor.getSnapshot().canRedo, true);
  editor.redo();
  assert.equal(
    editor.graph.nodes.find((node) => node.id === a).values.input,
    10,
  );
});
test("selection and nested navigation are outside document history", () => {
  const commits = [];
  const { editor, a } = setup({ onCommit: (event) => commits.push(event) });
  commits.length = 0;
  editor.select({ nodeIds: [a] });
  assert.equal(commits.length, 0);
  assert.throws(() => {
    editor.getSnapshot().document.nodes[0].values.input = 99;
  }, TypeError);
});
test("stable link identity keeps recursive modulation attached during reconnection", () => {
  const { editor, a, b, c, link } = setup();
  const modulation = editor.connect(
    { nodeId: c, portId: "output" },
    { type: "link", linkId: link, property: "weight" },
    "add",
  );
  const nested = editor.connect(
    { nodeId: b, portId: "output" },
    { type: "link", linkId: modulation, property: "weight" },
    "bend",
  );
  editor.reconnect(
    link,
    { nodeId: a, portId: "output" },
    { type: "port", nodeId: c, portId: "input" },
  );
  assert.equal(
    editor.graph.links.find((item) => item.id === modulation).target.linkId,
    link,
  );
  assert.equal(
    editor.graph.links.find((item) => item.id === nested).target.linkId,
    modulation,
  );
  assert.throws(
    () =>
      editor.reconnect(
        link,
        { nodeId: a, portId: "output" },
        { type: "link", linkId: nested, property: "weight" },
      ),
    /descendants/,
  );
});
test("recursive deletion removes only dependent links", () => {
  const { editor, a, b, c, link } = setup();
  const modulation = editor.connect(
    { nodeId: c, portId: "output" },
    { type: "link", linkId: link, property: "weight" },
  );
  editor.connect(
    { nodeId: b, portId: "output" },
    { type: "link", linkId: modulation, property: "weight" },
  );
  const unrelated = editor.connect(
    { nodeId: a, portId: "output" },
    { type: "port", nodeId: c, portId: "input" },
  );
  editor.select({ linkIds: [link] });
  editor.deleteSelection();
  assert.deepEqual(
    editor.graph.links.map((item) => item.id),
    [unrelated],
  );
  editor.undo();
  assert.equal(editor.graph.links.length, 4);
});
test("copy/paste remaps every modulation identity without dangling targets", () => {
  const { editor, a, b, c, link } = setup();
  const modulation = editor.connect(
    { nodeId: c, portId: "output" },
    { type: "link", linkId: link, property: "weight" },
  );
  editor.connect(
    { nodeId: b, portId: "output" },
    { type: "link", linkId: modulation, property: "weight" },
  );
  editor.select({ nodeIds: [a, b, c] });
  const fragment = editor.copy();
  editor.paste(fragment);
  assert.equal(editor.graph.nodes.length, 6);
  assert.equal(editor.graph.links.length, 6);
  assert.equal(editor.diagnostics().length, 0);
  const old = new Set(fragment.links.map((link) => link.id));
  const copied = editor.graph.links.filter((link) => !old.has(link.id));
  for (const link of copied)
    if (link.target.type === "link") assert.ok(!old.has(link.target.linkId));
});
test("boundary links are retained only when requested", () => {
  const { editor, a } = setup();
  editor.select({ nodeIds: [a] });
  const fragment = editor.copy();
  assert.equal(fragment.boundaryLinks.length, 1);
  editor.paste(fragment);
  assert.equal(editor.graph.links.length, 1);
  editor.paste(fragment, { x: 30, y: 30 }, true);
  assert.equal(editor.graph.links.length, 2);
});
test("dynamic port removal prunes dependent modulation in the same undo entry", () => {
  const { editor, a, c } = setup();
  const id = editor.addNode("dynamic", { x: 500, y: 0 });
  const link = editor.connect(
    { nodeId: a, portId: "output" },
    { type: "port", nodeId: id, portId: "p1" },
  );
  editor.connect(
    { nodeId: c, portId: "output" },
    { type: "link", linkId: link, property: "weight" },
  );
  editor.updateNode(id, { data: { count: 1 } }, "structure");
  assert.equal(editor.graph.links.length, 1);
  editor.undo();
  assert.equal(editor.graph.links.length, 3);
});
test("port labels are independent of persistent port IDs", () => {
  const { editor, a, b } = setup();
  editor.updateNode(
    b,
    {
      kind: "group",
      ports: [{ id: "input", label: "a new label", direction: "input" }],
    },
    "structure",
  );
  assert.equal(editor.graph.links.length, 1);
  assert.equal(editor.diagnostics().length, 0);
  assert.equal(
    portsFor(
      editor.graph.nodes.find((node) => node.id === b),
      nodes,
    )[0].label,
    "a new label",
  );
});
test("duplicate connections and unsupported modes are rejected before mutation", () => {
  const { editor, a, b } = setup();
  const count = editor.graph.links.length;
  assert.throws(
    () =>
      editor.connect(
        { nodeId: a, portId: "output" },
        { type: "port", nodeId: b, portId: "input" },
      ),
    /already exists/,
  );
  assert.throws(
    () => editor.updateLink(editor.graph.links[0].id, { mode: "missing" }),
    /Unavailable/,
  );
  assert.equal(editor.graph.links.length, count);
});
test("custom link modes are data contracts with consumer capability gates", () => {
  const modes = new LinkModeRegistry([
    ...standardLinkModes,
    {
      id: "maximum",
      label: "maximum",
      color: "#fff",
      description: "Client supplied.",
      shortcut: "q",
    },
  ]);
  const { editor, a, c } = setup({
    modes,
    policy: { modes: ["set", "maximum"] },
  });
  editor.connect(
    { nodeId: a, portId: "output" },
    { type: "port", nodeId: c, portId: "input" },
    "maximum",
  );
  assert.throws(
    () =>
      editor.connect(
        { nodeId: c, portId: "output" },
        { type: "port", nodeId: a, portId: "input" },
        "bend",
      ),
    /unavailable/,
  );
});
test("area locks snapshot membership; later arrivals remain independent", () => {
  const { editor, a, b, c } = setup();
  const area = editor.addArea({ x: -10, y: -10 }, { width: 250, height: 150 });
  editor.lockArea(area, true);
  editor.updateNode(b, { position: { x: 20, y: 20 } }, "layout");
  editor.moveArea(area, { x: 90, y: 90 });
  assert.deepEqual(editor.graph.nodes.find((node) => node.id === a).position, {
    x: 100,
    y: 100,
  });
  assert.deepEqual(editor.graph.nodes.find((node) => node.id === b).position, {
    x: 20,
    y: 20,
  });
  assert.ok(!areaMembers(editor.graph, area).nodeIds.has(c));
});
test("unlocking an area restores containment and undo restores the membership snapshot without disabling content", () => {
  const { editor, a, b } = setup();
  const areaId = editor.addArea({ x: -10, y: -10 }, { width: 250, height: 150 });
  editor.lockArea(areaId, true);
  editor.updateNode(b, { position: { x: 20, y: 20 } }, "layout");
  const enabled = editor.graph.nodes.map(node => node.enabled);
  const links = editor.graph.links;
  assert.ok(areaMembers(editor.graph, areaId).nodeIds.has(a));
  assert.ok(!areaMembers(editor.graph, areaId).nodeIds.has(b));

  editor.lockArea(areaId, false);
  const area = editor.graph.areas.find(area => area.id === areaId);
  assert.equal(area.locked, false);
  assert.equal(area.nodeIds, undefined);
  assert.equal(area.areaIds, undefined);
  assert.ok(areaMembers(editor.graph, areaId).nodeIds.has(b));
  assert.deepEqual(editor.graph.nodes.map(node => node.enabled), enabled);
  assert.deepEqual(editor.graph.links, links);

  editor.undo();
  assert.equal(editor.graph.areas.find(area => area.id === areaId).locked, true);
  assert.ok(!areaMembers(editor.graph, areaId).nodeIds.has(b));
  editor.redo();
  assert.ok(areaMembers(editor.graph, areaId).nodeIds.has(b));
});

test("nested edits synchronize linked structure, retain independent instance overrides", () => {
  const { editor } = setup();
  const inner = emptyGraph();
  const control = nodes.create("scalar", { x: 0, y: 0 }, "control");
  inner.nodes.push(control);
  editor.edit("Add groups", "structure", (graph) => {
    for (const id of ["g1", "g2"])
      graph.nodes.push({
        ...nodes.create("group", { x: 0, y: 0 }, id),
        graph: structuredClone(inner),
        sharedGraphId: "shared",
        overrides: { control: { input: id === "g1" ? 10 : 20 } },
      });
  });
  editor.enter("g1");
  editor.setValue("control", "input", 5);
  editor.exit();
  for (const id of ["g1", "g2"])
    assert.equal(
      editor.graph.nodes.find((node) => node.id === id).graph.nodes[0].values
        .input,
      5,
    );
  assert.equal(
    editor.graph.nodes.find((node) => node.id === "g2").overrides.control.input,
    20,
  );
  editor.setOverride("g1", "control", "input", 50);
  editor.resetOverride("g1", "control");
  assert.equal(
    editor.graph.nodes.find((node) => node.id === "g1").overrides.control,
    undefined,
  );
});
test("node insertion retains original link settings and modulation at destination", () => {
  const { editor, a, c, link } = setup();
  editor.updateLink(link, { mode: "bend", weight: 0.25 });
  editor.connect(
    { nodeId: c, portId: "output" },
    { type: "link", linkId: link, property: "weight" },
  );
  const inserted = editor.insertNode(
    link,
    "scalar",
    { x: 150, y: 0 },
    "input",
    "output",
  );
  const original = editor.graph.links.find((item) => item.id === link);
  assert.equal(original.source.nodeId, inserted);
  assert.equal(original.mode, "bend");
  assert.equal(original.weight, 0.25);
  assert.ok(
    editor.graph.links.some(
      (item) =>
        item.source.nodeId === a &&
        item.target.nodeId === inserted &&
        item.weight === 1,
    ),
  );
  assert.equal(editor.diagnostics().length, 0);
});
test("grouping carries arithmetic and modulation once, through explicit boundary kinds", () => {
  const { editor, a, b, c, link } = setup();
  editor.updateLink(link, { mode: "multiply", weight: 0.3 });
  editor.connect(
    { nodeId: c, portId: "output" },
    { type: "link", linkId: link, property: "weight" },
    "add",
  );
  editor.select({ nodeIds: [b] });
  const id = editor.groupSelection({
    groupKind: "group",
    inputKind: "ins",
    outputKind: "outs",
  });
  const group = editor.graph.nodes.find((node) => node.id === id);
  assert.equal(group.graph.links.find((item) => item.id === link).weight, 0.3);
  assert.equal(
    group.graph.links.find((item) => item.id === link).mode,
    "multiply",
  );
  assert.equal(editor.graph.links.length, 2);
  assert.ok(
    editor.graph.links.every(
      (item) => item.weight === 1 && item.mode === "set",
    ),
  );
  assert.equal(editor.diagnostics().length, 0);
});
test("documents preserve extension payloads and execution-relevant link order", () => {
  const { editor } = setup();
  const document = structuredClone(editor.getSnapshot().document);
  document.data = { opaque: { nested: ["keep", 4] } };
  document.nodes[0].data.unknown = { retained: true };
  const result = readDocument(writeDocument(document));
  assert.deepEqual(result, document);
  assert.throws(() => readDocument({ ...document, version: 2 }), /Invalid/);
  assert.throws(
    () =>
      writeDocument({
        ...document,
        nodes: [{ ...document.nodes[0], position: { x: Infinity, y: 0 } }],
      }),
    /Invalid/,
  );
  assert.throws(
    () =>
      readFragment({
        format: "spagbol-fragment",
        version: 1,
        nodes: [],
        links: [{ id: "bad" }],
        areas: [],
        boundaryLinks: [],
      }),
    /Invalid/,
  );
});
test("observations target individual subscribers and never touch documents/history", () => {
  const store = new ObservationStore();
  const a = store.key(["group"], "node", "one"),
    b = store.key(["group"], "node", "two");
  let calls = 0;
  const unsubscribe = store.subscribe(a, () => calls++);
  store.set(b, 1);
  assert.equal(calls, 0);
  store.set(a, 3);
  assert.equal(calls, 1);
  store.clear();
  assert.equal(calls, 2);
  unsubscribe();
  store.set(a, 4);
  assert.equal(calls, 2);
});
test("controls and readonly modes enforce their editing boundaries", () => {
  const { editor, a } = setup();
  editor.setMode("controls");
  const length = editor.graph.nodes.length;
  editor.addNode("scalar", { x: 10, y: 10 });
  assert.equal(editor.graph.nodes.length, length);
  editor.setValue(a, "input", 7);
  assert.equal(
    editor.graph.nodes.find((node) => node.id === a).values.input,
    7,
  );
  editor.setMode("readonly");
  editor.setValue(a, "input", 9);
  assert.equal(
    editor.graph.nodes.find((node) => node.id === a).values.input,
    7,
  );
});
test("area duplication includes nested membership and remains serializable", () => {
  const { editor, a } = setup();
  const outer = editor.addArea({ x: -20, y: -20 }, { width: 260, height: 180 });
  const inner = editor.addArea({ x: -10, y: -10 }, { width: 230, height: 140 });
  editor.lockArea(outer, true);
  editor.select({ areaIds: [outer] });
  editor.duplicate();
  assert.equal(editor.graph.areas.length, 4);
  assert.equal(editor.graph.nodes.length, 4);
  assert.doesNotThrow(() => writeDocument(editor.getSnapshot().document));
  const duplicate = editor.graph.areas.find(
    (area) =>
      editor.getSnapshot().selection.areaIds.includes(area.id) && area.locked,
  );
  assert.ok(duplicate);
  assert.ok(!duplicate.nodeIds.includes(a));
  assert.ok(!duplicate.areaIds.includes(inner));
});
test("unregistered nodes and their links survive unrelated structural edits", () => {
  const { editor } = setup();
  editor.edit("Retain unknown content", "structure", (graph) => {
    graph.nodes.push({
      id: "unknown",
      kind: "future-kind",
      position: { x: 0, y: 0 },
      values: {},
      data: { retained: true },
    });
    graph.links.push({
      id: "retained-link",
      source: { nodeId: "unknown", portId: "unknown" },
      target: { type: "port", nodeId: graph.nodes[0].id, portId: "input" },
      mode: "set",
      weight: 1,
    });
  });
  const id = editor.addNode("dynamic", { x: 100, y: 100 });
  editor.updateNode(id, { data: { count: 3 } }, "structure");
  assert.ok(editor.graph.links.some((link) => link.id === "retained-link"));
  assert.ok(editor.diagnostics().some((item) => item.code === "unknown-node"));
});

test('type conversion remaps cable endpoints and preserves recursive strength identities atomically', () => {
  const registry = new NodeRegistry([...nodes.list().filter(definition => !definition.kind.startsWith("spagbol.")), { kind: 'renamed', label: 'Renamed', createData: () => ({}), ports: () => [
    { id: 'new input', label: 'new input', direction: 'input' },
    { id: 'new output', label: 'new output', direction: 'output' },
  ] }]);
  const { editor, a, b, c, link } = setup({ nodes: registry });
  const strength = editor.connect({ nodeId: c, portId: 'output' }, { type: 'link', linkId: link, property: 'weight' });
  const before = structuredClone(editor.graph);
  editor.changeNodeKind(a, 'renamed', { domain: 'payload' });
  assert.equal(editor.graph.links.find(item => item.id === link).source.portId, 'new output');
  assert.equal(editor.graph.links.find(item => item.id === strength).target.linkId, link);
  assert.equal(editor.graph.nodes.find(node => node.id === a).data.domain, 'payload');
  editor.undo();
  assert.deepEqual(editor.graph, before);
});
test('selection scaling preserves the shared visual center and is one undo entry', () => {
  const { editor, a, b, c } = setup();
  editor.select({ nodeIds: [a, b] });
  const before = structuredClone(editor.graph);
  editor.scaleSelection(2, new Map([[a, { width: 100, height: 100 }], [b, { width: 100, height: 100 }]]));
  assert.deepEqual(editor.graph.nodes.find(node => node.id === a).position, { x: -200, y: -50 });
  assert.deepEqual(editor.graph.nodes.find(node => node.id === b).position, { x: 400, y: -50 });
  assert.equal(editor.graph.nodes.find(node => node.id === a).scale, 2);
  assert.deepEqual(editor.graph.nodes.find(node => node.id === c), before.nodes.find(node => node.id === c));
  editor.undo();
  assert.deepEqual(editor.graph, before);
});

test('value edits retain unaffected node, port, cable, area, path and selection identities', () => {
  const { editor, a, b } = setup();
  editor.select({ nodeIds: [a] });
  const before = editor.getSnapshot(), graph = editor.graph;
  const unchanged = graph.nodes.find(node => node.id === b), changed = graph.nodes.find(node => node.id === a);
  editor.setValue(a, 'input', 0.25);
  const next = editor.getSnapshot();
  assert.equal(editor.graph.nodes.find(node => node.id === b), unchanged);
  assert.equal(editor.graph.nodes.find(node => node.id === a).ports, changed.ports);
  assert.equal(editor.graph.links, graph.links);
  assert.equal(editor.graph.areas, graph.areas);
  assert.equal(next.path, before.path);
  assert.equal(next.selection, before.selection);
  editor.undo(); assert.equal(editor.getSnapshot().document, before.document);
});
test('repeated numeric values and unchanged selections do not publish or allocate history', () => {
  const { editor, a } = setup();
  editor.setValue(a, 'input', 0.5);
  editor.select({ nodeIds: [a] });
  const before = editor.getSnapshot(); let notifications = 0;
  editor.subscribe(() => notifications++);
  editor.setValue(a, 'input', 0.5);
  editor.select({ nodeIds: [a] });
  assert.equal(notifications, 0); assert.equal(editor.getSnapshot(), before);
});
test('multiple numeric values publish once and undo together', () => {
  const { editor, a } = setup();
  const before = editor.graph; let notifications = 0;
  editor.subscribe(() => notifications++);
  editor.setValues(a, { input: 0.3, extra: 0.7, invalid: Infinity });
  assert.equal(notifications, 1);
  assert.deepEqual(editor.graph.nodes.find(node => node.id === a).values, { input: 0.3, extra: 0.7 });
  editor.undo(); assert.equal(editor.graph, before);
});

test('immutable node port definitions are reused and value edits invalidate dynamic definitions', () => {
  let evaluations = 0;
  const registry = new NodeRegistry([{ kind: 'counted', label: 'Counted', createData: () => ({}), ports: node => {
    evaluations++;
    return [{ id: 'count', label: 'count', direction: 'input', defaultValue: 1 }, ...Array.from({ length: node.values.count ?? 1 }, (_, i) => ({ id: `output ${i}`, label: `output ${i}`, direction: 'output' }))];
  } }]);
  const editor = new GraphEditor({ nodes: registry });
  const id = editor.addNode('counted', { x: 0, y: 0 });
  const node = editor.graph.nodes[0];
  const ports = portsFor(node, registry), count = evaluations;
  for (let i = 0; i < 100; i++) assert.equal(portsFor(node, registry), ports);
  assert.equal(evaluations, count);
  editor.setValue(id, 'count', 3);
  assert.equal(portsFor(editor.graph.nodes[0], registry).filter(port => port.direction === 'output').length, 3);
});
test('a continuous slider gesture updates live values and undoes as one edit', () => {
  const { editor, a } = setup();
  const before = editor.graph; let commits = 0;
  editor.onCommit(() => commits++);
  editor.beginGesture('Change slider value');
  for (let i = 1; i <= 20; i++) editor.setValue(a, 'input', i / 20);
  assert.equal(editor.graph.nodes.find(node => node.id === a).values.input, 1);
  assert.equal(commits, 0);
  editor.commitGesture(); assert.equal(commits, 1);
  editor.undo(); assert.equal(editor.graph, before);
});

test('port connection state ignores scalar edits but updates for link modes, disabled sources and rewiring', async () => {
  const { graphPortStates } = await import('../dist/react/portState.js');
  const { editor, a, b, c, link } = setup();
  const before = graphPortStates(editor.graph);
  assert(before.get(b).replaced.has('input'));
  editor.setValue(a, 'input', .5); assert.equal(graphPortStates(editor.graph), before);
  editor.updateLink(link, { mode: 'add' }); assert.equal(graphPortStates(editor.graph).get(b).replaced.has('input'), false);
  editor.undo(); assert(graphPortStates(editor.graph).get(b).replaced.has('input'));
  editor.updateNode(a, { enabled: false }, 'structure'); assert.equal(graphPortStates(editor.graph).get(b).replaced.has('input'), false);
  editor.undo(); editor.reconnect(link, { nodeId: a, portId: 'output' }, { type: 'port', nodeId: c, portId: 'input' });
  assert.equal(graphPortStates(editor.graph).get(b)?.inputs.has('input') ?? false, false);
  assert(graphPortStates(editor.graph).get(c).replaced.has('input'));
});
