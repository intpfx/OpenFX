/* Built from src/client.js for dsh-design-annotations. */
window.__ModuleLoader__.load({ id: "dsh-design-annotations", factory: () => {
  "use strict";
  const module = { exports: {} };
  const exports = module.exports;

/**
 * dsh-design-annotations browser half.
 *
 * Registers the /design command, DOM selection overlay, local note store, and
 * explicit handoff of saved annotations to the active Session.
 */

'use strict'

const PLUGIN_ID = 'dsh-design-annotations'
const name = 'design-annotations'
const inject = []

// ---------------------------------------------------------------------------
// Design annotation mode
// ---------------------------------------------------------------------------

const DESIGN_STORAGE_KEY = 'dsh-design-annotations-notes'
const DESIGN_MODE_ATTRIBUTE = 'data-dsh-design-mode'

/** Small module-level store shared by the React button and the DOM controller. */
const designMode = { active: false, listeners: new Set() }
const designNotes = { items: loadDesignNotes(), listeners: new Set() }

function loadDesignNotes() {
  try {
    const raw = window.localStorage.getItem(DESIGN_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistDesignNotes() {
  try {
    window.localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(designNotes.items))
  } catch (error) {
    console.warn('dsh-design-annotations: failed to persist design notes.', error)
  }
  for (const listener of designNotes.listeners) listener()
}

function subscribeDesignMode(listener) {
  designMode.listeners.add(listener)
  return () => { designMode.listeners.delete(listener) }
}

function subscribeDesignNotes(listener) {
  designNotes.listeners.add(listener)
  return () => { designNotes.listeners.delete(listener) }
}

function setDesignMode(active) {
  if (designMode.active === active) return
  designMode.active = active
  if (!designController) designController = installDesignModeController()
  if (active) designController.mount()
  else designController.unmount()
  for (const listener of designMode.listeners) listener()
}

function toggleDesignMode() {
  setDesignMode(!designMode.active)
}

/** One controller instance (the fixed overlay is a singleton). */
let designController

function installDesignModeController() {
  if (designController) return designController

  let overlay
  let highlight
  let tooltip
  let composer
  let composing = false
  let hoveredTarget
  let markerSyncTimer = 0

  function installStyle() {
    const tagId = `${PLUGIN_ID}/design-mode`
    if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`)) return
    const style = document.createElement('style')
    style.dataset.plugin = PLUGIN_ID
    style.dataset.pluginCss = tagId
    style.textContent = `
[data-dsh-design-overlay] {
  position: fixed;
  inset: 0;
  z-index: 9990;
  cursor: crosshair;
  background: rgba(47, 129, 247, 0.04);
}
[data-dsh-design-highlight] {
  position: fixed;
  z-index: 9991;
  pointer-events: none;
  border: 2px solid #2f81f7;
  border-radius: 4px;
  background: rgba(47, 129, 247, 0.10);
  box-shadow: 0 0 0 1px rgba(47, 129, 247, 0.25), 0 0 18px rgba(47, 129, 247, 0.35);
  transition: left 60ms linear, top 60ms linear, width 60ms linear, height 60ms linear;
}
[data-dsh-design-tooltip] {
  position: fixed;
  z-index: 9992;
  pointer-events: none;
  max-width: 360px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #0f172a;
  color: #e2e8f0;
  font: 11px/16px var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-dsh-design-composer] {
  position: fixed;
  z-index: 10000;
  width: min(320px, calc(100vw - 24px));
  border-radius: 12px;
  padding: 10px;
  background: var(--dsw-specific-menu, #1f2937);
  border: 1px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.12));
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  font: 12px/18px var(--dsw-font-family);
}
[data-dsh-design-composer] textarea {
  width: 100%;
  min-height: 64px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  padding: 8px;
  background: var(--dsw-specific-input-major, #111827);
  color: var(--dsw-alias-label-primary, #e5e7eb);
  font: 12px/18px var(--dsw-font-family);
  outline: none;
}
[data-dsh-design-composer] textarea:focus {
  border-color: var(--dsw-alias-state-business-primary, #4f83f3);
}
[data-dsh-design-composer] [data-dsh-design-actions] {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
[data-dsh-design-composer] button {
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  padding: 4px 12px;
  background: var(--dsw-alias-button-elevated-fill, rgba(255, 255, 255, 0.06));
  color: var(--dsw-alias-label-primary, #e5e7eb);
  font: inherit;
  cursor: pointer;
}
[data-dsh-design-composer] button[data-primary] {
  border-color: transparent;
  background: var(--dsw-alias-state-business-primary, #4f83f3);
  color: #fff;
}
[data-dsh-design-marker] {
  position: fixed;
  z-index: 9980;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 9px;
  background: #2f81f7;
  color: #fff;
  font: 700 10px/16px var(--dsw-font-family);
  box-shadow: 0 2px 10px rgba(47, 129, 247, 0.55);
}
`
    document.head.appendChild(style)
  }

  function elementAtPoint(x, y) {
    overlay.style.pointerEvents = 'none'
    const element = document.elementFromPoint(x, y)
    overlay.style.pointerEvents = 'auto'
    return element
  }

  function describeTarget(element) {
    const label = []
    if (element.id) label.push(`#${element.id}`)
    else {
      label.push(element.tagName.toLowerCase())
      if (typeof element.className === 'string' && element.className.trim()) {
        const classes = element.className.trim().split(/\s+/).slice(0, 2)
        label.push(...classes.map(name => `.${name}`))
      }
    }
    const text = (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)
    const rect = element.getBoundingClientRect()
    return `${label.join('')} ${Math.round(rect.width)}×${Math.round(rect.height)}${text ? ` · ${text}` : ''}`
  }

  function cssPath(element) {
    const parts = []
    let current = element
    while (current && current.nodeType === 1 && parts.length < 6) {
      let part = current.tagName.toLowerCase()
      const slot = current.getAttribute('data-slot')
      const testId = current.getAttribute('data-testid')
      if (slot) part += `[data-slot="${slot}"]`
      else if (testId) part += `[data-testid="${testId}"]`
      else if (current.id) part += `#${CSS.escape(current.id)}`
      else if (typeof current.className === 'string' && current.className.trim()) {
        const classes = current.className.trim().split(/\s+/).filter(Boolean).slice(0, 2)
        part += classes.map(name => `.${CSS.escape(name)}`).join('')
      }
      const parent = current.parentElement
      if (parent) {
        const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName)
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`
      }
      parts.unshift(part)
      current = parent
      if (current === document.body || current === document.documentElement) {
        parts.unshift(current.tagName.toLowerCase())
        break
      }
    }
    return parts.join(' > ')
  }

  function positionRect(rect) {
    return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
  }

  function updateHighlight(target) {
    if (target === highlight || target === tooltip || target === composer || target?.closest?.('[data-dsh-design-composer]')) return
    hoveredTarget = target
    if (!target || target === document.body || target === document.documentElement) {
      highlight.style.display = 'none'
      tooltip.style.display = 'none'
      return
    }
    const rect = target.getBoundingClientRect()
    Object.assign(highlight.style, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    tooltip.textContent = describeTarget(target)
    tooltip.style.display = 'block'
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 372))}px`
    tooltip.style.top = `${Math.max(8, rect.top - 30)}px`
  }

  function closeComposer() {
    composing = false
    if (composer) {
      composer.remove()
      composer = undefined
    }
  }

  function openComposer(target) {
    closeComposer()
    const rect = target.getBoundingClientRect()
    composing = true
    composer = document.createElement('div')
    composer.dataset.dshDesignComposer = ''
    composer.style.left = `${Math.max(12, Math.min(window.innerWidth - 332, rect.left))}px`
    composer.style.top = `${Math.max(12, Math.min(window.innerHeight - 150, rect.bottom + 8))}px`
    composer.innerHTML = `
      <div style="margin-bottom:6px;color:var(--dsw-alias-label-secondary,#94a3b8)">${escapeHtml(describeTarget(target))}</div>
      <textarea placeholder="告诉我要改什么…（Ctrl/⌘+Enter 保存）"></textarea>
      <div data-dsh-design-actions>
        <button type="button" data-cancel>取消</button>
        <button type="button" data-primary>保存批注</button>
      </div>
    `
    document.body.appendChild(composer)
    const textarea = composer.querySelector('textarea')
    textarea.focus()
    const save = () => {
      const text = textarea.value.trim()
      if (text) addDesignNote(text, target)
      closeComposer()
    }
    composer.querySelector('[data-cancel]').addEventListener('click', closeComposer)
    composer.querySelector('[data-primary]').addEventListener('click', save)
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeComposer()
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        save()
      }
    })
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    ))
  }

  function isDesignControl(element) {
    return element?.closest?.('[data-dsh-design-widget], [data-dsh-design-composer]') || false
  }

  function onPointerMove(event) {
    if (composing) {
      overlay.style.pointerEvents = 'none'
      return
    }
    const target = elementAtPoint(event.clientX, event.clientY)
    if (isDesignControl(target)) {
      // Let the sidebar widget (toggle, note list) stay clickable while
      // annotation mode is active; the overlay ignores everything else.
      overlay.style.pointerEvents = 'none'
      updateHighlight(undefined)
    } else {
      overlay.style.pointerEvents = 'auto'
      updateHighlight(target)
    }
  }

  function onClick(event) {
    if (composing) return
    const target = elementAtPoint(event.clientX, event.clientY)
    if (!target || target === overlay || isDesignControl(target) || target === document.body || target === document.documentElement) return
    event.preventDefault()
    event.stopPropagation()
    openComposer(target)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (composing) closeComposer()
      else setDesignMode(false)
    }
  }

  function onScroll() {
    if (hoveredTarget) updateHighlight(hoveredTarget)
    syncDesignMarkers()
  }

  function mountDesignMode() {
    if (overlay) return
    installStyle()
    overlay = document.createElement('div')
    overlay.dataset.dshDesignOverlay = ''
    overlay.addEventListener('click', onClick)
    document.body.appendChild(overlay)
    window.addEventListener('pointermove', onPointerMove, { passive: true })

    highlight = document.createElement('div')
    highlight.dataset.dshDesignHighlight = ''
    highlight.style.display = 'none'
    document.body.appendChild(highlight)

    tooltip = document.createElement('div')
    tooltip.dataset.dshDesignTooltip = ''
    tooltip.style.display = 'none'
    document.body.appendChild(tooltip)

    document.body.setAttribute(DESIGN_MODE_ATTRIBUTE, '')
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    ensureDesignMarkers()
  }

  function unmountDesignMode() {
    closeComposer()
    if (overlay) overlay.remove()
    if (highlight) highlight.remove()
    if (tooltip) tooltip.remove()
    overlay = undefined
    highlight = undefined
    tooltip = undefined
    hoveredTarget = undefined
    document.body.removeAttribute(DESIGN_MODE_ATTRIBUTE)
    document.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  }

  function resolveTarget(note) {
    if (!note.target?.selector) return undefined
    try {
      const element = document.querySelector(note.target.selector)
      return element || undefined
    } catch {
      return undefined
    }
  }

  function ensureDesignMarkers() {
    for (const note of designNotes.items) {
      let marker = document.querySelector(`[data-dsh-design-marker="${note.id}"]`)
      if (!marker) {
        marker = document.createElement('div')
        marker.dataset.dshDesignMarker = note.id
        marker.textContent = String(designNotes.items.indexOf(note) + 1)
        marker.title = note.text
        document.body.appendChild(marker)
      }
    }
    syncDesignMarkers()
  }

  function syncDesignMarkers() {
    for (const note of designNotes.items) {
      const marker = document.querySelector(`[data-dsh-design-marker="${note.id}"]`)
      if (!marker) continue
      const element = resolveTarget(note)
      const rect = element ? element.getBoundingClientRect() : null
      if (!rect) {
        marker.style.display = 'none'
        continue
      }
      marker.style.display = 'flex'
      marker.style.left = `${Math.max(4, rect.right + 4)}px`
      marker.style.top = `${Math.max(4, rect.top - 4)}px`
    }
  }

  function addDesignNote(text, target) {
    const rect = target.getBoundingClientRect()
    const note = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      createdAt: new Date().toISOString(),
      target: {
        selector: cssPath(target),
        tag: target.tagName.toLowerCase(),
        text: (target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
        rect: positionRect(rect),
        viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
      },
    }
    designNotes.items = [...designNotes.items, note]
    persistDesignNotes()
    ensureDesignMarkers()
    if (markerSyncTimer) window.clearInterval(markerSyncTimer)
    markerSyncTimer = window.setInterval(syncDesignMarkers, 500)
  }

  function removeDesignNote(id) {
    designNotes.items = designNotes.items.filter(note => note.id !== id)
    persistDesignNotes()
    document.querySelector(`[data-dsh-design-marker="${id}"]`)?.remove()
    if (designNotes.items.length === 0 && markerSyncTimer) {
      window.clearInterval(markerSyncTimer)
      markerSyncTimer = 0
    } else {
      ensureDesignMarkers()
    }
  }

  designController = {
    mount: mountDesignMode,
    unmount: unmountDesignMode,
    toggle: toggleDesignMode,
    addNote: addDesignNote,
    removeNote: removeDesignNote,
    clearAll() {
      designNotes.items = []
      persistDesignNotes()
      if (markerSyncTimer) window.clearInterval(markerSyncTimer)
      markerSyncTimer = 0
      for (const marker of document.querySelectorAll('[data-dsh-design-marker]')) marker.remove()
    },
    subscribe: subscribeDesignMode,
    notesSubscribe: subscribeDesignNotes,
    notes: () => designNotes.items,
    dispose() {
      unmountDesignMode()
      if (markerSyncTimer) window.clearInterval(markerSyncTimer)
      for (const marker of document.querySelectorAll('[data-dsh-design-marker]')) marker.remove()
    },
  }
  return designController
}

function sendDesignNotesToAgent(ctx, session) {
  const unsent = designNotes.items.filter(note => !note.sentAt)
  if (unsent.length === 0) {
    if (designNotes.items.length === 0) return undefined
    unsent.push(...designNotes.items)
  }
  const connection = ctx?.reflect?.get('connection')
  if (!connection?.api?.sessions?.prompt) {
    console.warn('dsh-design-annotations: connection/session.prompt unavailable; design notes were not sent.')
    return undefined
  }

  const lines = ['【设计批注】']
  designNotes.items.forEach((note, index) => {
    const rect = note.target?.rect
    const where = rect ? `(${rect.x}, ${rect.y}, ${rect.width}x${rect.height})` : '(位置未知)'
    lines.push(`${index + 1}. ${note.text}`)
    lines.push(`   - 元素: ${note.target?.selector || note.target?.tag || 'unknown'}`)
    lines.push(`   - 位置: ${where}`)
  })
  lines.push('', '请按编号逐条修改这些位置。')

  const text = lines.join('\n')
  const timeZone = Intl.DateTimeFormat?.().resolvedOptions().timeZone
  const request = {
    sessionId: session.sessionId,
    mode: 'queue',
    content: [{ type: 'text', text }],
    ...(timeZone ? { clientTimeZone: timeZone } : {}),
  }
  return connection.api.sessions.prompt(request).then((response) => {
    const result = response?.result
    if (!result || result.ok === false) {
      const message = result?.error?.message || 'session.prompt failed'
      console.warn(`dsh-design-annotations: ${message}`)
      throw new Error(message)
    }
    const sentAt = new Date().toISOString()
    for (const note of designNotes.items) {
      if (!note.sentAt) note.sentAt = sentAt
    }
    persistDesignNotes()
    return result
  })
}

function clearAllDesignNotes() {
  designNotes.items = []
  persistDesignNotes()
  for (const marker of document.querySelectorAll('[data-dsh-design-marker]')) marker.remove()
}

function installDesignMode(ctx) {
  const controller = installDesignModeController()
  if (typeof ctx?.inject !== 'function') return controller

  // Dynamic injection keeps the plugin's static dsh.client.inject metadata
  // minimal. The commandUi service owns the '/' source; the child fiber waits
  // for it and contributes the /design command when it arrives.
  try {
    ctx.inject(['commandUi'], (scope) => {
      try {
        const dispose = scope.commandUi.register({
          name: 'design',
          description: '设计批注：圈选页面元素并告诉 DeepSeek 要改哪里',
          available: () => true,
          ui: {
            kind: 'popupSelect',
            options: async () => {
              const notes = designNotes.items
              const unsentCount = notes.filter(note => !note.sentAt).length
              const options = [{
                id: 'toggle',
                label: designMode.active ? '退出设计批注模式' : '开启设计批注模式',
                detail: designMode.active ? 'Esc 也可退出；标注会保留' : '点击任意 DOM 元素添加批注',
              }]
              if (notes.length > 0) {
                options.push({
                  id: 'send',
                  label: unsentCount > 0
                    ? `发送 ${unsentCount} 条未发送批注给 DeepSeek`
                    : '重新发送全部批注给 DeepSeek',
                  detail: '作为一条消息提交到当前会话',
                })
              }
              notes.forEach((note, index) => {
                options.push({
                  id: `delete:${note.id}`,
                  label: `删除批注 ${index + 1}${note.sentAt ? '（已发送）' : ''}`,
                  detail: note.text,
                })
              })
              if (notes.length > 0) {
                options.push({ id: 'clear', label: '清空全部批注', detail: `${notes.length} 条` })
              }
              return options
            },
            onSelect: async (option, session) => {
              if (option.id === 'toggle') {
                toggleDesignMode()
                return
              }
              if (option.id === 'send') {
                await sendDesignNotesToAgent(ctx, session)
                return
              }
              if (option.id === 'clear') {
                controller.clearAll()
                return
              }
              if (option.id?.startsWith('delete:')) {
                controller.removeNote(option.id.slice('delete:'.length))
              }
            },
          },
        })
        return () => { dispose() }
      } catch (error) {
        console.warn('dsh-design-annotations: /design command registration failed.', error)
        return undefined
      }
    })
  } catch (error) {
    console.warn('dsh-design-annotations: commandUi injection failed.', error)
  }
  return controller
}

// ---------------------------------------------------------------------------
// Shell transparency + DOM mount
// ---------------------------------------------------------------------------


function apply(ctx) {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const controller = installDesignMode(ctx)
    return () => { controller?.dispose?.() }
  }, 'design-annotations: mount command and DOM annotation controller')
}

exports.name = name
exports.inject = inject
exports.apply = apply

  return module.exports;
} });
