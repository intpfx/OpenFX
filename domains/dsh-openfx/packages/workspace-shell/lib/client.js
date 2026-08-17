/* Built from src/client.js for dsh-workspace-shell. */
window.__ModuleLoader__.load({ id: "dsh-workspace-shell", factory: () => {
  "use strict";
  const module = { exports: {} };
  const exports = module.exports;

/**
 * dsh-workspace-shell browser half.
 *
 * Reframes the native workspace/session navigation as a two-row top bar,
 * composes the attached Session search and compact mobile shell, and relocates
 * existing host controls without taking ownership of their behavior.
 */

'use strict'

const PLUGIN_ID = 'dsh-workspace-shell'
const STYLE_ID = 'dsh-workspace-shell-style'
const name = 'workspace-shell'
const inject = []

/**
 * Fixed duplicate icon cluster for the two controls relocated to the
 * Workspace header: sidebar fold toggle + settings. The original React-owned
 * buttons stay mounted (hidden by CSS), so programmatic .click() keeps every
 * native behavior; only the visible surface moves.
 */
/** Text Settings button pinned between the balance widget and search box. */
/** Settings icon pinned immediately to the right of the Session log button. */
function createSidebarIconCluster() {
  const host = document.createElement('div')
  host.dataset.workspaceShellSidebarIcons = PLUGIN_ID
  Object.assign(host.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: '28px',
    height: '28px',
    zIndex: '8',
    display: 'none',
  })
  document.body.appendChild(host)

  let layoutQueued = false
  let button

  function ensureButton() {
    if (button) return
    button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-label', '设置')
    Object.assign(button.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      border: 'none',
      borderRadius: '50%',
      padding: '0',
      background: 'transparent',
      color: 'var(--dsw-alias-label-secondary)',
      cursor: 'pointer',
    })
    button.addEventListener('pointerenter', () => { button.style.background = 'var(--dsw-alias-interactive-bg-hover)' })
    button.addEventListener('pointerleave', () => { button.style.background = 'transparent' })
    button.addEventListener('click', () => {
      document.querySelector('#root [data-slot="sidebar.settings"] > button[class*="trigger"]')?.click()
    })
    host.appendChild(button)
  }

  function fillButton() {
    if (!button || button.querySelector('svg')) return
    const origin = document.querySelector('#root [data-slot="sidebar.settings"] > button[class*="trigger"]')
    const trigger = origin?.querySelector('[data-slot="settings.trigger"]')
    const svg = trigger?.querySelector('svg')
    if (svg) button.innerHTML = svg.outerHTML
  }

  function scheduleLayout() {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(() => {
      layoutQueued = false
      applyLayout()
    })
  }

  function applyLayout() {
    const sessionLog = document.querySelector('#root button[class*="sessionLogButton"]')
    let anchor = sessionLog?.getBoundingClientRect().width >= 4 ? sessionLog : null
    let mobileRight = false

    if (!anchor && window.innerWidth <= 760) {
      anchor = document.querySelector('#root [class*="titleRow"]')
      mobileRight = true
    }

    if (!anchor) {
      host.style.display = 'none'
      return
    }
    const rect = anchor.getBoundingClientRect()
    if (rect.width < 4 || rect.height < 4) {
      host.style.display = 'none'
      return
    }
    ensureButton()
    fillButton()
    host.style.display = 'block'
    if (mobileRight) {
      host.style.left = `${window.innerWidth - 28 - 24}px`
      host.style.top = `${rect.top + (rect.height - 28) / 2}px`
    } else {
      host.style.left = `${rect.right + 8}px`
      host.style.top = `${rect.top + (rect.height - 28) / 2}px`
    }
  }

  const root = document.getElementById('root')
  const mutationObserver = new MutationObserver(() => { scheduleLayout() })
  if (root) mutationObserver.observe(root, { childList: true, subtree: true })
  window.addEventListener('resize', scheduleLayout)
  applyLayout()

  return {
    refreshTheme() { applyLayout() },
    dispose() {
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleLayout)
      host.remove()
    },
  }
}

/** Re-arrange the existing workspace/session rows into a two-line tab bar. */
function createWorkspaceTopBarLayout() {
  let layoutQueued = false
  let selectedKey
  const clickBound = new WeakSet()

  function scheduleLayout() {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(() => {
      layoutQueued = false
      applyLayout()
    })
  }

  function groupKey(group) {
    if (!group) return ''
    return group.querySelector('[class*="projectRow"] [class*="projectText"] [class*="title"]')?.textContent?.trim()
      || group.querySelector('[class*="projectRow"] [class*="projectText"]')?.childNodes?.[0]?.textContent?.trim()
      || ''
  }

  function bindProjectClick(project, key) {
    if (clickBound.has(project)) return
    clickBound.add(project)
    project.addEventListener('click', (event) => {
      // Let the row's own small buttons (new session / workspace menu) keep
      // their native handlers; plain tab clicks become workspace filters.
      if (event.target.closest('button,[role="button"]')) return
      event.preventDefault()
      event.stopPropagation()
      selectedKey = key
      applyLayout()
    }, { capture: true })
  }

  function applyLayout() {
    const list = document.querySelector('#root [data-slot="sidebar.workspaces"] [class*="list"]:not([class*="listArea"])')
    if (!list) return
    const workspaceRoot = list.closest('[data-slot="sidebar.workspaces"] > div')
    const listArea = workspaceRoot?.querySelector('[class*="listArea"]')
    workspaceRoot.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important')
    if (listArea instanceof HTMLElement) {
      listArea.style.display = 'block'
      listArea.style.gridColumn = '1'
    }

    // Read the optional usage-balance integration attributes and pin the
    // reported workspace costs onto the project tabs.
    const costByWorkspace = new Map()
    for (const row of document.querySelectorAll('[data-usage-balance-workspace-row]')) {
      const name = row.querySelector('[data-usage-balance-workspace-name]')?.textContent?.trim()
      const cost = row.querySelector('[data-usage-balance-workspace-cost]')?.textContent?.trim()
      if (name && cost) costByWorkspace.set(name, cost)
    }

    const groups = Array.from(list.children).filter(el => typeof el.className === 'string' && el.className.includes('groupSection'))

    const activeGroup = groups.find(group => group.querySelector('[class*="folderActive"]') !== null)
    if (selectedKey === undefined || selectedKey === '') {
      const fallback = activeGroup ?? groups[0]
      if (fallback) selectedKey = groupKey(fallback)
    }

    list.style.position = 'relative'
    list.style.display = 'block'
    list.style.overflowX = 'auto'
    list.style.overflowY = 'hidden'
    list.style.padding = '0'

    let projectLeft = 0
    let sessionLeft = 0
    for (const group of groups) {
      // Anonymous row wrappers must become transparent so the project and
      // session rows can be positioned directly against the list box.
      for (const wrapper of Array.from(group.children)) {
        if (wrapper instanceof HTMLElement) wrapper.style.display = 'contents'
      }

      const key = groupKey(group)
      const project = group.querySelector('[class*="projectRow"]')
      if (project instanceof HTMLElement) {
        const selected = key === selectedKey
        bindProjectClick(project, key)
        project.style.position = 'absolute'
        project.style.display = 'flex'
        project.style.top = '0px'
        project.style.left = `${projectLeft}px`
        project.style.width = 'max-content'
        project.style.background = selected ? 'var(--dsw-alias-state-business-tertiary)' : 'var(--dsw-alias-interactive-bg-hover)'

        const cost = costByWorkspace.get(key)
        const projectText = project.querySelector('[class*="projectText"]')
        if (projectText instanceof HTMLElement && cost) {
          let chip = projectText.querySelector('[data-workspace-shell-project-cost]')
          if (!chip) {
            chip = document.createElement('span')
            chip.dataset.workspaceShellProjectCost = ''
            chip.style.marginLeft = '6px'
            chip.style.fontSize = '12px'
            chip.style.color = 'var(--dsw-alias-label-tertiary)'
            projectText.appendChild(chip)
          }
          if (chip.textContent !== cost) chip.textContent = cost
        }
        projectLeft += project.getBoundingClientRect().width
      }

      const sessions = Array.from(group.querySelectorAll('[class*="sessionRow"]')).filter(el => el instanceof HTMLElement)
      for (const session of sessions) {
        if (key !== selectedKey) {
          session.style.display = 'none'
          continue
        }
        session.style.position = 'absolute'
        session.style.display = 'flex'
        session.style.top = '38px'
        session.style.height = '38px'
        session.style.left = `${sessionLeft}px`
        session.style.width = 'max-content'
        sessionLeft += session.getBoundingClientRect().width
      }
    }
  }

  const root = document.getElementById('root')
  const mutationObserver = new MutationObserver(() => { scheduleLayout() })
  if (root) {
    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ['class', 'data-workspace-id'],
    })
  }
  window.addEventListener('resize', scheduleLayout)
  const pollTimer = window.setInterval(scheduleLayout, 1000)
  applyLayout()

  return {
    refresh() { scheduleLayout() },
    dispose() {
      window.clearInterval(pollTimer)
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleLayout)
    },
  }
}

/** Keep the optional usage-balance source mounted without occupying shell space. */
function createBalanceMover() {
  let layoutQueued = false
  const balanceRoot = document.querySelector('[data-usage-balance-root]')

  function scheduleLayout() {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(() => {
      layoutQueued = false
      applyLayout()
    })
  }

  function applyLayout() {
    const target = balanceRoot ?? document.querySelector('[data-usage-balance-root]')
    if (!target) return
    if (window.innerWidth < 760) {
      target.style.display = 'none'
      return
    }
    Object.assign(target.style, {
      position: 'fixed',
      left: '-9999px',
      top: '0px',
      width: '190px',
      maxHeight: '76px',
      height: '76px',
      overflowY: 'auto',
      overflowX: 'hidden',
      zIndex: '-1',
      display: 'block',
      pointerEvents: 'none',
      opacity: '0',
    })
  }

  const root = document.getElementById('root')
  const mutationObserver = new MutationObserver(() => { scheduleLayout() })
  if (root) mutationObserver.observe(root, { childList: true, subtree: true, attributes: true })
  window.addEventListener('resize', scheduleLayout)
  applyLayout()

  return {
    refresh() { scheduleLayout() },
    dispose() {
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleLayout)
    },
  }
}

/** Search box fused to the top of the composer card; results open upward. */
function createComposerSearch(ctx) {
  const host = document.createElement('div')
  host.dataset.workspaceShellComposerSearch = PLUGIN_ID
  Object.assign(host.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    right: '0px',
    width: 'auto',
    height: '36px',
    zIndex: '1',
    display: 'none',
    alignItems: 'center',
    gap: '8px',
    boxSizing: 'border-box',
    padding: '0 12px',
    border: 'none',
    borderBottom: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: '0',
    background: 'transparent',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    boxShadow: 'none',
  })

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 16 16')
  icon.setAttribute('width', '14')
  icon.setAttribute('height', '14')
  icon.setAttribute('fill', 'none')
  icon.innerHTML = '<path d="M7.25 1.75a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm-6.5 5.5a6.5 6.5 0 1 1 11.6 4.06l2.8 2.8-1.06 1.06-2.8-2.8A6.5 6.5 0 0 1 .75 7.25Z" fill="currentColor"/>'
  icon.style.color = 'var(--dsw-alias-label-tertiary)'
  host.appendChild(icon)

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = '搜索会话…'
  Object.assign(input.style, {
    flex: '1',
    minWidth: '0',
    height: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    font: '14px/22px var(--dsw-font-family)',
  })
  host.appendChild(input)

  const panel = document.createElement('div')
  panel.dataset.workspaceShellComposerSearchResults = PLUGIN_ID
  Object.assign(panel.style, {
    position: 'fixed',
    left: '0px',
    bottom: '0px',
    width: '0px',
    maxHeight: '320px',
    zIndex: '9',
    display: 'none',
    overflowY: 'auto',
    boxSizing: 'border-box',
    padding: '6px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: '14px',
    background: 'var(--dsw-specific-menu)',
    boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.35)',
  })
  document.body.appendChild(panel)

  let layoutQueued = false
  let searchTimer = 0
  let blurTimer = 0
  let requestId = 0

  function scheduleLayout() {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(() => {
      layoutQueued = false
      applyLayout()
    })
  }

  function applyLayout() {
    const card = document.querySelector('#root [data-composer-card]')
    const popupOpen = document.querySelector('body [role="listbox"], body [role="option"]')
    if (!card || popupOpen) {
      host.style.display = 'none'
      panel.style.display = 'none'
      return
    }
    const rect = card.getBoundingClientRect()
    if (host.parentElement !== card) card.appendChild(host)
    host.style.display = 'flex'
    panel.style.left = `${rect.left}px`
    panel.style.width = `${rect.width}px`
    panel.style.bottom = `${window.innerHeight - rect.top}px`
  }

  function clearPanel() {
    panel.replaceChildren()
    panel.style.display = 'none'
  }

  function renderResults(items) {
    panel.replaceChildren()
    if (items.length === 0) {
      const empty = document.createElement('div')
      empty.textContent = '没有匹配的会话'
      Object.assign(empty.style, {
        padding: '10px 12px',
        color: 'var(--dsw-alias-label-tertiary)',
        font: '12px/18px var(--dsw-font-family)',
      })
      panel.appendChild(empty)
      panel.style.display = 'block'
      return
    }

    for (const item of items) {
      const row = document.createElement('button')
      row.type = 'button'
      const title = item.title || item.sessionId
      const snippet = item.snippet || ''
      const label = document.createElement('span')
      label.textContent = title
      Object.assign(label.style, {
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--dsw-alias-label-primary)',
        font: '13px/20px var(--dsw-font-family)',
      })
      row.appendChild(label)
      if (snippet) {
        const detail = document.createElement('span')
        detail.textContent = snippet
        Object.assign(detail.style, {
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--dsw-alias-label-tertiary)',
          font: '11px/16px var(--dsw-font-family)',
        })
        row.appendChild(detail)
      }
      Object.assign(row.style, {
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        textAlign: 'left',
        border: 'none',
        borderRadius: '8px',
        padding: '6px 8px',
        background: 'transparent',
        cursor: 'pointer',
      })
      row.addEventListener('pointerenter', () => { row.style.background = 'var(--dsw-alias-interactive-bg-hover)' })
      row.addEventListener('pointerleave', () => { row.style.background = 'transparent' })
      row.addEventListener('click', () => {
        sessions?.open?.(item.sessionId)
        input.value = ''
        clearPanel()
      })
      panel.appendChild(row)
    }
    panel.style.display = 'block'
  }

  function runSearch(query) {
    const id = ++requestId
    const sessions = ctx.reflect?.get('sessions')
    const snapshot = sessions?.list?.getSnapshot?.()
    if (!snapshot) return
    const needle = query.toLowerCase()
    const items = snapshot.ids
      .map(sessionId => snapshot.byId[sessionId])
      .filter(row => row && (
        (row.displayTitle || '').toLowerCase().includes(needle)
        || (row.cwd || '').toLowerCase().includes(needle)
      ))
      .slice(0, 20)
      .map(row => ({
        sessionId: row.id,
        title: row.displayTitle || row.id,
        snippet: row.cwd || '',
      }))
    if (id !== requestId) return
    renderResults(items)
  }

  input.addEventListener('focus', () => {
    if (input.value.trim()) void runSearch(input.value.trim())
    else clearPanel()
  })
  input.addEventListener('input', () => {
    window.clearTimeout(searchTimer)
    const query = input.value.trim()
    if (!query) {
      clearPanel()
      return
    }
    searchTimer = window.setTimeout(() => { void runSearch(query) }, 180)
  })
  input.addEventListener('blur', () => {
    window.clearTimeout(blurTimer)
    blurTimer = window.setTimeout(clearPanel, 160)
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      input.value = ''
      input.blur()
      clearPanel()
    }
  })

  const root = document.getElementById('root')
  const mutationObserver = new MutationObserver(() => { scheduleLayout() })
  if (root) mutationObserver.observe(root, { childList: true, subtree: true, attributes: true })
  window.addEventListener('resize', scheduleLayout)
  applyLayout()

  return {
    refresh() { scheduleLayout() },
    dispose() {
      window.clearTimeout(searchTimer)
      window.clearTimeout(blurTimer)
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleLayout)
      host.remove()
      panel.remove()
    },
  }
}

/** Live available-balance chip between model selection and context usage. */
function createBalanceChip() {
  const chip = document.createElement('div')
  chip.dataset.workspaceShellBalanceChip = PLUGIN_ID
  Object.assign(chip.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    height: '28px',
    zIndex: '8',
    display: 'none',
    alignItems: 'center',
    boxSizing: 'border-box',
    padding: '0',
    border: 'none',
    borderRadius: '0',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    font: '600 13px/18px var(--dsw-font-family)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  })
  document.body.appendChild(chip)

  let layoutQueued = false
  let pollTimer = 0

  function scheduleLayout() {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(() => {
      layoutQueued = false
      applyLayout()
    })
  }

  function applyLayout() {
    const text = document.querySelector('[data-usage-balance-value]')?.textContent?.trim()
    if (!text) {
      chip.style.display = 'none'
      return
    }
    // Keep only the currency symbol + number, no label/container chrome.
    const amount = text.match(/[¥$€£]\s?[\d,.]+/)?.[0]
    if (!amount) {
      chip.style.display = 'none'
      return
    }
    chip.textContent = amount

    const card = document.querySelector('#root [data-composer-card]')
    const model = card?.querySelector('button[aria-label^="Select model"], button[aria-label^="选择模型"]')
    const context = card?.querySelector('button[aria-haspopup="dialog"]')
    if (!model) {
      chip.style.display = 'none'
      return
    }
    const modelRect = model.getBoundingClientRect()
    if (modelRect.width < 2) {
      chip.style.display = 'none'
      return
    }
    chip.style.display = 'flex'
    const width = chip.getBoundingClientRect().width || 56
    const contextRect = context?.getBoundingClientRect()
    const fitsBetween = contextRect && contextRect.width >= 2
      && width + 8 <= contextRect.left - modelRect.right

    if (fitsBetween) {
      chip.style.left = `${contextRect.left - width - 8}px`
      chip.style.top = `${contextRect.top}px`
      return
    }
    // Not enough room between model and context: keep the amount immediately
    // left of the model trigger instead of overlapping either control.
    chip.style.left = `${modelRect.left - width - 8}px`
    chip.style.top = `${modelRect.top}px`
  }

  const root = document.getElementById('root')
  const mutationObserver = new MutationObserver(() => { scheduleLayout() })
  if (root) mutationObserver.observe(root, { childList: true, subtree: true, attributes: true })
  window.addEventListener('resize', scheduleLayout)
  pollTimer = window.setInterval(scheduleLayout, 2000)
  applyLayout()

  return {
    refresh() { scheduleLayout() },
    dispose() {
      window.clearInterval(pollTimer)
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleLayout)
      chip.remove()
    },
  }
}

/** Body-level mirror of the composer stats strip, left of Session log. */
function createStatsMover() {
  const mirror = document.createElement('div')
  mirror.dataset.workspaceShellStatsMirror = PLUGIN_ID
  Object.assign(mirror.style, {
    position: 'fixed',
    top: '0px',
    right: '0px',
    zIndex: '9',
    display: 'none',
    maxWidth: '720px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--dsw-alias-label-tertiary)',
    font: '12px/20px var(--dsw-font-family)',
    pointerEvents: 'none',
  })
  document.body.appendChild(mirror)

  let layoutQueued = false
  let pollTimer = 0

  function scheduleLayout() {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(() => {
      layoutQueued = false
      applyLayout()
    })
  }

  function applyLayout() {
    const stats = document.querySelector('#root [data-slot="conversation.composer.dock"] > div')
    const sessionLog = document.querySelector('#root button[class*="sessionLogButton"]')
    if (!stats || !sessionLog) {
      mirror.style.display = 'none'
      if (stats instanceof HTMLElement) stats.style.visibility = 'hidden'
      return
    }
    const rect = sessionLog.getBoundingClientRect()
    const text = stats.textContent?.trim()
    if (!text || rect.width < 4 || rect.height < 4) {
      mirror.style.display = 'none'
      stats.style.visibility = 'hidden'
      return
    }
    stats.style.visibility = 'hidden'
    mirror.textContent = text
    mirror.style.display = 'block'
    mirror.style.top = `${rect.top + (rect.height - 20) / 2}px`
    mirror.style.right = `${window.innerWidth - rect.left + 12}px`
  }

  const root = document.getElementById('root')
  const mutationObserver = new MutationObserver(() => { scheduleLayout() })
  if (root) {
    mutationObserver.observe(root, { childList: true, subtree: true, attributes: true, characterData: true })
  }
  window.addEventListener('resize', scheduleLayout)
  pollTimer = window.setInterval(scheduleLayout, 500)
  applyLayout()

  return {
    refresh() { scheduleLayout() },
    dispose() {
      window.clearInterval(pollTimer)
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleLayout)
      mirror.remove()
      const stats = document.querySelector('#root [data-slot="conversation.composer.dock"] > div')
      if (stats instanceof HTMLElement) stats.style.visibility = ''
    },
  }
}

/** Mobile top bar: same workspace/session tab model as desktop, rendered
 *  independently because the native sidebar collapses to a rail on narrow
 *  viewports and its row DOM disappears. */
function createMobileTopBar(ctx) {
  const host = document.createElement('div')
  host.dataset.workspaceShellMobileTopBar = PLUGIN_ID
  Object.assign(host.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: '100%',
    height: '72px',
    zIndex: '50',
    display: 'none',
    flexDirection: 'column',
    boxSizing: 'border-box',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
    background: 'color-mix(in srgb, var(--dsw-alias-bg-base) 78%, transparent)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
  })
  document.body.appendChild(host)

  const workspaceRow = document.createElement('div')
  const sessionRow = document.createElement('div')
  for (const row of [workspaceRow, sessionRow]) {
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'stretch',
      gap: '0px',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'none',
      flex: '1',
      minHeight: '0',
      paddingRight: '0px',
    })
    host.appendChild(row)
  }
  sessionRow.style.borderTop = '1px solid var(--dsw-alias-border-l1)'

  // Compact right-side controls: settings icon + available balance.
  const controls = document.createElement('div')
  Object.assign(controls.style, {
    position: 'absolute',
    right: '8px',
    top: '0px',
    bottom: '0px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    pointerEvents: 'auto',
  })
  host.appendChild(controls)

  const settingsButton = document.createElement('button')
  settingsButton.type = 'button'
  settingsButton.setAttribute('aria-label', '设置')
  Object.assign(settingsButton.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: '50%',
    padding: '0',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    cursor: 'pointer',
  })
  settingsButton.addEventListener('click', () => {
    document.querySelector('#root [data-slot="sidebar.settings"] > button[class*="trigger"]')?.click()
  })
  controls.appendChild(settingsButton)
  controls.style.display = 'none'

  const balanceText = document.createElement('span')
  Object.assign(balanceText.style, {
    maxWidth: '76px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--dsw-alias-label-secondary)',
    font: '600 11px/14px var(--dsw-font-family)',
    fontVariantNumeric: 'tabular-nums',
  })
  controls.appendChild(balanceText)

  let selectedWorkspaceId
  let pollTimer = 0

  function costByWorkspace() {
    const map = new Map()
    for (const row of document.querySelectorAll('[data-usage-balance-workspace-row]')) {
      const name = row.querySelector('[data-usage-balance-workspace-name]')?.textContent?.trim()
      const cost = row.querySelector('[data-usage-balance-workspace-cost]')?.textContent?.trim()
      if (name && cost) map.set(name, cost)
    }
    return map
  }

  function tabButton(text, active, onClick) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = text
    Object.assign(button.style, {
      flex: '0 0 auto',
      height: '100%',
      boxSizing: 'border-box',
      padding: '0 14px',
      border: 'none',
      borderRadius: '0',
      background: active ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
      color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
      font: '13px/18px var(--dsw-font-family)',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
    })
    button.addEventListener('click', onClick)
    return button
  }

  function render() {
    if (window.innerWidth > 760) {
      host.style.display = 'none'
      return
    }
    const sessions = ctx.reflect?.get('sessions')
    const snapshot = sessions?.list?.getSnapshot?.()
    const workspaces = ctx.reflect?.get('workspaces')?.list?.getSnapshot?.()
    if (!snapshot || !workspaces?.items) {
      host.style.display = 'none'
      return
    }

    host.style.display = 'flex'
    workspaceRow.replaceChildren()
    sessionRow.replaceChildren()

    const originSettings = document.querySelector('#root [data-slot="sidebar.settings"] > button[class*="trigger"]')
    const originSvg = originSettings?.querySelector('[data-slot="settings.trigger"] svg')
    if (originSvg && !settingsButton.querySelector('svg')) settingsButton.innerHTML = originSvg.outerHTML

    const amount = document.querySelector('[data-usage-balance-value]')?.textContent?.trim().match(/[¥$€£]\s?[\d,.]+/)?.[0]
    balanceText.textContent = amount || ''

    const costs = costByWorkspace()
    const items = workspaces.items
    if (selectedWorkspaceId === undefined || !items.some(item => item.workspaceId === selectedWorkspaceId)) {
      selectedWorkspaceId = items.find(item => item.sessionIds.includes(snapshot.current))?.workspaceId
        ?? items[0]?.workspaceId
    }

    for (const item of items) {
      const cost = costs.get(item.title)
      const label = cost ? `${item.title} ${cost}` : item.title
      workspaceRow.appendChild(tabButton(label, item.workspaceId === selectedWorkspaceId, () => {
        selectedWorkspaceId = item.workspaceId
        render()
      }))
    }

    const selected = items.find(item => item.workspaceId === selectedWorkspaceId)
    for (const sessionId of selected?.sessionIds ?? []) {
      const session = snapshot.byId[sessionId]
      if (!session) continue
      const blank = session.blank === true
      const button = tabButton(blank ? '' : session.displayTitle || sessionId, sessionId === snapshot.current, () => {
        sessions?.open?.(sessionId)
      })
      if (blank) {
        button.setAttribute('aria-label', '新会话')
        button.style.width = '44px'
        button.style.padding = '0'
        button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
      }
      sessionRow.appendChild(button)
    }
  }

  function scheduleRender() {
    requestAnimationFrame(render)
  }

  const root = document.getElementById('root')
  const mutationObserver = new MutationObserver(scheduleRender)
  if (root) mutationObserver.observe(root, { childList: true, subtree: true, attributes: true, characterData: true })
  window.addEventListener('resize', scheduleRender)
  pollTimer = window.setInterval(scheduleRender, 1000)
  scheduleRender()

  return {
    refresh() { scheduleRender() },
    dispose() {
      window.clearInterval(pollTimer)
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleRender)
      host.remove()
    },
  }
}

/** Mobile: make the composer card full-bleed and flush to the viewport bottom. */
function createMobileComposerLayout() {
  let layoutQueued = false
  let lastMobile = false

  function scheduleLayout() {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(() => {
      layoutQueued = false
      applyLayout()
    })
  }

  function applyLayout() {
    const mobile = window.innerWidth <= 760
    const card = document.querySelector('#root [data-composer-card]')
    const wrapper = card?.parentElement
    if (!card || !wrapper) return

    if (mobile !== lastMobile) {
      lastMobile = mobile
      wrapper.style.padding = ''
      wrapper.style.width = ''
      wrapper.style.alignItems = ''
      card.style.width = ''
      card.style.maxWidth = ''
      card.style.borderLeft = ''
      card.style.borderRight = ''
      card.style.borderBottom = ''
      card.style.borderRadius = ''
    }

    if (!mobile) return

    Object.assign(wrapper.style, {
      padding: '0',
      width: '100%',
      alignItems: 'stretch',
    })
    Object.assign(card.style, {
      width: '100%',
      maxWidth: '100%',
      borderLeft: 'none',
      borderRight: 'none',
      borderBottom: 'none',
      borderRadius: '22px 22px 0 0',
    })
  }

  const root = document.getElementById('root')
  const mutationObserver = new MutationObserver(scheduleLayout)
  if (root) mutationObserver.observe(root, { childList: true, subtree: true, attributes: true })
  window.addEventListener('resize', scheduleLayout)
  applyLayout()

  return {
    refresh() { scheduleLayout() },
    dispose() {
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleLayout)
    },
  }
}

/** JS guarantee for the mobile back-to-bottom control position. */
function createMobileToBottomMover() {
  let timer = 0

  function apply() {
    const button = document.querySelector('#root button[class*="toBottom"]')
    if (!button || window.innerWidth > 760) return
    Object.assign(button.style, {
      position: 'fixed',
      left: 'auto',
      right: '12px',
      bottom: '202px',
      top: 'auto',
      marginTop: '0',
      zIndex: '31',
    })
    const slot = button.parentElement
    if (slot instanceof HTMLElement) {
      Object.assign(slot.style, {
        position: 'sticky',
        bottom: '202px',
        paddingRight: '12px',
        height: '0',
      })
    }
  }

  const root = document.getElementById('root')
  const mutationObserver = new MutationObserver(() => { apply() })
  if (root) mutationObserver.observe(root, { childList: true, subtree: true, attributes: true })
  window.addEventListener('resize', apply)
  timer = window.setInterval(apply, 500)
  apply()

  return {
    refresh() { apply() },
    dispose() {
      window.clearInterval(timer)
      mutationObserver.disconnect()
      window.removeEventListener('resize', apply)
    },
  }
}


function installShellStyle() {
  let style = document.getElementById(STYLE_ID)
  if (style) return style

  style = document.createElement('style')
  style.id = STYLE_ID
  style.dataset.plugin = PLUGIN_ID
  style.dataset.pluginCss = STYLE_ID
  style.textContent = `
/* dsh-workspace-shell: keep the app above the fixed backdrop and make
   only the shell's large base fills translucent. Interactive cards, menus,
   code blocks and inputs keep their original opaque tokens. */
#root {
  position: relative;
  z-index: 1;
  --dsw-alias-bg-base: color-mix(in srgb, var(--dsw-static-neutral-bluish-00, #ffffff) 88%, transparent);
  --dsw-specific-sidebar-fill: color-mix(in srgb, var(--dsw-static-neutral-bluish-50, #f9fafb) 80%, transparent);
}

body[data-ds-dark-theme] #root {
  --dsw-alias-bg-base: color-mix(in srgb, var(--dsw-static-neutral-bluish-950, #151517) 78%, transparent);
  --dsw-specific-sidebar-fill: color-mix(in srgb, var(--dsw-static-neutral-bluish-900, #1b1b1c) 70%, transparent);
}

/* The AppFrame itself paints the same bg-base token as the conversation
   column, so leaving both translucent would stack two alpha layers and hide
   the backdrop. Make only the frame transparent; each column then owns a
   single translucent fill. */
#root > div > div[class*='frame'] {
  background: transparent;
}

/* Top-bar sidebar redesign:
   - the sidebar column becomes a full-width 76px top bar; the conversation
     fills below;
   - the top bar is workspace tabs on line one and the selected workspace's
     session tabs on line two;
   - workspace tabs render with their hover fill by default and carry their
     project cost label (added by the DOM layer);
   - the native workspace search is replaced by a composer-attached search
     box above the input card;
   - the composer card gets a 140px min-height, no top border radius, and a
     transparent fill so the clipped whale backdrop reads as the input
     background. */
#root > div > div[class*='frame'] {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  grid-template-rows: 76px minmax(0, 1fr) !important;
}

#root > div > div[class*='frame'] > div[class*='sidebarCol'] {
  grid-row: 1;
  grid-column: 1;
  width: 100% !important;
  border-right: none !important;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

#root > div > div[class*='frame'] > div[class*='centerCol'] {
  grid-row: 2;
  grid-column: 1;
}

#root > div > div[class*='frame'] > div[class*='detailsCol'] {
  display: none !important;
}

#root > div > div[class*='frame']:not([data-details-collapsed]) > div[class*='detailsCol'] {
  display: block !important;
  position: absolute !important;
  top: 76px;
  right: 0;
  bottom: 0;
  width: min(420px, 45vw);
  z-index: 12;
  border-left: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
}

#root > div > div[class*='frame'] > div[class*='handle'] {
  display: none !important;
}

#root [data-slot='sidebar'] > div {
  display: flex !important;
  flex-direction: row !important;
  width: 100% !important;
  height: 100% !important;
  padding: 0 !important;
}

#root [data-slot='sidebar'] [class*='regionArea'] {
  margin: 0 !important;
  padding: 0 !important;
  height: 100% !important;
}

#root [data-slot='sidebar'] button[class*='newSession'],
#root [data-slot='sidebar'] > div:not([class*='collapsed']) [class*='logoRow'],
#root [data-slot='sidebar'] > div:not([class*='collapsed']) [data-slot='sidebar.settings'] > button[class*='trigger'] {
  display: none !important;
}

#root [data-slot='sidebar.workspaces'] > div {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  grid-template-rows: 100% !important;
  height: 100% !important;
  width: 100% !important;
}

#root [data-slot='sidebar.workspaces'] [class*='sectionHeader'] {
  display: none !important;
}

/* Remove the session-title crumb everywhere: the title row stays clean. */
#root [class*='titleCluster'] [class*='crumbs'] {
  display: none !important;
}

#root [class*='headerUtilities'] {
  padding-right: 32px !important;
  box-sizing: border-box !important;
}

#root [data-slot='sidebar.workspaces'] [class*='listArea'] {
  grid-column: 1;
  grid-row: 1;
  height: 100% !important;
  min-height: 0 !important;
  position: relative !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
}

#root [data-slot='sidebar.workspaces'] [class*='treeBody'] {
  height: 100% !important;
  overflow: visible !important;
}

#root [data-slot='sidebar.workspaces'] [class*='list']:not([class*='listArea']) {
  display: block !important;
  position: relative !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
}

#root [data-slot='sidebar.workspaces'] [class*='groupSection'] {
  display: contents !important;
}

#root [data-slot='sidebar.workspaces'] [class*='projectRow'],
#root [data-slot='sidebar.workspaces'] [class*='sessionRow'] {
  width: max-content !important;
}

/* Top tabs: square, gap-free, always in their hover state; project costs sit
   inline with the project title and row actions stay visible. */
#root [data-slot='sidebar.workspaces'] [class*='projectRow'],
#root [data-slot='sidebar.workspaces'] [class*='sessionRow'] {
  border-radius: 0 !important;
  padding-left: 12px !important;
  padding-right: 12px !important;
  height: 38px !important;
}

#root [data-slot='sidebar.workspaces'] [class*='projectRow'] {
  background: var(--dsw-alias-interactive-bg-hover) !important;
}

#root [data-slot='sidebar.workspaces'] [class*='projectRow'] [class*='projectText'] {
  flex-direction: row !important;
  align-items: baseline !important;
  gap: 6px !important;
}

#root [data-slot='sidebar.workspaces'] [class*='projectRow'] [class*='rowActions'] {
  display: inline-flex !important;
}

#root [data-slot='sidebar.workspaces'] [class*='sessionRow'][class*='selected'] {
  background: var(--dsw-alias-interactive-bg-hover) !important;
}

/* These native sidebar rows are reused as compact top tabs. Their delayed
   metadata cards obscure neighbouring tabs and duplicate visible context. */
body > [class*='_card_']:has(> [class*='hoverContent']) {
  display: none !important;
}

#root [data-composer-card] button[aria-label^='选择模型'],
#root [data-composer-card] button[aria-label^='Select model'] {
  transform: translateX(-52px) !important;
}

#root [data-composer-card] {
  background: color-mix(in srgb, var(--dsw-specific-input-major) 35%, transparent) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
  min-height: 176px;
  padding-top: 46px !important;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin) !important;
  border-radius: 22px !important;
}

/* Browser contributes a real row below the absolute Session search. Tighten
   only that composition; other conversation views retain the resting card. */
#root [data-composer-card]:has([data-workspace-shell-composer-search]):has([data-conversation-input-header]:not(:empty)) {
  padding-top: 40px !important;
  gap: 8px;
}

#root [class*='composerSeat'] {
  background: transparent !important;
}

#root [data-composer-card] [data-input-scroll] {
  flex: 1 1 auto !important;
  min-height: 52px;
}

#root [data-composer-card] [data-input-scroll] > div {
  height: 100%;
}

#root [data-slot='conversation.composer.dock'] > div {
  position: fixed !important;
  max-width: none !important;
  width: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  text-align: left !important;
  white-space: nowrap !important;
  overflow: visible !important;
  text-overflow: clip !important;
}

/* Mobile: replace the collapsed native sidebar with the custom mobile tab
   bar and keep the composer search/whale geometry intact. */
@media (max-width: 760px) {
  #root > div > div[class*='frame'] {
    grid-template-rows: 72px minmax(0, 1fr) !important;
  }

  #root > div > div[class*='frame'] > div[class*='sidebarCol'] {
    display: none !important;
  }

  #root > div > div[class*='frame'] > div[class*='centerCol'] {
    grid-row: 2;
  }

  #root [data-composer-card] {
    min-height: 176px;
    padding-top: 46px !important;
    width: 100vw !important;
    max-width: 100vw !important;
    margin-left: 0 !important;
    border-left: none !important;
    border-right: none !important;
    border-bottom: none !important;
    border-radius: 22px 22px 0 0 !important;
  }

  #root [data-conversation-scroll] {
    justify-content: flex-end !important;
  }

  #root [class*='composerHero'] {
    padding-bottom: 0 !important;
  }

  [data-workspace-shell-stats-mirror] {
    display: none !important;
  }

  /* Session log is hidden entirely on mobile. */
  #root button[class*='sessionLogButton'] {
    display: none !important;
  }

  /* Mobile header chrome: drop the current-session crumb and reset the
     desktop model shift (it overlaps the access-mode control on narrow rows). */
  #root [class*='titleCluster'] [class*='crumbs'] {
    display: none !important;
  }

  #root [data-composer-card] button[aria-label^='选择模型'],
  #root [data-composer-card] button[aria-label^='Select model'] {
    transform: translateX(-56px) !important;
  }

  /* Back-to-bottom rides just above the fixed mobile composer. */
  #root [class*='toBottomSlot'] {
    bottom: calc(190px + 12px) !important;
    padding-right: 12px !important;
  }

  /* Tighten the composer toolbar gaps on mobile. */
  #root [data-composer-card] [class*='row'] {
    gap: 4px !important;
    padding-left: 4px !important;
    padding-right: 4px !important;
  }

  #root [data-composer-card] [class*='tools'],
  #root [data-composer-card] [class*='trailing'],
  #root [data-composer-card] [class*='modes'] {
    gap: 4px !important;
  }

  /* The composer is always pinned to the viewport bottom on mobile. */
  #root [class*='composerSeat'] {
    position: fixed !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    z-index: 30 !important;
    background: transparent !important;
  }

  #root [data-conversation-scroll] {
    padding-bottom: 190px !important;
  }
}
`
  document.head.appendChild(style)
  return style
}


function installShell(ctx) {
  const style = installShellStyle()
  const controllers = [
    createSidebarIconCluster(),
    createBalanceMover(),
    createWorkspaceTopBarLayout(),
    createComposerSearch(ctx),
    createBalanceChip(),
    createStatsMover(),
    createMobileTopBar(ctx),
    createMobileComposerLayout(),
    createMobileToBottomMover(),
  ]
  const refresh = () => {
    for (const controller of controllers) {
      if (typeof controller?.refreshTheme === 'function') controller.refreshTheme()
      else controller?.refresh?.()
    }
  }
  const observer = new MutationObserver(refresh)
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return () => {
    observer.disconnect()
    for (const controller of [...controllers].reverse()) controller?.dispose?.()
    style.remove()
  }
}

function apply(ctx) {
  if (typeof document === 'undefined') return
  ctx.effect(() => installShell(ctx), 'workspace-shell: mount top tabs and composer layout')
}

exports.name = name
exports.inject = inject
exports.apply = apply

  return module.exports;
} });
