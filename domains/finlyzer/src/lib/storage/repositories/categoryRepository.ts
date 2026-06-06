import type { CategoryNode } from '../../../types/transaction'
import { db } from '../db'
import { CATEGORY_TREE_ID, defaultCategoryTree, normalizeCategoryTree } from '../domain/categoryTree'

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const existing = await db.categoryTrees.get(CATEGORY_TREE_ID)
  if (existing) {
    const normalizedTree = normalizeCategoryTree(existing.tree)
    if (JSON.stringify(normalizedTree) !== JSON.stringify(existing.tree)) {
      await db.categoryTrees.put({ id: CATEGORY_TREE_ID, tree: normalizedTree })
    }
    return normalizedTree
  }

  await db.categoryTrees.put({ id: CATEGORY_TREE_ID, tree: defaultCategoryTree })
  return defaultCategoryTree
}

export async function saveCategoryTree(tree: CategoryNode[]): Promise<void> {
  await db.categoryTrees.put({ id: CATEGORY_TREE_ID, tree })
}