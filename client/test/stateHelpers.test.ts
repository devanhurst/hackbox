import { describe, expect, it } from "vitest";
import { expandStatePresets } from "../src/lib/stateHelpers";
import type { PlayerStatePayload } from "../src/types";

// A minimal payload with the given components + presets, enough for
// expandStatePresets to operate on.
function payload(
  components: Array<{ key?: string; type: string; props: Record<string, unknown> }>,
  presets: Record<string, { type: string; props: Record<string, unknown> }> = {},
): PlayerStatePayload {
  return {
    theme: { header: {}, main: {} },
    ui: { header: {}, main: { components } },
    presets,
  } as unknown as PlayerStatePayload;
}

describe("expandStatePresets", () => {
  it("rewrites a component's type to the preset's and merges props (component wins)", () => {
    const state = payload([{ key: "k0", type: "Buzzer", props: { label: "Go" } }], {
      Buzzer: { type: "Button", props: { label: "Default", color: "red" } },
    });

    expandStatePresets(state);

    expect(state.ui.main.components).toEqual([
      { key: "k0", type: "Button", props: { label: "Go", color: "red" } },
    ]);
  });

  it("leaves components without a matching preset unchanged", () => {
    const original = { key: "k0", type: "Text", props: { text: "hi" } };
    const state = payload([original], { Buzzer: { type: "Button", props: {} } });

    expandStatePresets(state);

    expect(state.ui.main.components[0]).toEqual(original);
  });

  it("handles an absent presets map", () => {
    const state = payload([{ key: "k0", type: "Text", props: { text: "hi" } }]);
    delete (state as { presets?: unknown }).presets;

    expect(() => expandStatePresets(state)).not.toThrow();
    expect(state.ui.main.components[0]?.type).toBe("Text");
  });
});
