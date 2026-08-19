import {
  type BinaryStore,
  loadInkMaskAsset,
  storeInkDerivatives,
} from "./drawing-assets.ts";
import type {
  ContentSelection,
  DrawingDocument,
  ImportedInkLayer,
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
  let changed = false;
  for (const layer of document.importedInkLayers) {
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
    layers.push(
      { ...layer, ...remainingAssets },
      { ...layer, id: selectedId, ...selectedAssets },
    );
    selectedLayerIds.push(selectedId);
    changed = true;
  }
  return {
    document: changed
      ? { ...document, updatedAt: options.now, importedInkLayers: layers }
      : document,
    selection: { strokeIds, layerIds: selectedLayerIds },
  };
}
