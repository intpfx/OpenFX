import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryBreadcrumb } from './category-breadcrumb'
import {
  type CategoryOption,
  isCategoryPathSelectableForTransaction,
  isUncategorizedCategoryPath,
} from '@/lib/categoryTree'
import type { Transaction } from '@/types/transaction'

export type { CategoryOption } from '@/lib/categoryTree'

const CATEGORY_RECENT_STORAGE_KEY = 'finlyzer.category.recent.paths'
const MAX_RECENT_CATEGORY_PATHS = 8

function readRecentCategoryPaths(): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(CATEGORY_RECENT_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeRecentCategoryPaths(paths: string[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(CATEGORY_RECENT_STORAGE_KEY, JSON.stringify(paths))
  } catch {
    // Ignore storage write failures and keep the combobox functional.
  }
}

export const CategoryCombobox = memo(function CategoryCombobox({
  value,
  onValueChange,
  options,
  direction,
  source,
  placeholder = '选择分类',
  allowClear = false,
  clearLabel = '未分类',
  emptyState = 'default',
  size = 'default',
  variant = 'default',
  railAddon,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  options: CategoryOption[]
  direction?: Transaction['direction']
  source?: Transaction['source']
  placeholder?: string
  allowClear?: boolean
  clearLabel?: string
  emptyState?: 'default' | 'attention'
  size?: 'default' | 'sm'
  variant?: 'default' | 'rail'
  railAddon?: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const [recentPaths, setRecentPaths] = useState<string[]>(() => readRecentCategoryPaths())
  const [activeIndex, setActiveIndex] = useState(0)
  const [hasKeyboardSelection, setHasKeyboardSelection] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef(new Map<string, HTMLButtonElement>())
  const validOptionPaths = useMemo(() => new Set(options.map((option) => option.path)), [options])
  const normalizedValue = isUncategorizedCategoryPath(value) || !validOptionPaths.has(value) ? '' : value
  const scopedOptions = useMemo(() => {
    if (!direction || !source) {
      return options
    }
    return options.filter((option) => isCategoryPathSelectableForTransaction(option.path, { direction, source }))
  }, [direction, options, source])
  const recentOptions = useMemo(() => {
    const optionMap = new Map(scopedOptions.map((option) => [option.path, option]))
    return recentPaths
      .map((path) => optionMap.get(path))
      .filter((option): option is CategoryOption => Boolean(option))
  }, [recentPaths, scopedOptions])
  const quickOptions = useMemo(() => {
    const seen = new Set<string>()
    const result: CategoryOption[] = []

    for (const option of recentOptions) {
      if (!seen.has(option.path)) {
        seen.add(option.path)
        result.push(option)
      }
      if (result.length >= 4) {
        return result
      }
    }

    for (const option of scopedOptions) {
      if (!seen.has(option.path)) {
        seen.add(option.path)
        result.push(option)
      }
      if (result.length >= 4) {
        break
      }
    }

    return result
  }, [recentOptions, scopedOptions])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return scopedOptions
    }

    const tokens = query.split(/[\s/]+/).filter(Boolean)
    return scopedOptions
      .filter((option) => {
        const path = option.path.toLowerCase()
        const segments = path.split('/')
        return tokens.every((token) => path.includes(token) || segments.some((segment) => segment.includes(token)))
      })
      .sort((left, right) => {
        const leftPath = left.path.toLowerCase()
        const rightPath = right.path.toLowerCase()
        const leftStarts = leftPath.startsWith(query)
        const rightStarts = rightPath.startsWith(query)
        if (leftStarts !== rightStarts) {
          return leftStarts ? -1 : 1
        }
        return leftPath.localeCompare(rightPath, 'zh-CN')
      })
  }, [scopedOptions, search])
  const recentOnlyOptions = useMemo(() => {
    const quickSet = new Set(quickOptions.map((option) => option.path))
    return recentOptions.filter((option) => !quickSet.has(option.path))
  }, [quickOptions, recentOptions])
  const allOptions = useMemo(() => {
    const hiddenPaths = new Set([...quickOptions, ...recentOnlyOptions].map((option) => option.path))
    return scopedOptions.filter((option) => !hiddenPaths.has(option.path))
  }, [quickOptions, recentOnlyOptions, scopedOptions])
  const navigableOptions = useMemo(() => {
    if (search.trim() !== '') {
      return filtered
    }
    return [...quickOptions, ...recentOnlyOptions, ...allOptions]
  }, [allOptions, filtered, quickOptions, recentOnlyOptions, search])
  const railStatusTone = normalizedValue
    ? 'categorized'
    : emptyState === 'attention'
      ? 'pending'
      : 'neutral'
  const railStatusLabel = normalizedValue ? '已分类' : emptyState === 'attention' ? '待分类' : '可选'

  useEffect(() => {
    if (!open) {
      setActiveIndex(0)
      setHasKeyboardSelection(false)
      return
    }

    if (navigableOptions.length === 0) {
      setActiveIndex(-1)
      setHasKeyboardSelection(false)
      return
    }

    setActiveIndex((current) => {
      if (current < 0 || current >= navigableOptions.length) {
        return 0
      }
      return current
    })
  }, [navigableOptions, open])

  useEffect(() => {
    if (!open || activeIndex < 0 || activeIndex >= navigableOptions.length) {
      return
    }

    const activePath = navigableOptions[activeIndex]?.path
    if (!activePath) {
      return
    }

    optionRefs.current.get(activePath)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, navigableOptions, open])

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }

    const updatePanelPosition = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }

      const viewportPadding = 8
      const preferredWidth = variant === 'rail' ? Math.max(rect.width, 320) : Math.max(rect.width, 240)
      const maxWidth = Math.max(240, window.innerWidth - viewportPadding * 2)
      const width = Math.min(420, preferredWidth, maxWidth)
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - width - viewportPadding,
      )
      const maxHeight = Math.min(360, window.innerHeight - rect.bottom - viewportPadding - 4)

      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left,
        width,
        maxHeight: Math.max(180, maxHeight),
      })
    }

    updatePanelPosition()

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [open, variant])

  function handleSelect(path: string) {
    onValueChange(path)

    if (!isUncategorizedCategoryPath(path)) {
      setRecentPaths((current) => {
        const next = [path, ...current.filter((item) => item !== path)].slice(0, MAX_RECENT_CATEGORY_PATHS)
        writeRecentCategoryPaths(next)
        return next
      })
    }

    setOpen(false)
    setSearch('')
    requestAnimationFrame(() => inputRef.current?.blur())
  }

  function handleFocus() {
    setOpen(true)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      setSearch('')
      inputRef.current?.blur()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (navigableOptions.length === 0) {
        return
      }

      event.preventDefault()
      setHasKeyboardSelection(true)
      setActiveIndex((current) => {
        const start = current < 0 ? 0 : current
        if (event.key === 'ArrowDown') {
          return (start + 1) % navigableOptions.length
        }
        return (start - 1 + navigableOptions.length) % navigableOptions.length
      })
      return
    }

    const activeOption = activeIndex >= 0 ? navigableOptions[activeIndex] : undefined

    if (event.key === 'Enter' || event.key === 'Tab' || (event.key === ' ' && hasKeyboardSelection)) {
      event.preventDefault()
      if (activeOption) {
        handleSelect(activeOption.path)
        return
      }

      if (allowClear && search.trim() === '') {
        handleSelect('')
      }
    }
  }

  const renderOption = (option: CategoryOption) => (
    <button
      key={option.id}
      type="button"
      ref={(node) => {
        if (node) {
          optionRefs.current.set(option.path, node)
          return
        }
        optionRefs.current.delete(option.path)
      }}
      className={cn('category-combobox-option', activeIndex >= 0 && navigableOptions[activeIndex]?.path === option.path && 'active')}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => {
        setActiveIndex(navigableOptions.findIndex((item) => item.path === option.path))
        setHasKeyboardSelection(false)
      }}
      onClick={() => handleSelect(option.path)}
      aria-selected={activeIndex >= 0 && navigableOptions[activeIndex]?.path === option.path}
    >
      <Check className={cn('h-3.5 w-3.5 shrink-0', normalizedValue === option.path ? 'opacity-100' : 'opacity-0')} />
      <CategoryBreadcrumb path={option.path} />
    </button>
  )

  const renderQuickChip = (option: CategoryOption) => (
    <button
      key={option.id}
      ref={(node) => {
        if (node) {
          optionRefs.current.set(option.path, node)
          return
        }
        optionRefs.current.delete(option.path)
      }}
      type="button"
      className={cn(
        'category-combobox-quick-chip',
        normalizedValue === option.path && 'selected',
        activeIndex >= 0 && navigableOptions[activeIndex]?.path === option.path && 'active',
      )}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => {
        setActiveIndex(navigableOptions.findIndex((item) => item.path === option.path))
        setHasKeyboardSelection(false)
      }}
      onClick={() => handleSelect(option.path)}
      aria-selected={activeIndex >= 0 && navigableOptions[activeIndex]?.path === option.path}
    >
      <CategoryBreadcrumb path={option.path} collapseMiddle />
    </button>
  )

  return (
    <div ref={containerRef} className="category-combobox-inline">
      <div
        className={cn(
          'category-combobox-input-shell',
          variant === 'rail' && 'category-combobox-input-shell-rail',
          size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
          emptyState === 'attention' && normalizedValue === '' && 'category-combobox-input-attention',
          variant === 'rail' && `category-combobox-rail-${railStatusTone}`,
          className,
        )}
      >
        {variant === 'rail' ? (
          <>
            <button
              type="button"
              className="category-combobox-rail-status"
              onClick={() => {
                setOpen(true)
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
            >
              <span className="category-combobox-rail-status-dot" aria-hidden />
              <span>{railStatusLabel}</span>
            </button>
            {railAddon ? <span className="category-combobox-rail-addon">{railAddon}</span> : null}
            {open ? (
              <input
                ref={inputRef}
                type="text"
                value={search}
                placeholder={placeholder}
                className="category-combobox-input category-combobox-input-rail"
                onFocus={handleFocus}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setOpen(true)
                }}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="category-combobox-rail-main"
                onClick={() => {
                  setOpen(true)
                  requestAnimationFrame(() => inputRef.current?.focus())
                }}
              >
                <span className="category-combobox-rail-value">
                  {normalizedValue ? (
                    <CategoryBreadcrumb path={normalizedValue} muted collapseMiddle />
                  ) : (
                    <span className="category-combobox-rail-placeholder">{placeholder}</span>
                  )}
                </span>
                <span className="category-combobox-rail-hint">搜索分类</span>
              </button>
            )}
          </>
        ) : open ? (
          <input
            ref={inputRef}
            type="text"
            value={search}
            placeholder={placeholder}
            className="category-combobox-input"
            onFocus={handleFocus}
            onChange={(event) => {
              setSearch(event.target.value)
              setOpen(true)
            }}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : normalizedValue ? (
          <button
            type="button"
            className="category-combobox-display"
            onClick={() => {
              setOpen(true)
              requestAnimationFrame(() => inputRef.current?.focus())
            }}
          >
            <CategoryBreadcrumb path={normalizedValue} muted collapseMiddle />
          </button>
        ) : emptyState === 'attention' ? (
          <button
            type="button"
            className="category-combobox-empty-state"
            onClick={() => {
              setOpen(true)
              requestAnimationFrame(() => inputRef.current?.focus())
            }}
          >
            <span className="category-combobox-empty-dot" aria-hidden />
            <span className="category-combobox-empty-label">{placeholder}</span>
          </button>
        ) : (
          <button
            type="button"
            className="category-combobox-placeholder"
            onClick={() => {
              setOpen(true)
              requestAnimationFrame(() => inputRef.current?.focus())
            }}
          >
            {placeholder}
          </button>
        )}
        <button
          type="button"
          className={cn('category-combobox-toggle', variant === 'rail' && 'category-combobox-toggle-rail')}
          aria-label="展开分类候选"
          onClick={() => {
            setOpen((current) => {
              const next = !current
              if (next) {
                requestAnimationFrame(() => inputRef.current?.focus())
              }
              return next
            })
          }}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 opacity-50 shrink-0 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open ? createPortal(
        <div ref={panelRef} className={cn('category-combobox-panel', variant === 'rail' && 'category-combobox-panel-rail')} style={panelStyle}>
          {allowClear && normalizedValue !== '' ? (
            <div className="category-combobox-panel-actions">
              <button
                type="button"
                className="category-combobox-clear-action"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect('')}
              >
                清除为{clearLabel}
              </button>
            </div>
          ) : null}

          {search.trim() === '' ? (
            <>
              {quickOptions.length > 0 ? (
                <div className="category-combobox-section">
                  <div className="category-combobox-section-title">快捷选择</div>
                  <div className="category-combobox-quick-grid">
                    {quickOptions.map(renderQuickChip)}
                  </div>
                </div>
              ) : null}

              {recentOnlyOptions.length > 0 ? (
                <div className="category-combobox-section">
                  <div className="category-combobox-section-title">最近使用</div>
                  <div className="category-combobox-option-list">
                    {recentOnlyOptions.map(renderOption)}
                  </div>
                </div>
              ) : null}

              {allOptions.length > 0 ? (
                <div className="category-combobox-section">
                  <div className="category-combobox-section-title">全部分类</div>
                  <div className="category-combobox-option-list">
                    {allOptions.map(renderOption)}
                  </div>
                </div>
              ) : null}
            </>
          ) : filtered.length > 0 ? (
            <div className="category-combobox-section">
              <div className="category-combobox-section-title">匹配结果</div>
              <div className="category-combobox-option-list">
                {filtered.map(renderOption)}
              </div>
            </div>
          ) : (
            <div className="category-combobox-empty">{direction ? '当前收支方向下无匹配分类' : '无匹配分类'}</div>
          )}
        </div>,
        document.body,
      ) : null}
    </div>
  )
})