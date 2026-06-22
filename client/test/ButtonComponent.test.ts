import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ButtonComponent from "../src/components/ButtonComponent.vue";

// A lightweight stand-in for ChoiceButton: exposes the wired-up onSelect as a
// real click and reflects the disabled prop, so we can test ButtonComponent's
// own behaviour without ChoiceButton's internals.
const ChoiceButtonStub = {
  name: "ChoiceButton",
  props: ["onSelect", "label", "keys", "style", "persistent", "disabled"],
  template: `<button :disabled="disabled" @click="onSelect">{{ label }}</button>`,
};

function mountButton(custom: Record<string, unknown>) {
  const socket = { emit: vi.fn() };
  const wrapper = mount(ButtonComponent, {
    props: { custom },
    global: {
      provide: { socket },
      stubs: { ChoiceButton: ChoiceButtonStub },
    },
  });
  return { wrapper, socket };
}

describe("ButtonComponent", () => {
  it("emits a `msg` envelope with the configured event + value when pressed", async () => {
    const { wrapper, socket } = mountButton({ event: "buzz", value: "B", label: "Press" });

    await wrapper.find("button").trigger("click");

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(
      "msg",
      expect.objectContaining({ event: "buzz", value: "B", ms: expect.any(Number) }),
    );
  });

  it("disables itself after a press so it can't be double-submitted", async () => {
    const { wrapper } = mountButton({ event: "buzz", value: "B" });
    expect(wrapper.find("button").attributes("disabled")).toBeUndefined();

    await wrapper.find("button").trigger("click");
    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
  });

  it("stays enabled and re-emits when marked persistent", async () => {
    const { wrapper, socket } = mountButton({ event: "buzz", value: "B", persistent: true });

    await wrapper.find("button").trigger("click");
    await wrapper.find("button").trigger("click");

    expect(wrapper.find("button").attributes("disabled")).toBeUndefined();
    expect(socket.emit).toHaveBeenCalledTimes(2);
  });
});
