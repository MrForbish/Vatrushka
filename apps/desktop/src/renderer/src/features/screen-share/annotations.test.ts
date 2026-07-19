import { describe, expect, it } from "vitest";

import {
  applyScreenAnnotationMessage,
  encodeScreenAnnotationMessage,
  parseScreenAnnotationMessage,
  type ScreenAnnotationStroke,
} from "./annotations";

const stroke: ScreenAnnotationStroke = {
  id: "stroke-1",
  color: "#22d3ee",
  size: 4,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.8, y: 0.7 },
  ],
};

describe("screen annotations", () => {
  it("validates and decodes normalized strokes", () => {
    expect(parseScreenAnnotationMessage(encodeScreenAnnotationMessage({ type: "stroke", stroke }))).toEqual({
      type: "stroke",
      stroke,
    });
  });

  it("rejects malformed or out-of-bounds points", () => {
    expect(parseScreenAnnotationMessage(new TextEncoder().encode("not-json"))).toBeNull();
    expect(
      parseScreenAnnotationMessage(
        new TextEncoder().encode(JSON.stringify({
          type: "stroke",
          stroke: { ...stroke, points: [{ x: -1, y: 0 }, { x: 1, y: 1 }] },
        })),
      ),
    ).toBeNull();
  });

  it("applies stroke, undo and clear idempotently", () => {
    const added = applyScreenAnnotationMessage([], { type: "stroke", stroke });
    expect(applyScreenAnnotationMessage(added, { type: "stroke", stroke })).toBe(added);
    expect(applyScreenAnnotationMessage(added, { type: "undo" })).toEqual([]);
    expect(applyScreenAnnotationMessage(added, { type: "clear" })).toEqual([]);
  });
});
