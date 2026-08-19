import {
  type BinaryStore,
  loadInkMaskAsset,
  storeInkDerivatives,
} from "./drawing-assets.ts";
import {
  ContentSelection,
  DrawingDocument,
  ImportedInkLayer,
  isDrawingContentEditable,
} from "./drawing-document.ts";
import { createInkSdf } from "./ink-sdf.ts";
import { findStrokeIdsInLasso, splitInkMaskByLasso } from "./lasso-selection.ts";
import type { InkMask, Point } from "./photo-cleanup.ts";

function hasInk(mask: InkMask): boolean {
  return mask.coverage.some((value) => value > 0);
}

export async function applyLassoSelection(
  store: BinaryStore,
  document: DrawingDocument,
  lasso: readonly Point[],
  options: Readonly<{ createLayerId: () => string; now: string }>,
): Promise<Readonly<{ document: DrawingDocument; selection: ContentSelection }>> {
  const strokeIds = findStrokeIdsInLasso(document, lasso);
  const selectedLayerIds: string[] = [];
  const layers: ImportedInkLayer[] = [];
  const splitLayerIds = new Map<string, string>();
  let changed = false;
  for (const layer of document.importedInkLayers) {
    if (
      !isDrawingContentEditable(document, { kind: "importedInk", id: layer.id })
    ) {
      layers.push(layer);
      continue;
    }
    const sourceMask = await loadInkMaskAsset(store, layer.maskAssetId);
    const split = splitInkMaskByLasso(sourceMask, layer.transform, lasso);
    if (!hasInk(split.selected)) {
      layers.push(layer);
      continue;
    }
    if (!hasInk(split.remaining)) {
      selectedLayerIds.push(layer.id);
      layers.push(layer);
      continue;
    }
    const [remainingAssets, selectedAssets] = await Promise.all([
      storeInkDerivatives(store, {
        mask: split.remaining,
        sdf: createInkSdf(split.remaining),
      }),
      storeInkDerivatives(store, {
        mask: split.selected,
        sdf: createInkSdf(split.selected),
      }),
    ]);
    const selectedId = options.createLayerId();
    splitLayerIds.set(layer.id, selectedId);
    layers.push(
      { ...layer, ...remainingAssets },
      { ...layer, id: selectedId, ...selectedAssets },
    );
    selectedLayerIds.push(selectedId);
    changed = true;
  }
  return {
    document: changed
      ? {
        ...document,
        updatedAt: options.now,
        importedInkLayers: layers,
        drawingLayers: document.drawingLayers.map((drawingLayer) => ({
          ...drawingLayer,
          content: drawingLayer.content.flatMap((reference) => {
            const selectedId = reference.kind === "importedInk"
              ? splitLayerIds.get(reference.id)
              : undefined;
            return selectedId
              ? [reference, { kind: "importedInk" as const, id: selectedId }]
              : [reference];
          }),
        })),
      }
      : document,
    selection: { strokeIds, layerIds: selectedLayerIds },
  };
}
