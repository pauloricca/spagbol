import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphEditor, NodeRegistry, spagbolGroupKinds, effectiveGroupGraph, groupPanelLayout, readDocument, writeDocument } from '../dist/core/index.js';

const catalogue = () => new NodeRegistry([
  { kind: 'value', label: 'Value', createData: () => ({ text: 'default' }), ports: () => [
    { id: 'value', label: 'value', direction: 'input', defaultValue: 0.5 },
    { id: 'signal', label: 'signal', direction: 'output' },
  ] },
  { kind: 'output', label: 'Output', createData: () => ({}), ports: () => [{ id: 'value', label: 'value', direction: 'input' }] },
]);
test('default editor supports strength links and recursively removes them with their parent', () => {
  const editor = new GraphEditor({ nodes: catalogue() });
  const a = editor.addNode('value', { x: 0, y: 0 });
  const b = editor.addNode('output', { x: 300, y: 0 });
  const link = editor.connect({ nodeId: a, portId: 'signal' }, { type: 'port', nodeId: b, portId: 'value' });
  const modulation = editor.connect({ nodeId: a, portId: 'signal' }, { type: 'link', linkId: link, property: 'weight' });
  assert.equal(editor.graph.links.find(item => item.id === modulation).target.linkId, link);
  editor.select({ linkIds: [link] }); editor.deleteSelection();
  assert.equal(editor.graph.links.length, 0);
  editor.undo();
  assert.equal(editor.graph.links.length, 2);
  const constrained = new GraphEditor({ nodes: catalogue(), document: editor.getSnapshot().document, policy: { linkProperties: [] } });
  assert.equal(constrained.canConnect({ nodeId: a, portId: 'signal' }, { type: 'link', linkId: link, property: 'weight' }, 'set'), 'Link property weight is unavailable.');
});
function grouped() {
  const editor = new GraphEditor({ nodes: catalogue(), policy: { linkProperties: ['weight'] } });
  const a = editor.addNode('value', { x: 0, y: 0 });
  const b = editor.addNode('value', { x: 300, y: 0 });
  const c = editor.addNode('output', { x: 600, y: 0 });
  editor.connect({ nodeId: a, portId: 'signal' }, { type: 'port', nodeId: b, portId: 'value' }, 'add', { weight: 0.3 });
  editor.connect({ nodeId: b, portId: 'signal' }, { type: 'port', nodeId: c, portId: 'value' });
  editor.select({ nodeIds: [b] });
  const id = editor.groupSelection();
  return { editor, id, a, b, c };
}
test('grouping owns its built-in nodes and boundaries without app definitions', () => {
  const { editor, id, b } = grouped();
  const group = editor.graph.nodes.find(node => node.id === id);
  assert.equal(group.kind, spagbolGroupKinds.group);
  assert.equal(group.graph.nodes.length, 3);
  assert.deepEqual(group.ports.map(port => port.label), ['value', 'signal']);
  const original = group.graph.links.find(link => link.target.type === 'port' && link.target.nodeId === b);
  assert.equal(original.mode, 'add'); assert.equal(original.weight, 0.3);
  assert.equal(editor.graph.links.find(link => link.target.type === 'port' && link.target.nodeId === id).mode, 'set');
  const empty = editor.addNode(spagbolGroupKinds.group, { x: 0, y: 300 });
  assert.deepEqual(editor.graph.nodes.find(node => node.id === empty).graph.nodes.map(node => node.kind), [spagbolGroupKinds.inputs, spagbolGroupKinds.outputs]);
});
test('boundary edits synchronize linked groups while keeping cable identity; removal and undo are atomic', () => {
  const { editor, id } = grouped();
  editor.select({ nodeIds: [id] }); editor.duplicate();
  const copy = editor.getSnapshot().selection.nodeIds[0];
  const originalLinks = editor.graph.links.map(link => link.id);
  editor.enter(id);
  const inputs = editor.graph.nodes.find(node => node.kind === spagbolGroupKinds.inputs);
  const port = inputs.ports[0].id;
  editor.renameBoundaryPort(inputs.id, port, 'new value');
  editor.exit();
  for (const key of [id, copy]) assert.equal(editor.graph.nodes.find(node => node.id === key).ports[0].label, 'new value');
  assert.deepEqual(editor.graph.links.map(link => link.id), originalLinks);
  editor.enter(id); editor.removeBoundaryPort(inputs.id, port); editor.exit();
  assert.ok(!editor.graph.links.some(link => link.target.type === 'port' && link.target.nodeId === id));
  editor.undo(); editor.navigate([]);
  assert.deepEqual(editor.graph.links.map(link => link.id), originalLinks);
  editor.enter(id); editor.addBoundaryPort(inputs.id, 'second input');
  const added = editor.graph.nodes.find(node => node.id === inputs.id).ports[1].id;
  editor.moveBoundaryPort(inputs.id, added, 0); editor.exit();
  assert.equal(editor.graph.nodes.find(node => node.id === copy).ports[0].id, added);
});
test('controls areas and instance overrides preserve shared defaults and survive serialization', () => {
  const { editor, id, b } = grouped();
  editor.enter(id);
  editor.edit('Controls area', 'layout', graph => graph.areas.push({ id: 'ui', title: 'controls', position: { x: 280, y: -32 }, size: { width: 260, height: 180 } }));
  editor.exit();
  let group = editor.graph.nodes.find(node => node.id === id);
  assert.ok(groupPanelLayout(group).nodes.some(node => node.id === b));
  editor.setOverride(id, b, 'value', 0.9);
  editor.setDataOverride(id, b, { text: 'instance' });
  group = editor.graph.nodes.find(node => node.id === id);
  assert.equal(group.graph.nodes.find(node => node.id === b).values.value, 0.5);
  assert.equal(effectiveGroupGraph(group).nodes.find(node => node.id === b).data.text, 'instance');
  const restored = readDocument(writeDocument(editor.getSnapshot().document));
  assert.equal(effectiveGroupGraph(restored.nodes.find(node => node.id === id)).nodes.find(node => node.id === b).values.value, 0.9);
  editor.resetOverride(id, b);
  assert.equal(effectiveGroupGraph(editor.graph.nodes.find(node => node.id === id)).nodes.find(node => node.id === b).values.value, 0.5);
});
test('changing a node type prunes invalid cables and undo restores the original node and links', () => {
  const editor = new GraphEditor({ nodes: catalogue() });
  const a = editor.addNode('value', { x: 0, y: 0 }); const b = editor.addNode('output', { x: 300, y: 0 });
  const link = editor.connect({ nodeId: a, portId: 'signal' }, { type: 'port', nodeId: b, portId: 'value' });
  editor.changeNodeKind(a, 'output');
  assert.equal(editor.graph.nodes.find(node => node.id === a).kind, 'output');
  assert.equal(editor.graph.links.length, 0);
  editor.undo();
  assert.equal(editor.graph.nodes.find(node => node.id === a).kind, 'value');
  assert.equal(editor.graph.links[0].id, link);
});
test('area owner duplication remaps identity and removing the area removes its owner atomically', () => {
  const editor = new GraphEditor({ nodes: catalogue() });
  const owner = editor.addNode('value', { x: 0, y: 0 });
  editor.edit('Owned area', 'layout', graph => graph.areas.push({ id: 'area', ownerNodeId: owner, title: 'container', position: { x: 0, y: 0 }, size: { width: 300, height: 200 }, locked: true, nodeIds: [] }));
  editor.select({ areaIds: ['area'] }); editor.copy(); editor.paste();
  const copy = editor.graph.areas.find(area => area.id !== 'area');
  assert.notEqual(copy.ownerNodeId, owner);
  assert.ok(editor.graph.nodes.some(node => node.id === copy.ownerNodeId));
  editor.select({ areaIds: [copy.id] }); editor.deleteSelection();
  assert.ok(!editor.graph.nodes.some(node => node.id === copy.ownerNodeId));
  editor.undo();
  assert.ok(editor.graph.nodes.some(node => node.id === copy.ownerNodeId));
});
test('Ins defaults are edited through the shared numeric control command', () => {
  const { editor, id } = grouped();
  editor.enter(id);
  const ins = editor.graph.nodes.find(node => node.kind === spagbolGroupKinds.inputs);
  const port = ins.ports[0].id;
  editor.setValue(ins.id, port, 0.75);
  editor.exit();
  assert.equal(editor.graph.nodes.find(node => node.id === id).ports.find(item => item.id === port).defaultValue, 0.75);
});
test('dropping on a new boundary pin creates the port and cable in one undo entry', async () => {
  const { spagbolNewPortId } = await import('../dist/core/index.js');
  const { editor, id, b } = grouped();
  editor.enter(id);
  const outs = editor.graph.nodes.find(node => node.kind === spagbolGroupKinds.outputs);
  const before = JSON.stringify(editor.getSnapshot().document);
  assert.equal(editor.canConnect({ nodeId: b, portId: 'signal' }, { type: 'port', nodeId: outs.id, portId: spagbolNewPortId }, 'set'), undefined);
  const link = editor.connect({ nodeId: b, portId: 'signal' }, { type: 'port', nodeId: outs.id, portId: spagbolNewPortId });
  assert.notEqual(editor.graph.links.find(item => item.id === link).target.portId, spagbolNewPortId);
  editor.undo();
  assert.equal(JSON.stringify(editor.getSnapshot().document), before);
});
test('node-to-area conversion removes incident cables and undo restores the node', () => {
  const editor = new GraphEditor({ nodes: catalogue() });
  const a = editor.addNode('value', { x: 20, y: 40 });
  const b = editor.addNode('output', { x: 300, y: 40 });
  editor.connect({ nodeId: a, portId: 'signal' }, { type: 'port', nodeId: b, portId: 'value' });
  const area = editor.convertNodeToArea(a);
  assert.ok(editor.graph.areas.some(item => item.id === area));
  assert.equal(editor.graph.links.length, 0);
  editor.undo();
  assert.ok(editor.graph.nodes.some(node => node.id === a));
  assert.equal(editor.graph.links.length, 1);
});
test('modifier deletion bridges matching ports and retains unrelated strength chains', () => {
  const editor = new GraphEditor({ nodes: catalogue() });
  const a = editor.addNode('value', { x: 0, y: 0 });
  const b = editor.addNode('value', { x: 300, y: 0 });
  const c = editor.addNode('output', { x: 600, y: 0 });
  editor.connect({ nodeId: a, portId: 'signal' }, { type: 'port', nodeId: b, portId: 'value' }, 'set', { weight: 2 });
  editor.connect({ nodeId: b, portId: 'signal' }, { type: 'port', nodeId: c, portId: 'value' }, 'add', { weight: 3 });
  const unrelated = editor.connect({ nodeId: a, portId: 'signal' }, { type: 'port', nodeId: a, portId: 'value' });
  const modulation = editor.connect({ nodeId: a, portId: 'signal' }, { type: 'link', linkId: unrelated, property: 'weight' });
  editor.select({ nodeIds: [b] }); editor.deleteSelection(true);
  const bridge = editor.graph.links.find(link => link.target.type === 'port' && link.target.nodeId === c);
  assert.equal(bridge.source.nodeId, a); assert.equal(bridge.mode, 'add'); assert.equal(bridge.weight, 3);
  assert.ok(editor.graph.links.some(link => link.id === modulation));
  editor.undo(); assert.ok(editor.graph.nodes.some(node => node.id === b));
});
test('paste lifecycle reports the stable source-to-copy order for app resources', () => {
  let event;
  const editor = new GraphEditor({ nodes: catalogue(), onPaste: value => { event = value; } });
  const id = editor.addNode('value', { x: 0, y: 0 });
  editor.select({ nodeIds: [id] }); editor.duplicate();
  assert.equal(event.fragment.nodes[0].id, id);
  assert.equal(event.nodeIds[0], editor.getSnapshot().selection.nodeIds[0]);
  assert.ok(event.document.nodes.some(node => node.id === event.nodeIds[0]));
});
test('group UI exposure crops to its area rather than expanding to every full node', () => {
  const { editor, id, b } = grouped();
  editor.enter(id);
  editor.edit('UI crop', 'layout', graph => {
    const child = graph.nodes.find(node => node.id === b);
    child.position = { x: 10, y: 40 }; child.size = { width: 600, height: 400 };
    graph.areas.push({ id: 'crop', title: 'UI', position: { x: 0, y: 0 }, size: { width: 200, height: 100 } });
  });
  editor.exit();
  const layout = groupPanelLayout(editor.graph.nodes.find(node => node.id === id));
  assert.deepEqual(layout.position, { x: 0, y: 32 });
  assert.deepEqual(layout.size, { width: 200, height: 68 });
});
