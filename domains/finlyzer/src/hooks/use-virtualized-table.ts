import { useCallback, useEffect, useMemo, useRef, useState, type UIEventHandler } from 'react'

type VirtualizedRow = {
  id: string
}

export function useVirtualizedTable<T extends VirtualizedRow>({
  rows,
  resetDeps,
  initialLoad = 120,
  loadStep = 80,
  rowHeight = 46,
  overscan = 8,
  initialViewportHeight = 420,
  flashDurationMs = 2200,
}: {
  rows: T[]
  resetDeps: unknown[]
  initialLoad?: number
  loadStep?: number
  rowHeight?: number
  overscan?: number
  initialViewportHeight?: number
  flashDurationMs?: number
}) {
  const tableBodyRef = useRef<HTMLDivElement | null>(null)
  const [loadedCount, setLoadedCount] = useState(initialLoad)
  const [scrollTop, setScrollTop] = useState(0)
  const [tableViewportHeight, setTableViewportHeight] = useState(initialViewportHeight)
  const [pendingCenterRowId, setPendingCenterRowId] = useState('')
  const [flashRowId, setFlashRowId] = useState('')
  const resetKey = useMemo(() => JSON.stringify(resetDeps), [resetDeps])

  useEffect(() => {
    if (!flashRowId) {
      return
    }
    const timer = window.setTimeout(() => setFlashRowId(''), flashDurationMs)
    return () => window.clearTimeout(timer)
  }, [flashDurationMs, flashRowId])

  useEffect(() => {
    setLoadedCount(initialLoad)
    setScrollTop(0)
    if (tableBodyRef.current) {
      tableBodyRef.current.scrollTop = 0
    }
  }, [initialLoad, resetKey])

  const loadedRows = useMemo(() => {
    return rows.slice(0, loadedCount)
  }, [rows, loadedCount])

  const virtualStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const virtualEnd = Math.min(
    loadedRows.length,
    Math.ceil((scrollTop + tableViewportHeight) / rowHeight) + overscan,
  )

  const virtualRows = useMemo(() => {
    return loadedRows.slice(virtualStart, virtualEnd)
  }, [loadedRows, virtualStart, virtualEnd])

  const virtualTopOffset = virtualStart * rowHeight
  const virtualTotalHeight = loadedRows.length * rowHeight

  useEffect(() => {
    if (!tableBodyRef.current) {
      return
    }

    const updateViewport = () => {
      if (tableBodyRef.current) {
        setTableViewportHeight(tableBodyRef.current.clientHeight)
      }
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  useEffect(() => {
    if (!pendingCenterRowId || !tableBodyRef.current) {
      return
    }

    const targetIndex = rows.findIndex((item) => item.id === pendingCenterRowId)
    if (targetIndex < 0) {
      setPendingCenterRowId('')
      return
    }

    if (targetIndex >= loadedCount) {
      setLoadedCount((prev) => Math.min(rows.length, Math.max(prev, targetIndex + loadStep)))
      return
    }

    const viewport = tableBodyRef.current.clientHeight
    const targetTop = targetIndex * rowHeight
    const desiredTop = targetTop - viewport / 2 + rowHeight / 2
    const maxTop = Math.max(0, tableBodyRef.current.scrollHeight - viewport)
    const nextTop = Math.max(0, Math.min(desiredTop, maxTop))

    tableBodyRef.current.scrollTo({ top: nextTop, behavior: 'smooth' })
    setFlashRowId(pendingCenterRowId)
    setPendingCenterRowId('')
  }, [loadStep, loadedCount, pendingCenterRowId, rowHeight, rows])

  const handleTableScroll = useCallback<UIEventHandler<HTMLDivElement>>((event) => {
    const target = event.currentTarget
    setScrollTop(target.scrollTop)

    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - rowHeight * 2
    if (nearBottom && loadedCount < rows.length) {
      setLoadedCount((prev) => Math.min(rows.length, prev + loadStep))
    }
  }, [loadStep, loadedCount, rowHeight, rows.length])

  const requestCenterRow = useCallback((rowId: string) => {
    setPendingCenterRowId(rowId)
  }, [])

  return {
    tableBodyRef,
    loadedRows,
    virtualRows,
    virtualTopOffset,
    virtualTotalHeight,
    flashRowId,
    handleTableScroll,
    requestCenterRow,
    rowHeight,
  }
}