import { expect } from "@std/expect";

import {
  clampLibraryGridColumns,
  parseLibraryGridColumns,
  resolveLibraryGridColumnsFromPinch,
} from "../src/file-library/grid-density.ts";

Deno.test("file library grid density stays between two and five columns", () => {
  expect(clampLibraryGridColumns(1)).toBe(2);
  expect(clampLibraryGridColumns(3)).toBe(3);
  expect(clampLibraryGridColumns(8)).toBe(5);
  expect(parseLibraryGridColumns("4")).toBe(4);
  expect(parseLibraryGridColumns(null)).toBe(3);
  expect(parseLibraryGridColumns("")).toBe(3);
  expect(parseLibraryGridColumns("invalid")).toBe(3);
});

Deno.test("pinch out enlarges items and pinch in reveals more columns", () => {
  expect(resolveLibraryGridColumnsFromPinch(3, 1.25)).toBe(2);
  expect(resolveLibraryGridColumnsFromPinch(3, 0.8)).toBe(4);
  expect(resolveLibraryGridColumnsFromPinch(2, 2)).toBe(2);
  expect(resolveLibraryGridColumnsFromPinch(5, 0.4)).toBe(5);
});
