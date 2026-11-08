# Minimal Spagbol example

A minimal React/TypeScript app consuming the packed `@pauloricca/spagbol` package. It renders a full-page canvas with Value, Slider, Button and Output example nodes and one connection. All canvas styling, zoom controls, history and the MORE menu come from Spagbol.

## Start

```sh
docker compose up
```

Run these commands from `examples/minimal`. Open [the client](http://localhost:5187). Set `SPAGBOL_PORT` to change the port. Compose builds/packs the library, installs its tarball, watches library changes and runs Vite. After dependency or build-configuration changes, use `docker compose up --build`.

If the old separate client stack is still running, migrate it once from this directory:

```sh
docker compose -p spagbol-client down
docker compose up --build
```

This releases the old port and recreates containers with the new bind mounts. No running containers are changed automatically.

The library is mounted from `../..`; no checkout-discovery script or symlink is needed. To make a standalone app after publishing, copy the application scaffold, install Spagbol from npm, and replace the local-library preparation services with your app’s Vite Docker setup.

## Read or adapt

- `src/main.tsx`: sample graph, one editor instance and canvas mount. Delete the sample `graph.nodes`/`graph.links` assignments for an empty canvas.
- `src/nodes.tsx`: four node definitions and small bindings to Spagbol’s shared SpagbolControlSlider/SpagbolControlButton. Register your own definitions/views here; the slider/button implementations and styles live in Spagbol, shared with Teia.
- `src/styles.css`: full-page sizing. The canvas uses Spagbol's default Teia theme.

Double-click empty canvas to add a node. Drag pins to connect, or drop an output onto a cable to modulate its strength; select a cable to edit its mode or weight. Collapsed nodes reveal their ports when individually selected or hovered during a connection drag. Alt-drag nodes to duplicate and Cmd/Ctrl+Z to undo. The built-in corner controls provide zoom/fit, layout locking and grouping. Group, Ins and Outs are supplied by Spagbol alongside the four example definitions.

This is a UI scaffold: it has no evaluator, persistence, theme switcher or application shell. Connections describe a graph; they do not execute it. Refresh starts from the sample graph.

## Static checks

```sh
docker compose run --rm --no-deps prepare
docker compose run --rm --no-deps client npm run build
docker compose run --rm --no-deps client node scripts/check-packages.mjs
```

These commands prepare dependencies, compile TypeScript/build static assets and verify the installed public package; they do not launch the app. No source aliases bypass the package boundary. Docker/package preparation code lives in `scripts/`, separately from the example application.

Shared React components and CSS classes follow the same hierarchy: `SpagbolControlSlider` / `spagbol-control-slider`, `SpagbolControlButton` / `spagbol-control-button`, and `SpagbolCanvas` / `spagbol-canvas`. Node bodies have no default padding; add padding inside your own body component when needed.
