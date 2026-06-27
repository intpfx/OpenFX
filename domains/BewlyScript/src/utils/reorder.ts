export function moveItemByIndex<T>(items: readonly T[], index: number, offset: number): T[] {
  const targetIndex = index + offset
  if (index < 0 || index >= items.length || targetIndex < 0 || targetIndex >= items.length)
    return [...items]

  const nextItems = [...items]
  const [item] = nextItems.splice(index, 1)
  nextItems.splice(targetIndex, 0, item)
  return nextItems
}

export function moveItem<T>(items: readonly T[], item: T, offset: number): T[] {
  return moveItemByIndex(items, items.indexOf(item), offset)
}
