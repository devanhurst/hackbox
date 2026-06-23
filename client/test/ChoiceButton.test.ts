import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChoiceButton from "../src/components/Choices/ChoiceButton.vue";

function mountChoice(props: Record<string, unknown> = {}) {
  return mount(ChoiceButton, {
    attachTo: document.body, // window keydown listener needs a live DOM
    props: { label: "Go", ...props },
  });
}

describe("ChoiceButton press feedback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("flashes the pressed class on click, then clears it", async () => {
    const wrapper = mountChoice();
    const button = wrapper.find("button");

    await button.trigger("click");
    expect(button.classes()).toContain("choice--pressed");

    vi.advanceTimersByTime(150);
    await wrapper.vm.$nextTick();
    expect(button.classes()).not.toContain("choice--pressed");

    wrapper.unmount();
  });

  it("flashes the pressed class when triggered by a mapped keypress", async () => {
    const wrapper = mountChoice({ keys: ["A"], persistent: true });
    const button = wrapper.find("button");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await wrapper.vm.$nextTick();
    expect(button.classes()).toContain("choice--pressed");

    wrapper.unmount();
  });

  it("re-arms the flash on a repeated press of a persistent button", async () => {
    const wrapper = mountChoice({ persistent: true });
    const button = wrapper.find("button");

    await button.trigger("click");
    vi.advanceTimersByTime(100); // partway through the first flash
    await button.trigger("click"); // should restart the timer
    vi.advanceTimersByTime(100); // 200ms after the first press, 100ms after the second
    await wrapper.vm.$nextTick();
    expect(button.classes()).toContain("choice--pressed");

    vi.advanceTimersByTime(50); // now 150ms past the second press
    await wrapper.vm.$nextTick();
    expect(button.classes()).not.toContain("choice--pressed");

    wrapper.unmount();
  });
});
