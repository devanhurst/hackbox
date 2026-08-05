import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import BuzzerComponent from "../src/components/BuzzerComponent.vue";
import RangeComponent from "../src/components/RangeComponent.vue";
import TextComponent from "../src/components/TextComponent.vue";
import TextInputComponent from "../src/components/TextInputComponent.vue";

// Between-component spacing is the component's own `margin` default, applied
// inline from the style object — there is no layout-level fallback any more.
// PlayerView used to carry a `.player-component { margin-block: 10px }` rule
// that, because PlayerView is a lazy route chunk, loaded *after* the component
// CSS and silently beat whatever `margin` a host sent. Once styles moved to an
// inline binding the inline value won instead, so any component missing a
// `margin` default lost its spacing entirely. Keep every root covered.
const components = [
  { name: "Text", component: TextComponent, custom: {} },
  { name: "TextInput", component: TextInputComponent, custom: { event: "guess" } },
  { name: "Range", component: RangeComponent, custom: { event: "range" } },
  { name: "Buzzer", component: BuzzerComponent, custom: { event: "buzz" } },
];

function mountComponent(component: unknown, custom: Record<string, unknown>) {
  return mount(component as never, {
    props: { custom },
    global: {
      provide: { socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } },
      stubs: { "font-awesome-icon": true },
    },
  });
}

describe("component style defaults", () => {
  it.each(components)("$name applies a default vertical margin inline", ({ component, custom }) => {
    const style = (mountComponent(component, custom).element as HTMLElement).style;

    expect(style.marginTop).toBe("10px");
    expect(style.marginBottom).toBe("10px");
  });

  it.each(components)("$name lets the host override the margin", ({ component, custom }) => {
    const wrapper = mountComponent(component, { ...custom, style: { margin: "40px 0px" } });
    const style = (wrapper.element as HTMLElement).style;

    expect(style.marginTop).toBe("40px");
    expect(style.marginBottom).toBe("40px");
  });

  it.each(components)(
    "$name keeps its margin when the host sets other keys",
    ({ component, custom }) => {
      const wrapper = mountComponent(component, { ...custom, style: { background: "navy" } });
      const style = (wrapper.element as HTMLElement).style;

      expect(style.background).toBe("navy");
      expect(style.marginTop).toBe("10px");
      expect(style.marginBottom).toBe("10px");
    },
  );
});
