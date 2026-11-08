# Spagbol conventions

- Name React components by ownership, prefixed with `Spagbol`: `SpagbolControlSlider`, `SpagbolControlButton`, `SpagbolCanvasMenu`. Use the same prefix for their props and related UI types.
- Give each rendered component a canonical kebab-case root class matching its name: `SpagbolControlSlider` → `spagbol-control-slider`. Descendant/state classes extend that root. Preserve the canonical class when a consumer adds a custom class.
- Adapt extracted code to these names; do not carry application-specific names or runtime dependencies into shared components.
- Node-frame bodies have no padding. Content components own any padding they require; sliders and buttons sit flush.
- Develop and build in Docker. Update the README and packed consumers when the public API changes. Do not start/restart apps or perform browser/runtime tests without the user's authorization.
