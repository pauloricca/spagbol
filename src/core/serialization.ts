import { clone, type GraphDocument, type JsonValue } from "./model.js";
import type { GraphFragment } from "./graph.js";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function point(value: unknown): boolean {
  return record(value) && finite(value.x) && finite(value.y);
}
function size(value: unknown): boolean {
  return (
    record(value) &&
    finite(value.width) &&
    value.width > 0 &&
    finite(value.height) &&
    value.height > 0
  );
}
function endpoint(value: unknown): boolean {
  return record(value) && string(value.nodeId) && string(value.portId);
}
function optional(
  value: unknown,
  predicate: (value: unknown) => boolean,
): boolean {
  return value === undefined || predicate(value);
}
function numberRecord(value: unknown): boolean {
  return record(value) && Object.values(value).every(finite);
}
export function isJsonValue(
  value: unknown,
  ancestors = new Set<object>(),
): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    finite(value)
  )
    return true;
  if (!Array.isArray(value) && !record(value)) return false;
  if (ancestors.has(value)) return false;
  const next = new Set([...ancestors, value]);
  return (
    Object.getPrototypeOf(value) ===
      (Array.isArray(value) ? Array.prototype : Object.prototype) &&
    Object.values(value).every((child) => isJsonValue(child, next))
  );
}
function boolean(value: unknown): boolean {
  return typeof value === "boolean";
}
function strings(value: unknown): boolean {
  return Array.isArray(value) && value.every(string);
}
function node(value: unknown, depth: number): boolean {
  return (
    record(value) &&
    string(value.id) &&
    string(value.kind) &&
    point(value.position) &&
    record(value.data) &&
    isJsonValue(value.data) &&
    numberRecord(value.values) &&
    optional(value.label, (text) => typeof text === "string") &&
    optional(value.size, size) &&
    optional(value.enabled, boolean) &&
    optional(value.compact, boolean) &&
    optional(value.compactLabel, text => typeof text === "string") &&
    optional(value.scale, scale => finite(scale) && scale > 0) &&
    optional(value.sharedGraphId, string) &&
    optional(value.panelNodeIds, strings) &&
    optional(value.dataOverrides, values => record(values) && Object.values(values).every(item => record(item) && isJsonValue(item))) &&
    optional(
      value.overrides,
      (overrides) =>
        record(overrides) && Object.values(overrides).every(numberRecord),
    ) &&
    optional(
      value.ports,
      (ports) =>
        Array.isArray(ports) &&
        ports.every(
          (port) =>
            record(port) &&
            string(port.id) &&
            string(port.label) &&
            (port.direction === "input" || port.direction === "output") &&
            optional(port.dataType, string) &&
            optional(port.connectable, boolean) &&
            optional(port.valueEditor, boolean) &&
            optional(port.integer, boolean) &&
            ["defaultValue", "min", "max", "step"].every((key) =>
              optional(port[key], finite),
            ) &&
            !(finite(port.min) && finite(port.max) && port.min > port.max),
        ),
    ) &&
    optional(value.graph, (graph) => document(graph, depth + 1))
  );
}
function link(value: unknown): boolean {
  return (
    record(value) &&
    string(value.id) &&
    endpoint(value.source) &&
    record(value.target) &&
    ((value.target.type === "port" && endpoint(value.target)) ||
      (value.target.type === "link" &&
        string(value.target.linkId) &&
        string(value.target.property))) &&
    string(value.mode) &&
    finite(value.weight) &&
    optional(value.enabled, boolean) &&
    optional(value.data, (data) => record(data) && isJsonValue(data))
  );
}
function area(value: unknown): boolean {
  return (
    record(value) &&
    optional(value.ownerNodeId, string) &&
    string(value.id) &&
    typeof value.title === "string" &&
    point(value.position) &&
    size(value.size) &&
    optional(value.locked, boolean) &&
    optional(value.collapsed, boolean) &&
    optional(value.nodeIds, strings) &&
    optional(value.areaIds, strings) &&
    optional(value.controlHeight, (height) => finite(height) && height >= 0) &&
    optional(value.data, (data) => record(data) && isJsonValue(data))
  );
}
function document(value: unknown, depth: number): boolean {
  return (
    depth <= 32 &&
    record(value) &&
    value.format === "spagbol" &&
    value.version === 1 &&
    Array.isArray(value.nodes) &&
    value.nodes.every((candidate) => node(candidate, depth)) &&
    Array.isArray(value.links) &&
    value.links.every(link) &&
    Array.isArray(value.areas) &&
    value.areas.every(area) &&
    optional(value.data, (data) => record(data) && isJsonValue(data))
  );
}
export function assertDocument(value: unknown): asserts value is GraphDocument {
  if (!isJsonValue(value) || !document(value, 0))
    throw new Error(
      "Invalid Spagbol document. Expected format spagbol/version 1, finite JSON data and valid node/link/area shapes (maximum nesting 32).",
    );
}
/** Preserve array order. Never sort links as a side effect of serialization. */
export function writeDocument(value: GraphDocument): string {
  assertDocument(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}
export function readDocument(input: string | unknown): GraphDocument {
  const parsed: unknown = typeof input === "string" ? JSON.parse(input) : input;
  assertDocument(parsed);
  return clone(parsed);
}
export function readFragment(input: string | unknown): GraphFragment {
  const parsed: unknown = typeof input === "string" ? JSON.parse(input) : input;
  if (
    !record(parsed) ||
    parsed.format !== "spagbol-fragment" ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.boundaryLinks) ||
    !parsed.boundaryLinks.every(link)
  )
    throw new Error("Invalid Spagbol clipboard fragment.");
  assertDocument({ ...parsed, format: "spagbol" });
  return clone(parsed) as unknown as GraphFragment;
}
