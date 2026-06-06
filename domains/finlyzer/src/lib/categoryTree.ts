import type { CategoryNode, Transaction } from '../types/transaction'

export const TREE_EXPANDED_STORAGE_KEY = 'finlyzer.tree.expanded.ids'
const FIXED_ROOT_CATEGORY_NAMES = ['支出', '收入'] as const
const FIXED_SECOND_LEVEL_CATEGORY_NAMES = ['应付支出', '已付支出', '应得收入', '已得收入'] as const

export type ManualCommitmentEntryType = 'payable' | 'receivable'

export type CategoryOption = {
  id: string
  path: string
}

export function isUncategorizedCategoryPath(categoryPath: string): boolean {
  const normalized = categoryPath.trim()
  return normalized === '' || normalized === '未分类'
}

export function renameNode(nodes: CategoryNode[], id: string, name: string): CategoryNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, name }
    return { ...node, children: renameNode(node.children, id, name) }
  })
}

export function addChildNode(nodes: CategoryNode[], id: string, child: CategoryNode): CategoryNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, children: [...node.children, child] }
    return { ...node, children: addChildNode(node.children, id, child) }
  })
}

export function removeNode(nodes: CategoryNode[], id: string): CategoryNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: removeNode(node.children, id) }))
}

export function findNodeById(nodes: CategoryNode[], id: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node
    }
    const found = findNodeById(node.children, id)
    if (found) {
      return found
    }
  }
  return null
}

export function findSiblingNamesByNodeId(nodes: CategoryNode[], id: string, siblingNames: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.id === id) {
      return siblingNames.length > 0 ? siblingNames : nodes.map((item) => item.name)
    }

    const childSiblingNames = node.children.map((child) => child.name)
    const found = findSiblingNamesByNodeId(node.children, id, childSiblingNames)
    if (found) {
      return found
    }
  }

  return null
}

export function makeDuplicateCategoryName(name: string, siblingNames: string[]): string {
  const existing = new Set(siblingNames)
  const firstCandidate = `${name}（副本）`
  if (!existing.has(firstCandidate)) {
    return firstCandidate
  }

  let counter = 2
  while (existing.has(`${name}（副本${counter}）`)) {
    counter += 1
  }
  return `${name}（副本${counter}）`
}

export function cloneCategoryBranch(node: CategoryNode, overrideName?: string): CategoryNode {
  return {
    id: crypto.randomUUID(),
    name: overrideName ?? node.name,
    locked: false,
    children: node.children.map((child) => cloneCategoryBranch(child)),
  }
}

export function insertSiblingNode(nodes: CategoryNode[], targetId: string, insertedNode: CategoryNode): CategoryNode[] {
  let changed = false
  const nextNodes: CategoryNode[] = []

  for (const node of nodes) {
    if (node.id === targetId) {
      nextNodes.push(node, insertedNode)
      changed = true
      continue
    }

    const nextChildren = insertSiblingNode(node.children, targetId, insertedNode)
    if (nextChildren !== node.children) {
      nextNodes.push({ ...node, children: nextChildren })
      changed = true
      continue
    }

    nextNodes.push(node)
  }

  return changed ? nextNodes : nodes
}

export function flattenLeafCategoryPaths(nodes: CategoryNode[], parent = ''): CategoryOption[] {
  return nodes.flatMap((node) => {
    const currentPath = parent ? `${parent}/${node.name}` : node.name
    if (node.children.length === 0) {
      return [{ id: node.id, path: currentPath }]
    }
    return flattenLeafCategoryPaths(node.children, currentPath)
  })
}

export function collectExpandableIds(nodes: CategoryNode[]): string[] {
  return nodes.reduce<string[]>((acc, node) => {
    if (node.children.length > 0) {
      acc.push(node.id)
      acc.push(...collectExpandableIds(node.children))
    }
    return acc
  }, [])
}

export function getStoredExpandedIds(): string[] | null {
  try {
    const raw = window.localStorage.getItem(TREE_EXPANDED_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null
  } catch {
    return null
  }
}

export function isFixedRootCategory(node: CategoryNode, isRoot: boolean): boolean {
  return (
    node.locked === true
    || (isRoot && FIXED_ROOT_CATEGORY_NAMES.includes(node.name as (typeof FIXED_ROOT_CATEGORY_NAMES)[number]))
    || FIXED_SECOND_LEVEL_CATEGORY_NAMES.includes(node.name as (typeof FIXED_SECOND_LEVEL_CATEGORY_NAMES)[number])
  )
}

export function findNodeDepthById(nodes: CategoryNode[], id: string, depth = 0): number {
  for (const node of nodes) {
    if (node.id === id) {
      return depth
    }

    const childDepth = findNodeDepthById(node.children, id, depth + 1)
    if (childDepth >= 0) {
      return childDepth
    }
  }

  return -1
}

export function getDirectionRootName(direction: Transaction['direction']): '支出' | '收入' {
  return direction === 'income' ? '收入' : '支出'
}

export function getAccrualRootPath(entryType: ManualCommitmentEntryType): string {
  return entryType === 'payable' ? '支出/应付支出' : '收入/应得收入'
}

export function getDirectionByEntryType(entryType: ManualCommitmentEntryType): Transaction['direction'] {
  return entryType === 'payable' ? 'expense' : 'income'
}

export function getManualEntryTypeByCategoryPath(categoryPath: string): ManualCommitmentEntryType {
  if (categoryPath === '收入/应得收入' || categoryPath.startsWith('收入/应得收入/')) {
    return 'receivable'
  }

  return 'payable'
}

export function isManualOnlyCategoryPath(categoryPath: string): boolean {
  return categoryPath === '支出/应付支出'
    || categoryPath.startsWith('支出/应付支出/')
    || categoryPath === '收入/应得收入'
    || categoryPath.startsWith('收入/应得收入/')
}

export function isCategoryPathSelectableForTransaction(categoryPath: string, transaction: Pick<Transaction, 'direction' | 'source'>): boolean {
  if (!isCategoryPathAllowedForDirection(categoryPath, transaction.direction)) {
    return false
  }

  if (transaction.source !== 'manual' && isManualOnlyCategoryPath(categoryPath)) {
    return false
  }

  return true
}

export function isCategoryPathAllowedForDirection(categoryPath: string, direction: Transaction['direction']): boolean {
  const rootName = getDirectionRootName(direction)
  return categoryPath === rootName || categoryPath.startsWith(`${rootName}/`)
}

function detachNode(nodes: CategoryNode[], targetId: string): { nextNodes: CategoryNode[]; removedNode: CategoryNode | null } {
  let removedNode: CategoryNode | null = null

  const nextNodes = nodes
    .filter((node) => {
      if (node.id === targetId) {
        removedNode = node
        return false
      }
      return true
    })
    .map((node) => {
      const result = detachNode(node.children, targetId)
      if (result.removedNode) {
        removedNode = result.removedNode
        return { ...node, children: result.nextNodes }
      }
      return node
    })

  return { nextNodes, removedNode }
}

function attachNodeAsChild(nodes: CategoryNode[], parentId: string, childNode: CategoryNode): CategoryNode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: [...node.children, childNode] }
    }

    if (node.children.length === 0) {
      return node
    }

    return { ...node, children: attachNodeAsChild(node.children, parentId, childNode) }
  })
}

export function isDescendantNode(nodes: CategoryNode[], ancestorId: string, targetId: string): boolean {
  const ancestor = findNodeById(nodes, ancestorId)
  if (!ancestor) {
    return false
  }

  return findNodeById(ancestor.children, targetId) !== null
}

export function moveNodeAsChild(nodes: CategoryNode[], sourceId: string, targetParentId: string): CategoryNode[] {
  if (sourceId === targetParentId) {
    return nodes
  }

  const { nextNodes, removedNode } = detachNode(nodes, sourceId)
  if (!removedNode) {
    return nodes
  }

  return attachNodeAsChild(nextNodes, targetParentId, removedNode)
}