import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { SpagbolControlZoom } from "../dist/react/SpagbolControlZoom.js";
import { SPAGBOL_ZOOM_BASELINE, spagbolZoomPercentage, spagbolHeaderTitleScale } from "../dist/react/zoom.js";

test("100% retains Teia's half-scale viewport without changing stored coordinates", () => {
  assert.equal(SPAGBOL_ZOOM_BASELINE, 0.5);
  assert.equal(spagbolZoomPercentage(0.25), "50%");
  assert.equal(spagbolZoomPercentage(0.5), "100%");
  assert.equal(spagbolZoomPercentage(1), "200%");
  for (const zoom of [0, -1, NaN, Infinity]) assert.equal(spagbolZoomPercentage(zoom), "100%");
});

test("header detail thresholds use the same user zoom as Teia", () => {
  for (const [zoom, scale] of [[0.15, 2.2], [0.25, 1.75], [0.34, 1.3], [0.35, 1], [0.5, 1], [1, 1]]) {
    assert.equal(spagbolHeaderTitleScale(zoom), scale);
  }
});

test("zoom control labels half-scale as 100% and full-scale as 200%", () => {
  for (const [zoom, percentage] of [[0.5, "100%"], [1, "200%"]]) {
    const html = renderToStaticMarkup(createElement(ReactFlowProvider, null,
      createElement(SpagbolControlZoom, { zoom, layout: "corner" })));
    assert.ok(html.includes(`currently ${percentage}`));
    assert.ok(html.includes(`>${percentage}</button>`));
  }
});
