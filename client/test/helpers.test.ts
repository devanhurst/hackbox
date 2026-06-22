import { describe, expect, it } from "vitest";
import { applyLegacyAlign, mergeProps } from "../src/lib/helpers";

describe("applyLegacyAlign", () => {
  it("expands the deprecated `align` key onto justifyContent + textAlign", () => {
    expect(applyLegacyAlign({ align: "center", color: "red" })).toEqual({
      justifyContent: "center",
      textAlign: "center",
      color: "red",
    });
  });

  it("passes other styles through untouched when there is no `align`", () => {
    expect(applyLegacyAlign({ color: "red" })).toEqual({ color: "red" });
  });

  it("returns an empty object for an undefined style", () => {
    expect(applyLegacyAlign(undefined)).toEqual({});
  });
});

describe("mergeProps", () => {
  it("fills in defaults the custom props omit", () => {
    expect(mergeProps({ label: "A", value: "A" }, { label: "Buzz" })).toEqual({
      label: "Buzz",
      value: "A",
    });
  });

  it("deep-merges nested style objects", () => {
    const merged = mergeProps(
      { style: { color: "black", fontSize: "16px" } },
      { style: { color: "red" } },
    );
    expect(merged.style).toEqual({ color: "red", fontSize: "16px" });
  });

  it("overwrites arrays wholesale rather than concatenating them", () => {
    expect(mergeProps({ keys: ["A", "1"] }, { keys: ["B"] })).toEqual({ keys: ["B"] });
  });
});
