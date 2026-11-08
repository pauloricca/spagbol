import { createRoot } from "react-dom/client";
import { SpagbolCanvas, GraphEditor, emptyGraph } from "@pauloricca/spagbol";
import "@pauloricca/spagbol/styles.css";
import { nodes, views } from "./nodes.js";
import "./styles.css";

// Remove this sample data to start with an empty canvas.
const graph = emptyGraph();
graph.nodes = [
  nodes.create("value", { x: 80, y: 80 }, "value"),
  nodes.create("slider", { x: 80, y: 280 }, "slider"),
  nodes.create("button", { x: 420, y: 340 }, "button"),
  nodes.create("output", { x: 420, y: 140 }, "output"),
];
graph.links = [
  {
    id: "example link",
    source: { nodeId: "value", portId: "signal" },
    target: { type: "port", nodeId: "output", portId: "value" },
    mode: "set",
    weight: 1,
  },
];
const editor = new GraphEditor({ nodes, document: graph });

// Reuse the root when Vite reloads this entry module.
const root =
  import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<SpagbolCanvas editor={editor} views={views} />);
