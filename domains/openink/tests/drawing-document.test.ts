import { expect } from "@std/expect";

import {
  commitHistory,
  commitStroke,
  createDrawingDocument,
  createHistory,
  findStrokeAtPoint,
  type NativeStroke,
  parseDrawingDocument,
  redoHistory,
  removeStrokes,
  serializeDrawingDocument,
  undoHistory,
  updateStrokeTransform,
} from "../src/drawing-document.ts";

Deno.test("a completed stroke preserves its raw pointer samples", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const stroke: NativeStroke = {
    id: "stroke-1",
    points: [
      { x: 12, y: 18, pressure: 0.21, time: 4 },
      { x: 38, y: 44, pressure: 0.76, time: 21 },
    ],
    brush: {
      color: "#151515",
      size: 14,
      thinning: 0.58,
      smoothing: 0.72,
      streamline: 0.62,
      simulatePressure: false,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };

  const next = commitStroke(document, stroke, "2026-08-19T00:00:01.000Z");

  expect(next.strokes).toEqual([stroke]);
  expect(next.updatedAt).toBe("2026-08-19T00:00:01.000Z");
  expect(document.strokes).toEqual([]);
});

Deno.test("a committed document can be undone and redone", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const changed = {
    ...document,
    title: "雨夜手稿",
    updatedAt: "2026-08-19T00:00:01.000Z",
  };

  const committed = commitHistory(createHistory(document), changed);
  const undone = undoHistory(committed);
  const redone = redoHistory(undone);

  expect(undone.present).toEqual(document);
  expect(redone.present).toEqual(changed);
  expect(redone.future).toEqual([]);
});

Deno.test("selection hit testing respects the stroke transform", () => {
  const base = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const stroke: NativeStroke = {
    id: "stroke-1",
    points: [
      { x: 20, y: 20, pressure: 0.5, time: 0 },
      { x: 120, y: 20, pressure: 0.5, time: 16 },
    ],
    brush: {
      color: "#151515",
      size: 12,
      thinning: 0.5,
      smoothing: 0.7,
      streamline: 0.6,
      simulatePressure: true,
    },
    transform: { x: 180, y: 90, scale: 1.5 },
  };
  const document = commitStroke(base, stroke, "2026-08-19T00:00:01.000Z");

  expect(findStrokeAtPoint(document, { x: 260, y: 120 })?.id).toBe("stroke-1");
  expect(findStrokeAtPoint(document, { x: 40, y: 20 })).toBeNull();
});

Deno.test("selection follows the visible streamlined outline", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const stroke: NativeStroke = {
    id: "stroke-1",
    points: [
      { x: 244, y: 375, pressure: 0.5, time: 0 },
      { x: 313, y: 279, pressure: 0.5, time: 16 },
      { x: 396, y: 224, pressure: 0.5, time: 32 },
      { x: 492, y: 252, pressure: 0.5, time: 48 },
      { x: 588, y: 356, pressure: 0.5, time: 64 },
      { x: 698, y: 425, pressure: 0.5, time: 80 },
      { x: 821, y: 334, pressure: 0.5, time: 96 },
    ],
    brush: {
      color: "#151515",
      size: 14,
      thinning: 0.58,
      smoothing: 0.72,
      streamline: 0.62,
      simulatePressure: true,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const withStroke = commitStroke(
    document,
    stroke,
    "2026-08-19T00:00:01.000Z",
  );

  expect(findStrokeAtPoint(withStroke, { x: 408.44, y: 270.03 })?.id).toBe(
    stroke.id,
  );
});

Deno.test("moving and scaling a stroke leaves its raw samples untouched", () => {
  const original: NativeStroke = {
    id: "stroke-1",
    points: [{ x: 10, y: 20, pressure: 0.5, time: 0 }],
    brush: {
      color: "#151515",
      size: 12,
      thinning: 0.5,
      smoothing: 0.7,
      streamline: 0.6,
      simulatePressure: true,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const document = commitStroke(
    createDrawingDocument({
      id: "doc-1",
      now: "2026-08-19T00:00:00.000Z",
      width: 1200,
      height: 800,
    }),
    original,
    "2026-08-19T00:00:01.000Z",
  );

  const moved = updateStrokeTransform(
    document,
    original.id,
    { x: 45, y: -12, scale: 1.8 },
    "2026-08-19T00:00:02.000Z",
  );

  expect(moved.strokes[0].transform).toEqual({ x: 45, y: -12, scale: 1.8 });
  expect(moved.strokes[0].points).toBe(original.points);
});

Deno.test("an eraser gesture removes only the strokes it crossed", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const makeStroke = (id: string): NativeStroke => ({
    id,
    points: [{ x: 10, y: 20, pressure: 0.5, time: 0 }],
    brush: {
      color: "#151515",
      size: 12,
      thinning: 0.5,
      smoothing: 0.7,
      streamline: 0.6,
      simulatePressure: true,
    },
    transform: { x: 0, y: 0, scale: 1 },
  });
  const withThree = ["a", "b", "c"].reduce(
    (current, id) => commitStroke(current, makeStroke(id), current.updatedAt),
    document,
  );

  const erased = removeStrokes(
    withThree,
    new Set(["a", "c"]),
    "2026-08-19T00:00:02.000Z",
  );

  expect(erased.strokes.map((stroke) => stroke.id)).toEqual(["b"]);
});

Deno.test("a versioned document round-trips through local persistence", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    title: "雨夜手稿",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });

  expect(parseDrawingDocument(serializeDrawingDocument(document))).toEqual(document);
  expect(() => parseDrawingDocument('{"version":2}')).toThrow(
    "OpenInk 文档版本不受支持",
  );
});
