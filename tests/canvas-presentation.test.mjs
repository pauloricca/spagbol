import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GraphEditor,
  NodeRegistry,
  copyFragment,
} from "../dist/core/index.js";
import { duplicateDragPresentation } from "../dist/react/duplicateDrag.js";
import {
  visibleContentBounds,
  translateExtentForVisibleContent,
  clampViewportToTranslateExtent,
} from "../dist/react/viewport.js";

const nodes = new NodeRegistry([
  {
    kind: "node",
    label: "Node",
    createData: () => ({}),
    ports: () => [
      { id: "in", label: "input", direction: "input" },
      { id: "out", label: "output", direction: "output" },
    ],
  },
]);
function scene() {
  const editor = new GraphEditor({
    nodes,
    policy: { linkProperties: ["weight"] },
  });
  const a = editor.addNode("node", { x: 10, y: 20 });
  const b = editor.addNode("node", { x: 300, y: 40 });
  const c = editor.addNode("node", { x: 500, y: 80 });
  const link = editor.connect(
    { nodeId: a, portId: "out" },
    { type: "port", nodeId: b, portId: "in" },
  );
  const modulation = editor.connect(
    { nodeId: b, portId: "out" },
    { type: "link", linkId: link, property: "weight" },
  );
  editor.connect(
    { nodeId: b, portId: "out" },
    { type: "port", nodeId: c, portId: "in" },
  );
  const fragment = copyFragment(editor.graph, [a, b]);
  const drag = {
    namespace: "preview",
    fragment,
    origin: { x: 10, y: 20 },
    nodeId: a,
    positions: new Map([
      [a, { x: 110, y: 120 }],
      [b, { x: 400, y: 140 }],
    ]),
    external: false,
  };
  return { editor, a, b, c, link, modulation, drag };
}
test("duplicate drag keeps stationary originals and moving previews outside the saved document", () => {
  const { editor, a, b, drag } = scene();
  const before = JSON.stringify(editor.getSnapshot().document);
  const { graph, originalNodes } = duplicateDragPresentation(
    editor.graph,
    drag,
  );
  assert.equal(graph.nodes.length, 5);
  assert.deepEqual(graph.nodes.find((node) => node.id === a).position, {
    x: 110,
    y: 120,
  });
  const alias = [...originalNodes].find(([, node]) => node.id === a)[0];
  assert.deepEqual(graph.nodes.find((node) => node.id === alias).position, {
    x: 10,
    y: 20,
  });
  assert.ok(originalNodes.has(`preview:origin:${b}`));
  assert.equal(JSON.stringify(editor.getSnapshot().document), before);
});
test("original cables remain on original nodes; copied modulation follows preview cables", () => {
  const { editor, a, link, modulation, drag } = scene();
  const result = duplicateDragPresentation(editor.graph, drag);
  assert.equal(
    result.graph.links.find((item) => item.id === link).source.nodeId,
    `preview:origin:${a}`,
  );
  const previewLink = [...result.previewLinks].find(([, id]) => id === link)[0];
  const previewModulation = [...result.previewLinks].find(
    ([, id]) => id === modulation,
  )[0];
  assert.equal(
    result.graph.links.find((item) => item.id === previewLink).source.nodeId,
    a,
  );
  assert.equal(
    result.graph.links.find((item) => item.id === previewModulation).target
      .linkId,
    previewLink,
  );
  assert.equal(result.previewLinks.size, 2);
  assert.equal(
    duplicateDragPresentation(editor.graph, { ...drag, external: true })
      .previewLinks.size,
    3,
  );
});
test("dropping a duplicate is one history entry, with source positions intact", () => {
  const { editor, a, drag } = scene();
  const before = JSON.stringify(editor.getSnapshot().document);
  const events = [];
  editor.onCommit((event) => events.push(event));
  editor.beginGesture("Duplicate nodes");
  duplicateDragPresentation(editor.graph, drag);
  assert.equal(events.length, 0);
  editor.paste(drag.fragment, { x: 100, y: 100 });
  editor.commitGesture();
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].kinds, ["structure"]);
  assert.deepEqual(editor.graph.nodes.find((node) => node.id === a).position, {
    x: 10,
    y: 20,
  });
  editor.undo();
  assert.equal(JSON.stringify(editor.getSnapshot().document), before);
});
test("cancelling duplicate presentation adds no nodes and keeps redo available", () => {
  const { editor, a, drag } = scene();
  editor.setValue(a, "in", 3);
  editor.undo();
  const before = JSON.stringify(editor.getSnapshot().document);
  editor.beginGesture("Duplicate nodes");
  duplicateDragPresentation(editor.graph, drag);
  editor.cancelGesture();
  assert.equal(JSON.stringify(editor.getSnapshot().document), before);
  assert.equal(editor.getSnapshot().canRedo, true);
});

const items = [
  { position: { x: 100, y: 200 }, size: { width: 200, height: 100 } },
];
const size = { width: 1000, height: 500 };
test("pan extent uses Teia's 70% screen margin at every zoom", () => {
  assert.deepEqual(
    translateExtentForVisibleContent(items, { x: 0, y: 0, zoom: 1 }, size),
    [
      [-600, -150],
      [1000, 650],
    ],
  );
  assert.deepEqual(
    translateExtentForVisibleContent(items, { x: 0, y: 0, zoom: 2 }, size),
    [
      [-250, 25],
      [650, 475],
    ],
  );
});
test("panning stops at every edge and remains finite for an empty graph", () => {
  const extent = translateExtentForVisibleContent(
    items,
    { x: 0, y: 0, zoom: 1 },
    size,
  );
  assert.deepEqual(
    clampViewportToTranslateExtent(
      { x: 10000, y: 10000, zoom: 1 },
      extent,
      size,
    ),
    { x: 600, y: 150, zoom: 1 },
  );
  const opposite = clampViewportToTranslateExtent(
    { x: -10000, y: -10000, zoom: 1 },
    extent,
    size,
  );
  assert.equal(Math.abs(opposite.x), 0);
  assert.equal(opposite.y, -150);
  const emptyExtent = translateExtentForVisibleContent(
    [],
    { x: 0, y: 0, zoom: 1 },
    size,
  );
  assert.ok(
    Object.values(
      clampViewportToTranslateExtent(
        { x: 99999, y: -99999, zoom: 1 },
        emptyExtent,
        size,
      ),
    ).every(Number.isFinite),
  );
});
test("bounds ignore hidden content and react to measured sizes, deletion and container resize", () => {
  const hidden = {
    position: { x: -100000, y: -100000 },
    size: { width: 999, height: 999 },
    hidden: true,
  };
  assert.deepEqual(visibleContentBounds([...items, hidden]), {
    x: 100,
    y: 200,
    width: 200,
    height: 100,
  });
  const extent = translateExtentForVisibleContent(
    items,
    { x: 0, y: 0, zoom: 1 },
    { width: 500, height: 250 },
  );
  assert.deepEqual(extent, [
    [-250, 25],
    [650, 475],
  ]);
  const small = translateExtentForVisibleContent(
    items,
    { x: 0, y: 0, zoom: 1 },
    size,
  );
  assert.equal(
    clampViewportToTranslateExtent({ x: -5000, y: -5000, zoom: 1 }, small, size)
      .y,
    -150,
  );
});
test('area hierarchy preview keeps stationary originals and moves the complete copy without changing the document', () => {
  const { editor, a, b } = scene();
  editor.edit('Area', 'layout', graph => graph.areas.push({ id: 'container', title: 'area', position: { x: 0, y: 0 }, size: { width: 500, height: 300 }, locked: true, nodeIds: [a, b] }));
  const fragment = copyFragment(editor.graph, [], ['container']);
  const before = JSON.stringify(editor.graph);
  const drag = { namespace: 'area-preview', fragment, origin: { x: 0, y: 0 }, nodeId: '', external: false,
    positions: new Map(fragment.nodes.map(node => [node.id, { x: node.position.x + 100, y: node.position.y + 50 }])),
    areaPositions: new Map([['container', { x: 100, y: 50 }]]),
  };
  const result = duplicateDragPresentation(editor.graph, drag);
  assert.equal(result.graph.areas.length, 2);
  assert.deepEqual(result.graph.areas.find(area => area.id === 'container').position, { x: 100, y: 50 });
  const original = result.graph.areas.find(area => result.originalAreas.has(area.id));
  assert.deepEqual(original.position, { x: 0, y: 0 });
  assert.ok(original.nodeIds.every(id => result.originalNodes.has(id)));
  assert.equal(JSON.stringify(editor.graph), before);
});

test('unchanged native flow nodes and cables survive a value edit with their identities intact', async () => {
  const { reuseFlowPresentations } = await import('../dist/react/flowPresentation.js');
  const a = { id: 'a', data: { node: { id: 'a', values: { value: 0 } } }, position: { x: 0, y: 0 }, style: { width: 200 }, measured: { width: 200, height: 100 } };
  const b = { ...a, id: 'b', data: { node: { id: 'b' } } };
  const link = { id: 'link', data: { link: { id: 'link' }, selected: false }, source: 'a', target: 'b' };
  const before = [a, b, link];
  const next = reuseFlowPresentations(before, [{ ...a, data: { node: { id: 'a', values: { value: .5 } } } }, { ...b, data: { ...b.data }, style: { ...b.style }, position: { ...b.position }, measured: { ...b.measured } }, { ...link, data: { ...link.data } }]);
  assert.notEqual(next[0], a); assert.equal(next[1], b); assert.equal(next[2], link);
  assert.equal(reuseFlowPresentations(next, next.map(item => ({ ...item }))), next);
  const resized = reuseFlowPresentations(next, next.map(item => item.id === 'b' ? { ...item, style: { width: 300 } } : item));
  assert.notEqual(resized[1], b); assert.equal(resized[2], link);
});


test("ordinary node dragging previews outside the document and commits all positions once", async () => {
  const { previewNodePositions, applyNodePositions } = await import('../dist/react/nodeDrag.js');
  const { editor, a, b } = scene();
  const before = editor.getSnapshot().document;
  const commits = []; editor.onCommit(event => commits.push(event));
  let preview = new Map(); editor.beginGesture('Move nodes');
  for (let i = 1; i <= 120; i++) preview = previewNodePositions(preview, [
    { type: 'position', id: `node:${a}`, position: { x: i, y: i + 20 } },
    { type: 'position', id: `node:${b}`, position: { x: i + 300, y: i + 40 } },
  ]);
  assert.equal(editor.getSnapshot().document, before); assert.equal(commits.length, 0);
  const stable = previewNodePositions(preview, [{type:'position',id:`node:${a}`,position:{x:120,y:140}}]); assert.equal(stable,preview);
  editor.edit('Move nodes', 'layout', graph => applyNodePositions(graph, preview)); editor.commitGesture();
  assert.equal(commits.length, 1); assert.deepEqual(editor.graph.nodes.find(n => n.id === a).position, {x:120,y:140});
  assert.deepEqual(editor.graph.nodes.find(n => n.id === b).position, {x:420,y:160});
  editor.undo(); assert.equal(editor.getSnapshot().document, before); editor.redo(); assert.deepEqual(editor.graph.nodes.find(n => n.id === a).position, {x:120,y:140});
});
test("cancelled position previews preserve redo, ignore invalid geometry and do not mutate their inputs", async () => {
  const { previewNodePositions } = await import('../dist/react/nodeDrag.js');
  const { editor, a } = scene(); editor.setValue(a,'in',2); editor.undo();
  const before=editor.getSnapshot().document; editor.beginGesture('Move nodes');
  const initial = new Map(); const preview=previewNodePositions(initial,[{type:'position',id:`node:${a}`,position:{x:25,y:30}},{type:'position',id:`node:${a}`,position:{x:NaN,y:0}},{type:'position',id:'anchor:x',position:{x:0,y:0}}]);
  assert.equal(initial.size,0); assert.equal(preview.size,1); editor.cancelGesture();
  assert.equal(editor.getSnapshot().document,before); assert.equal(editor.getSnapshot().canRedo,true);
});
