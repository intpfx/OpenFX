import { motion } from 'framer-motion'
import { useState } from 'react'
import { Check, Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isFixedRootCategory } from '@/lib/categoryTree'
import type { CategoryNode } from '@/types/transaction'

export function CategoryManager({
  categoryTree,
  selectedCategoryId,
  editingCategoryId,
  renameInput,
  childPopoverNodeId,
  childInput,
  expandedIds,
  onSelectCategoryNode,
  onToggleNode,
  onRenameInputChange,
  onChildInputChange,
  onRenameCategory,
  onCancelRename,
  onStartInlineRename,
  onCopyCategoryBranch,
  onOpenChildPopover,
  onCloseChildPopover,
  onAddChildCategory,
  onDeleteCategory,
  onMoveCategoryNode,
}: {
  categoryTree: CategoryNode[]
  selectedCategoryId: string
  editingCategoryId: string
  renameInput: string
  childPopoverNodeId: string
  childInput: string
  expandedIds: string[]
  onSelectCategoryNode: (id: string) => void
  onToggleNode: (id: string) => void
  onRenameInputChange: (value: string) => void
  onChildInputChange: (value: string) => void
  onRenameCategory: (id: string) => void
  onCancelRename: () => void
  onStartInlineRename: (id: string, name: string) => void
  onCopyCategoryBranch: (id: string) => void
  onOpenChildPopover: (id: string, name: string) => void
  onCloseChildPopover: (id: string) => void
  onAddChildCategory: (id: string) => void
  onDeleteCategory: (id: string) => void
  onMoveCategoryNode: (sourceId: string, targetId: string) => void
}) {
  const [draggingNodeId, setDraggingNodeId] = useState('')
  const [dropTargetId, setDropTargetId] = useState('')

  const renderTree = (nodes: CategoryNode[], isRoot = false): React.JSX.Element => {
    return (
      <ul className={isRoot ? 'tree-root' : 'tree-branch'}>
        {nodes.map((node) => {
          const lockedRoot = isFixedRootCategory(node, isRoot)
          const canAddChild = !isRoot
          const acceptsDrop = draggingNodeId !== '' && draggingNodeId !== node.id

          return (
            <li className="tree-node" key={node.id}>
              <div
                className={`tree-node-line ${selectedCategoryId === node.id ? 'active' : ''} ${dropTargetId === node.id ? 'drag-target' : ''} ${draggingNodeId === node.id ? 'dragging' : ''}`}
                onDragOver={(event) => {
                  if (!acceptsDrop) {
                    return
                  }
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropTargetId(node.id)
                }}
                onDragLeave={() => {
                  if (dropTargetId === node.id) {
                    setDropTargetId('')
                  }
                }}
                onDrop={(event) => {
                  if (!acceptsDrop) {
                    return
                  }
                  event.preventDefault()
                  const sourceId = event.dataTransfer.getData('text/category-node-id')
                  setDropTargetId('')
                  setDraggingNodeId('')
                  if (sourceId) {
                    onMoveCategoryNode(sourceId, node.id)
                  }
                }}
              >
                <button
                  type="button"
                  className={`tree-toggle ${node.children.length === 0 ? 'empty' : ''} ${expandedIds.includes(node.id) ? 'open' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleNode(node.id)
                  }}
                  aria-label="展开或收起"
                  aria-expanded={expandedIds.includes(node.id)}
                >
                  ▸
                </button>
                {editingCategoryId === node.id ? (
                  <div className="tree-item-inline-edit">
                    <Input
                      value={renameInput}
                      onChange={(event) => onRenameInputChange(event.target.value)}
                      placeholder="重命名当前节点"
                      className="h-7 text-xs"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          onRenameCategory(node.id)
                        }
                        if (event.key === 'Escape') {
                          onCancelRename()
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="tree-node-icon-action confirm"
                      aria-label="保存重命名"
                      onClick={() => onRenameCategory(node.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="tree-node-icon-action"
                      aria-label="取消重命名"
                      onClick={onCancelRename}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`tree-item ${selectedCategoryId === node.id ? 'active' : ''}`}
                    onClick={() => onSelectCategoryNode(node.id)}
                    draggable={!lockedRoot}
                    onDragStart={(event) => {
                      if (lockedRoot) {
                        return
                      }
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/category-node-id', node.id)
                      setDraggingNodeId(node.id)
                    }}
                    onDragEnd={() => {
                      setDraggingNodeId('')
                      setDropTargetId('')
                    }}
                  >
                    {node.name}
                  </button>
                )}
                <div className="tree-node-actions">
                  {!lockedRoot ? (
                    <button
                      type="button"
                      className="tree-node-icon-action"
                      aria-label="重命名节点"
                      onClick={(event) => {
                        event.stopPropagation()
                        onStartInlineRename(node.id, node.name)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {!lockedRoot ? (
                    <button
                      type="button"
                      className="tree-node-icon-action"
                      aria-label="复制分支"
                      onClick={(event) => {
                        event.stopPropagation()
                        onCopyCategoryBranch(node.id)
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {canAddChild ? (
                    <Popover
                      open={childPopoverNodeId === node.id}
                      onOpenChange={(open) => {
                        if (open) {
                          onOpenChildPopover(node.id, node.name)
                        } else if (childPopoverNodeId === node.id) {
                          onCloseChildPopover(node.id)
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="tree-node-icon-action"
                          aria-label="新增子分类"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="tree-node-popover" align="end" sideOffset={6}>
                        <div className="tree-node-popover-body">
                          <span className="tree-node-popover-title">新增子分类</span>
                          <Input
                            value={childInput}
                            onChange={(event) => onChildInputChange(event.target.value)}
                            placeholder="输入子分类名称"
                            className="h-8 text-xs"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                onAddChildCategory(node.id)
                              }
                            }}
                            autoFocus
                          />
                          <div className="tree-node-popover-actions">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onCloseChildPopover(node.id)}
                            >
                              取消
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => onAddChildCategory(node.id)}
                            >
                              新增
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                  {!lockedRoot ? (
                    <button
                      type="button"
                      className="tree-node-icon-action destructive"
                      aria-label="删除节点"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteCategory(node.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
              {node.children.length > 0 && expandedIds.includes(node.id)
                ? renderTree(node.children)
                : null}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <motion.article
      className="manager-card manager-card-tree"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      {renderTree(categoryTree, true)}
    </motion.article>
  )
}