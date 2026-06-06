import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { saveCategoryTree } from '../lib/storage/repositories'
import {
  addChildNode,
  cloneCategoryBranch,
  collectExpandableIds,
  findNodeById,
  findNodeDepthById,
  findSiblingNamesByNodeId,
  insertSiblingNode,
  isDescendantNode,
  makeDuplicateCategoryName,
  moveNodeAsChild,
  removeNode,
  renameNode,
  TREE_EXPANDED_STORAGE_KEY,
} from '../lib/categoryTree'
import type { CategoryNode } from '../types/transaction'

type UseCategoryWorkflowInput = {
  categoryTree: CategoryNode[]
  setCategoryTree: Dispatch<SetStateAction<CategoryNode[]>>
  setImportNote: Dispatch<SetStateAction<string>>
}

export function useCategoryWorkflow({
  categoryTree,
  setCategoryTree,
  setImportNote,
}: UseCategoryWorkflowInput) {
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [childInput, setChildInput] = useState('')
  const [renameInput, setRenameInput] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState('')
  const [childPopoverNodeId, setChildPopoverNodeId] = useState('')
  const [expandedIds, setExpandedIds] = useState<string[]>([])

  const hasStoredExpandedIdsRef = useRef<boolean>(false)

  useEffect(() => {
    const raw = window.localStorage.getItem(TREE_EXPANDED_STORAGE_KEY)
    if (!raw) {
      return
    }

    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        hasStoredExpandedIdsRef.current = true
        setExpandedIds(parsed.filter((item): item is string => typeof item === 'string'))
      }
    } catch {
      // Ignore malformed localStorage data and use defaults.
    }
  }, [])

  useEffect(() => {
    const expandableIds = collectExpandableIds(categoryTree)
    setExpandedIds((prev) => {
      const next = prev.filter((id) => expandableIds.includes(id))
      if (!hasStoredExpandedIdsRef.current && prev.length === 0 && expandableIds.length > 0) {
        return expandableIds
      }
      return next
    })
  }, [categoryTree])

  useEffect(() => {
    window.localStorage.setItem(TREE_EXPANDED_STORAGE_KEY, JSON.stringify(expandedIds))
  }, [expandedIds])

  const syncSelectedCategory = useCallback((nextTree: CategoryNode[]) => {
    setSelectedCategoryId((prev) => prev || nextTree[0]?.id || '')
  }, [])

  const persistTree = useCallback(async (nextTree: CategoryNode[]) => {
    setCategoryTree(nextTree)
    await saveCategoryTree(nextTree)
  }, [setCategoryTree])

  const addChildCategoryTo = useCallback(async (parentId: string) => {
    const name = childInput.trim()
    if (!name) {
      return
    }

    const parentDepth = findNodeDepthById(categoryTree, parentId)
    if (parentDepth < 1) {
      setImportNote('内置二级分类固定不变，请从三级开始新增自定义分类。')
      return
    }

    const nextTree = addChildNode(categoryTree, parentId, {
      id: crypto.randomUUID(),
      name,
      children: [],
    })

    setChildInput('')
    setChildPopoverNodeId('')
    setSelectedCategoryId(parentId)
    setExpandedIds((prev) => (prev.includes(parentId) ? prev : [...prev, parentId]))
    await persistTree(nextTree)
  }, [categoryTree, childInput, persistTree, setImportNote])

  const renameCategoryById = useCallback(async (id: string) => {
    const name = renameInput.trim()
    if (!name) {
      return
    }

    const targetNode = findNodeById(categoryTree, id)
    if (!targetNode || targetNode.locked) {
      return
    }

    const nextTree = renameNode(categoryTree, id, name)
    setRenameInput('')
    setEditingCategoryId('')
    setSelectedCategoryId(id)
    await persistTree(nextTree)
  }, [categoryTree, persistTree, renameInput])

  const deleteCategoryById = useCallback((id: string, openConfirm: (title: string, description: string, onConfirm: () => Promise<void>, dangerous?: boolean) => void) => {
    const targetNode = findNodeById(categoryTree, id)
    if (!targetNode || targetNode.locked) {
      return
    }

    openConfirm(
      '删除分类',
      '该分类及其所有子分类将被永久删除，此操作不可恢复。',
      async () => {
        const nextTree = removeNode(categoryTree, id)
        if (selectedCategoryId === id) {
          setSelectedCategoryId(nextTree[0]?.id ?? '')
        }
        await persistTree(nextTree)
      },
    )
  }, [categoryTree, persistTree, selectedCategoryId])

  const copyCategoryBranchById = useCallback(async (id: string) => {
    const targetNode = findNodeById(categoryTree, id)
    if (!targetNode || targetNode.locked) {
      return
    }

    const siblingNames = findSiblingNamesByNodeId(categoryTree, id) ?? []
    const duplicatedNode = cloneCategoryBranch(targetNode, makeDuplicateCategoryName(targetNode.name, siblingNames))
    const nextTree = insertSiblingNode(categoryTree, id, duplicatedNode)

    setSelectedCategoryId(duplicatedNode.id)
    await persistTree(nextTree)
  }, [categoryTree, persistTree])

  const selectCategoryNode = useCallback((id: string, parentId?: string) => {
    setSelectedCategoryId(id)
    if (parentId) {
      setExpandedIds((prev) => (prev.includes(parentId) ? prev : [...prev, parentId]))
    }
    if (editingCategoryId && editingCategoryId !== id) {
      setEditingCategoryId('')
      setRenameInput('')
    }
    if (childPopoverNodeId && childPopoverNodeId !== id) {
      setChildPopoverNodeId('')
      setChildInput('')
    }
  }, [childPopoverNodeId, editingCategoryId])

  const startInlineRename = useCallback((id: string, name: string) => {
    setSelectedCategoryId(id)
    setEditingCategoryId(id)
    setRenameInput(name)
    setChildPopoverNodeId('')
    setChildInput('')
  }, [])

  const openChildPopover = useCallback((id: string, name: string) => {
    const nodeDepth = findNodeDepthById(categoryTree, id)
    if (nodeDepth < 1) {
      setImportNote('内置二级分类固定不变，请从三级开始新增自定义分类。')
      return
    }

    setSelectedCategoryId(id)
    setChildPopoverNodeId(id)
    setChildInput('')
    setEditingCategoryId('')
    setRenameInput(name)
    setExpandedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [categoryTree, setImportNote])

  const toggleNode = useCallback((id: string) => {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }, [])

  const moveCategoryNode = useCallback(async (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) {
      return
    }

    const sourceNode = findNodeById(categoryTree, sourceId)
    const targetNode = findNodeById(categoryTree, targetId)
    if (!sourceNode || !targetNode || sourceNode.locked) {
      return
    }

    const targetDepth = findNodeDepthById(categoryTree, targetId)
    if (targetDepth < 1) {
      setImportNote('自定义分类只能拖动到二级或更深的分类下。')
      return
    }

    if (isDescendantNode(categoryTree, sourceId, targetId)) {
      setImportNote('不能把分类拖到自己的子分类下面。')
      return
    }

    const nextTree = moveNodeAsChild(categoryTree, sourceId, targetId)
    setSelectedCategoryId(sourceId)
    setExpandedIds((prev) => Array.from(new Set([...prev, targetId])))
    await persistTree(nextTree)
  }, [categoryTree, persistTree, setImportNote])

  return {
    selectedCategoryId,
    childInput,
    renameInput,
    editingCategoryId,
    childPopoverNodeId,
    expandedIds,
    setSelectedCategoryId,
    setChildInput,
    setRenameInput,
    setEditingCategoryId,
    setChildPopoverNodeId,
    syncSelectedCategory,
    addChildCategoryTo,
    renameCategoryById,
    deleteCategoryById,
    copyCategoryBranchById,
    selectCategoryNode,
    startInlineRename,
    openChildPopover,
    toggleNode,
    moveCategoryNode,
  }
}
