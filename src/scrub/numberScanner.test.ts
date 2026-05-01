import { describe, it, expect } from "vitest";
import { scanNumbers, formatNumber, computeStep } from "./numberScanner";

describe("scanNumbers", () => {
  it("finds a single integer", () => {
    const t = scanNumbers("local x = 42");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ text: "42", value: 42, decimals: 0 });
  });

  it("finds a decimal", () => {
    const t = scanNumbers("y = 1.5");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ text: "1.5", value: 1.5, decimals: 1 });
  });

  it("preserves trailing-zero decimals", () => {
    const t = scanNumbers("a = 1.50");
    expect(t[0].decimals).toBe(2);
    expect(t[0].text).toBe("1.50");
  });

  it("captures a leading minus", () => {
    const t = scanNumbers("dx = -5");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ text: "-5", value: -5 });
  });

  it("does not eat a minus that follows an identifier", () => {
    const t = scanNumbers("a-5");
    expect(t).toHaveLength(1);
    expect(t[0].text).toBe("5");
    expect(t[0].value).toBe(5);
  });

  it("does not eat a minus that follows a dot", () => {
    const t = scanNumbers(".-5");
    expect(t[0].text).toBe("5");
  });

  it("skips numbers preceded by an identifier char", () => {
    const t = scanNumbers("var123");
    expect(t).toHaveLength(0);
  });

  it("skips numbers preceded by a dot", () => {
    const t = scanNumbers("1.5.6");
    expect(t.map((x) => x.text)).toEqual(["1.5"]);
  });

  it("finds many numbers", () => {
    const t = scanNumbers("a = 1, b = 2.5, c = -3, d = 100");
    expect(t.map((x) => x.text)).toEqual(["1", "2.5", "-3", "100"]);
  });

  it("returns absolute character offsets, not line/column", () => {
    const src = "x = 1\ny = 2";
    const t = scanNumbers(src);
    expect(t[0].start).toBe(4);
    expect(t[0].end).toBe(5);
    expect(t[1].start).toBe(10);
    expect(t[1].end).toBe(11);
  });

  it("ignores numbers that are part of an identifier suffix", () => {
    expect(scanNumbers("foo42 bar")).toEqual([]);
  });
});

describe("formatNumber", () => {
  it("preserves the original decimal precision", () => {
    expect(formatNumber(1.5, 1)).toBe("1.5");
    expect(formatNumber(1.5, 3)).toBe("1.500");
    expect(formatNumber(2, 0)).toBe("2");
    expect(formatNumber(-3.14, 2)).toBe("-3.14");
  });

  it("rounds to the requested decimals", () => {
    expect(formatNumber(1.234, 1)).toBe("1.2");
    expect(formatNumber(1.25, 1)).toBe("1.3");
  });
});

describe("computeStep", () => {
  it("steps by 1 for small integers", () => {
    expect(computeStep(5, 0)).toBe(1);
    expect(computeStep(99, 0)).toBe(1);
  });

  it("scales the step by magnitude", () => {
    expect(computeStep(100, 0)).toBe(1);
    expect(computeStep(1000, 0)).toBe(10);
    expect(computeStep(15000, 0)).toBe(150);
  });

  it("uses base 10^-decimals for fractional values", () => {
    expect(computeStep(1, 1)).toBeCloseTo(0.1);
    expect(computeStep(1, 2)).toBeCloseTo(0.01);
    expect(computeStep(0.5, 3)).toBeCloseTo(0.001);
  });

  it("treats negative magnitude the same as positive", () => {
    expect(computeStep(-1500, 0)).toBe(computeStep(1500, 0));
  });

  it("never returns less than the base step", () => {
    expect(computeStep(0, 0)).toBe(1);
    expect(computeStep(0, 2)).toBeCloseTo(0.01);
  });
});
