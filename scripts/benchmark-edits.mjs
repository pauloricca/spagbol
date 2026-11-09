import { GraphEditor, NodeRegistry } from '../dist/core/index.js';

// Diagnostic only: measures generic controller edits, not canvas drag previews.
const nodes = new NodeRegistry([{
  kind: 'scalar', label: 'Scalar', createData: () => ({}),
  ports: () => [
    { id: 'a', label: 'a', direction: 'input' },
    { id: 'v', label: 'v', direction: 'output' },
  ],
}]);

for (const count of [107, 1000]) {
  const document = {
    format: 'spagbol', version: 1, areas: [],
    nodes: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`, kind: 'scalar', position: { x: i, y: 0 }, data: {}, values: { a: 1 },
    })),
    links: Array.from({ length: count - 1 }, (_, i) => ({
      id: `e${i}`, source: { nodeId: `n${i}`, portId: 'v' },
      target: { type: 'port', nodeId: `n${i + 1}`, portId: 'a' }, mode: 'set', weight: 1,
    })),
  };
  for (const kind of ['layout', 'values']) {
    const samples = [];
    for (let trial = 0; trial < 7; trial++) {
      const editor = new GraphEditor({ nodes, document });
      let stringifyMs = 0;
      const stringify = JSON.stringify;
      JSON.stringify = function (...args) {
        const start = performance.now();
        const result = stringify.apply(this, args);
        stringifyMs += performance.now() - start;
        return result;
      };
      try {
        editor.beginGesture('bench');
        const start = performance.now();
        for (let step = 0; step < 120; step++) {
          editor.edit('bench', kind, graph => {
            if (kind === 'layout') graph.nodes[0].position.x = step;
            else graph.nodes[0].values.a = step;
          });
        }
        samples.push({ editMs: performance.now() - start, stringifyMs });
      } finally {
        JSON.stringify = stringify;
      }
    }
    samples.sort((a, b) => a.editMs - b.editMs);
    console.log(JSON.stringify({ count, kind, ...samples[3] }));
  }
}
