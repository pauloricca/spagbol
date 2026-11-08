import {
  NodeRegistry,
  SpagbolControlSlider,
  SpagbolControlButton,
  defineNodeView,
  type SpagbolNodeViewProps,
} from "@pauloricca/spagbol";

// Node data/ports are independent of their optional custom React views.
export const nodes = new NodeRegistry([
  {
    kind: "value",
    label: "Value",
    createData: () => ({}),
    ports: () => [
      { id: "value", label: "value", direction: "input", defaultValue: 0.5 },
      { id: "signal", label: "signal", direction: "output" },
    ],
  },
  {
    kind: "slider",
    label: "Slider",
    createData: () => ({}),
    ports: () => [{ id: "signal", label: "signal", direction: "output" }],
  },
  {
    kind: "button",
    label: "Button",
    createData: () => ({}),
    ports: () => [{ id: "signal", label: "signal", direction: "output" }],
  },
  {
    kind: "output",
    label: "Output",
    createData: () => ({}),
    ports: () => [{ id: "value", label: "value", direction: "input" }],
  },
]);

function Slider({ node, setValue, readOnly, beginGesture, endGesture }: SpagbolNodeViewProps) {
  return (
    <div inert={readOnly}>
      <SpagbolControlSlider
        value={node.values.value ?? 0.5}
        direction="horizontal"
        onGestureStart={() => beginGesture("Change slider value")}
        onGestureEnd={endGesture}
        onChange={(value) => setValue("value", value)}
      />
    </div>
  );
}
function Button({ node, setValue, readOnly }: SpagbolNodeViewProps) {
  return (
    <div inert={readOnly}>
      <SpagbolControlButton
        mode="toggle"
        pressed={node.values.pressed ?? 0}
        onPressedChange={(value) => setValue("pressed", value)}
        onClickPulse={() => setValue("clicks", (node.values.clicks ?? 0) + 1)}
      />
    </div>
  );
}
export const views = {
  slider: defineNodeView({ body: Slider }),
  button: defineNodeView({ body: Button }),
};
