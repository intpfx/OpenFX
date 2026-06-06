import type { CategoryNode } from '../../../types/transaction'

export const CATEGORY_TREE_ID = 'default-tree'

const FIXED_ROOTS = ['支出', '收入'] as const
const FIXED_SECOND_LEVEL_BY_ROOT = {
  支出: ['应付支出', '已付支出'],
  收入: ['应得收入', '已得收入'],
} as const
const CUSTOM_CATEGORY_BUCKET_BY_ROOT = {
  支出: '已付支出',
  收入: '已得收入',
} as const

function createCategoryNode(name: string, children: CategoryNode[] = [], locked = false): CategoryNode {
  return {
    id: crypto.randomUUID(),
    name,
    locked,
    children,
  }
}

function createDefaultCategoryTree(): CategoryNode[] {
  return FIXED_ROOTS.map((rootName) =>
    createCategoryNode(
      rootName,
      FIXED_SECOND_LEVEL_BY_ROOT[rootName].map((childName) => createCategoryNode(childName, [], true)),
      true,
    ),
  )
}

function normalizeTreeNode(node: CategoryNode, locked = false): CategoryNode {
  return {
    ...node,
    locked: locked || node.locked === true,
    children: node.children.map((child) => normalizeTreeNode(child, child.locked === true)),
  }
}

export function normalizeCategoryTree(tree: CategoryNode[]): CategoryNode[] {
  const normalizedRoots = FIXED_ROOTS.map((rootName) => {
    const existingRoot = tree.find((item) => item.name === rootName)
    const existingChildren = existingRoot?.children.map((child) => normalizeTreeNode(child)) ?? []
    const customChildren = existingChildren.filter(
      (child) => !FIXED_SECOND_LEVEL_BY_ROOT[rootName].includes(child.name as never),
    )
    const fixedChildren = FIXED_SECOND_LEVEL_BY_ROOT[rootName].map((childName) => {
      const existingChild = existingChildren.find((child) => child.name === childName)
      const shouldAttachCustomChildren = childName === CUSTOM_CATEGORY_BUCKET_BY_ROOT[rootName]
      const mergedChildren = shouldAttachCustomChildren
        ? [...(existingChild?.children ?? []), ...customChildren]
        : (existingChild?.children ?? [])

      return existingChild
        ? normalizeTreeNode({ ...existingChild, children: mergedChildren }, true)
        : createCategoryNode(childName, shouldAttachCustomChildren ? customChildren : [], true)
    })

    if (!existingRoot) {
      return createCategoryNode(rootName, fixedChildren, true)
    }

    return {
      ...existingRoot,
      locked: true,
      children: fixedChildren,
    }
  })

  const extraRoots = tree
    .filter((item) => !FIXED_ROOTS.includes(item.name as (typeof FIXED_ROOTS)[number]))
    .map((item) => normalizeTreeNode(item))

  return [...normalizedRoots, ...extraRoots]
}

export const defaultCategoryTree = createDefaultCategoryTree()