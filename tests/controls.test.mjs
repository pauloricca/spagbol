import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphEditor, NodeRegistry } from "../dist/core/index.js";
import { SpagbolCanvas } from "../dist/react/index.js";
import {
  SpagbolControlSlider,
  SpagbolControlButton,
  SpagbolCanvasMenu,
} from "../dist/index.js";
import {
  rememberMeasurements,
  stationaryReconnectEdge,
} from "../dist/react/flowPresentation.js";

const nodes = new NodeRegistry();
test("consumer menu classes extend the component's canonical root and child classes", () => {
  const html = renderToStaticMarkup(
    createElement(
      SpagbolCanvasMenu,
      {
        className: "host-menu",
        menuClassName: "host-items",
        triggerClassName: "host-trigger",
      },
      createElement("button", null, "Action"),
    ),
  );
  assert.match(html, /class="spagbol-canvas-menu host-menu"/);
  assert.match(html, /class="spagbol-canvas-menu-items host-items"/);
  assert.match(html, /class="spagbol-canvas-menu-trigger host-trigger"/);
});
test("shared Teia slider respects external display values, bounds and orientation", () => {
  const html = renderToStaticMarkup(
    createElement(SpagbolControlSlider, {
      value: 0.2,
      displayValue: 0.75,
      direction: "vertical",
      onChange() {},
    }),
  );
  assert.match(html, /spagbol-control-slider-vertical/);
  assert.match(html, /height:75%/);
  assert.match(html, /step="0.001"/);
  assert.match(html, /value="0.75"/);
  const clamped = renderToStaticMarkup(
    createElement(SpagbolControlSlider, {
      value: 2,
      direction: "horizontal",
      onChange() {},
    }),
  );
  assert.match(clamped, /width:100%/);
  assert.match(clamped, /value="1"/);
});
test("shared Teia button exposes external toggle/temporary state and starts trigger flash unlit", () => {
  const button = (mode) =>
    renderToStaticMarkup(
      createElement(SpagbolControlButton, {
        mode,
        pressed: 1,
        onPressedChange() {},
        onClickPulse() {},
      }),
    );
  assert.match(button("toggle"), /aria-pressed="true"/);
  assert.match(button("temporary"), /spagbol-control-button-active/);
  assert.match(button("trigger"), /aria-pressed="false"/);
});
test("default canvas supplies separate corner actions and zoom controls without app callbacks", () => {
  const html = renderToStaticMarkup(
    createElement(SpagbolCanvas, { editor: new GraphEditor({ nodes }) }),
  );
  assert.match(html, /aria-label="Canvas zoom controls"/);
  assert.match(html, /aria-label="Zoom in"/);
  assert.match(html, /aria-label="Zoom out"/);
  assert.match(html, /aria-label="Fit graph to view"/);
  assert.match(html, /aria-label="Reset zoom to 100%/);
  assert.match(html, /aria-label="Canvas actions"/);
  assert.match(html, /aria-label="More actions"/);
  assert.match(html, /role="menuitemcheckbox" aria-label="Lock UI"/);
});
test("consumer actions and checked menu items render through the public canvas API", () => {
  const html = renderToStaticMarkup(
    createElement(SpagbolCanvas, {
      editor: new GraphEditor({ nodes }),
      controls: {
        buttons: [
          { id: "save", label: "SAVE", ariaLabel: "Save patch", onSelect() {} },
        ],
        menuItems: [
          {
            id: "theme",
            label: "DARK",
            ariaLabel: "Dark theme",
            checked: true,
            onSelect() {},
          },
        ],
        showHistory: false,
        showLayoutLock: false,
      },
    }),
  );
  assert.match(html, /aria-label="Save patch"/);
  assert.match(
    html,
    /role="menuitemcheckbox" aria-label="Dark theme"[^>]*aria-checked="true"/,
  );
  assert.doesNotMatch(html, /aria-label="Undo"/);
  assert.doesNotMatch(html, /aria-label="Lock UI"/);
});
test("built-in controls can be omitted and readonly cannot be unlocked through the menu", () => {
  const editor = new GraphEditor({ nodes });
  editor.setMode("readonly");
  const readonly = renderToStaticMarkup(
    createElement(SpagbolCanvas, { editor }),
  );
  assert.match(
    readonly,
    /role="menuitemcheckbox" aria-label="Unlock UI"[^>]*disabled=""/,
  );
  const hidden = renderToStaticMarkup(
    createElement(SpagbolCanvas, { editor, controls: false }),
  );
  assert.doesNotMatch(hidden, /aria-label="Canvas zoom controls"/);
  assert.doesNotMatch(hidden, /aria-label="Canvas actions"/);
});
test("measurement identities survive movement updates and unchanged remeasurement", () => {
  const cache = new Map();
  assert.equal(
    rememberMeasurements(cache, [
      {
        type: "dimensions",
        id: "node:a",
        dimensions: { width: 220, height: 130 },
      },
    ]),
    true,
  );
  const first = cache.get("node:a");
  assert.equal(
    rememberMeasurements(cache, [
      { type: "position", id: "node:a", position: { x: 100, y: 50 } },
    ]),
    false,
  );
  assert.equal(
    rememberMeasurements(cache, [
      {
        type: "dimensions",
        id: "node:a",
        dimensions: { width: 220, height: 130 },
      },
    ]),
    false,
  );
  assert.equal(cache.get("node:a"), first);
  assert.equal(
    rememberMeasurements(cache, [
      {
        type: "dimensions",
        id: "node:a",
        dimensions: { width: 250, height: 140 },
      },
    ]),
    true,
  );
  assert.deepEqual(cache.get("node:a"), { width: 250, height: 140 });
});
test("duplicate reconnection retains an inert original cable with independent display identity", () => {
  const original = Object.freeze({
    id: "link:a",
    source: "node:a",
    target: "anchor:b",
    sourceHandle: "out:signal",
    targetHandle: "property:weight",
    selected: true,
    data: Object.freeze({ link: { weight: 0.7, mode: "bend" }, dimmed: true }),
  });
  const preview = stationaryReconnectEdge(original);
  assert.notEqual(preview.id, original.id);
  assert.equal(preview.source, original.source);
  assert.equal(preview.target, original.target);
  assert.equal(preview.sourceHandle, original.sourceHandle);
  assert.equal(preview.targetHandle, original.targetHandle);
  assert.equal(preview.data.link, original.data.link);
  assert.equal(preview.selected, false);
  assert.equal(preview.reconnectable, false);
  assert.equal(preview.selectable, false);
  assert.equal(original.selected, true);
  assert.equal(original.data.dimmed, true);
});
test('the shared number preserves Teia numeric precision and replaced-value styling', async () => {
  const { SpagbolControlNumber, formatNumber } = await import('../dist/index.js');
  assert.equal(formatNumber(0.1234567890123), '0.1234567890123');
  const html = renderToStaticMarkup(createElement(SpagbolControlNumber, { value: 12.5, label: 'frequency', replaced: true, onChange() {} }));
  assert.match(html, /spagbol-control-number-replaced/);
  assert.match(html, /aria-label="frequency"/);
});
