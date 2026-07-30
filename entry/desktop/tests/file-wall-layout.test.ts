import { assertEquals } from "@std/assert";

import {
  FILE_WALL_HEIGHT,
  FILE_WALL_WIDTH,
  fileWallBackgroundAlpha,
  fileWallLayout,
} from "../src/ui/file-wall-layout.ts";

Deno.test("only sparse file walls reveal the native frosted material", () => {
  assertEquals(fileWallBackgroundAlpha(0), 0);
  assertEquals(fileWallBackgroundAlpha(1), 0);
  assertEquals(fileWallBackgroundAlpha(6), 0);
  assertEquals(fileWallBackgroundAlpha(7), 1);
  assertEquals(fileWallBackgroundAlpha(24), 1);
  assertEquals(fileWallBackgroundAlpha(25), 1);
});

Deno.test("a small library keeps compact rectangular covers and leaves the rest empty", () => {
  assertEquals(fileWallLayout(1), [{
    itemOffset: 0,
    itemCount: 1,
    height: 150,
    itemWidths: [200],
    gap: 0,
    fillsWidth: false,
  }]);

  const rows = fileWallLayout(6);
  assertEquals(rows, [
    {
      itemOffset: 0,
      itemCount: 3,
      height: 150,
      itemWidths: [200, 200, 200],
      gap: 0,
      fillsWidth: false,
    },
    {
      itemOffset: 3,
      itemCount: 3,
      height: 150,
      itemWidths: [200, 200, 200],
      gap: 0,
      fillsWidth: false,
    },
  ]);
  assertEquals(
    rows.reduce((sum, row) => sum + row.height, 0) +
        (rows.length - 1) * rows[0]!.gap <
      FILE_WALL_HEIGHT,
    true,
  );
  assertEquals(
    rows[0]!.itemWidths.reduce((sum, width) => sum + width, 0) +
        (rows[0]!.itemCount - 1) * rows[0]!.gap <
      FILE_WALL_WIDTH,
    true,
  );
});

Deno.test("seven to 24 files fill the viewport with dense balanced rows", () => {
  for (let itemCount = 7; itemCount <= 24; itemCount += 1) {
    const rows = fileWallLayout(itemCount);
    assertEquals(
      rows.reduce((sum, row) => sum + row.itemCount, 0),
      itemCount,
    );
    assertEquals(
      rows.reduce((sum, row) => sum + row.height, 0),
      FILE_WALL_HEIGHT,
    );
    for (const row of rows) {
      assertEquals(row.gap, 0);
      assertEquals(row.fillsWidth, true);
      assertEquals(row.itemWidths.length, row.itemCount);
      assertEquals(
        row.itemWidths.reduce((sum, width) => sum + width, 0),
        FILE_WALL_WIDTH,
      );
    }
  }

  assertEquals(
    fileWallLayout(24).map((row) => ({
      itemCount: row.itemCount,
      height: row.height,
      gap: row.gap,
      fillsWidth: row.fillsWidth,
    })),
    [
      { itemCount: 6, height: 160, gap: 0, fillsWidth: true },
      { itemCount: 6, height: 160, gap: 0, fillsWidth: true },
      { itemCount: 6, height: 160, gap: 0, fillsWidth: true },
      { itemCount: 6, height: 160, gap: 0, fillsWidth: true },
    ],
  );
});

Deno.test("larger libraries keep four visible rows and scroll the remainder", () => {
  const rows = fileWallLayout(25);
  assertEquals(rows.length, 5);
  assertEquals(
    rows.map((row) => row.itemCount),
    [6, 6, 6, 6, 1],
  );
  assertEquals(rows.every((row) => row.height === 160), true);
  assertEquals(
    rows.reduce((sum, row) => sum + row.height, 0),
    800,
  );
  assertEquals(rows[4]?.itemWidths, [FILE_WALL_WIDTH]);
  assertEquals(fileWallLayout(0), []);
  assertEquals(fileWallLayout(-10), []);
});
