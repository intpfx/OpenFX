import type { App as VueApp, Component } from 'vue'
import { createApp } from 'vue'

import { compareVersions } from '~/utils/main'

export interface MountBewlyAppOptions {
  component: Component
  version: string
  setup: (app: VueApp) => void
  resetCss: string
  mobileShadowCss?: string
  globalStyleCss?: string
  stylesheetUrl?: string
  svgIcons?: string
  darkModeBaseColor?: string
  isMobileUserscriptPage?: boolean
  isDev?: boolean
  useShadowDom?: boolean
  revealDelayMs?: number
}

export interface MountedBewlyApp {
  app: VueApp
  container: HTMLDivElement
  root: HTMLDivElement
  styleRoot: ShadowRoot | HTMLDivElement
}

function removeExistingContainers(version: string, preserveDevelopmentContainers: boolean): void {
  document.querySelectorAll<HTMLElement>('#bewly').forEach((element) => {
    const elementVersion = element.getAttribute('data-version') || '0.0.0'
    const elementIsDev = element.getAttribute('data-dev') === 'true'

    if (!preserveDevelopmentContainers || compareVersions(elementVersion, version) < 0 || !elementIsDev)
      element.remove()
  })
}

function appendStyle(styleRoot: ShadowRoot | HTMLDivElement, css: string): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = css
  styleRoot.appendChild(style)
  return style
}

export function mountBewlyApp(options: MountBewlyAppOptions): MountedBewlyApp {
  const {
    component,
    version,
    setup,
    resetCss,
    mobileShadowCss = '',
    globalStyleCss,
    stylesheetUrl,
    svgIcons,
    darkModeBaseColor,
    isMobileUserscriptPage = false,
    isDev = false,
    useShadowDom = true,
    revealDelayMs = 500,
  } = options

  removeExistingContainers(version, !isDev)

  const container = document.createElement('div')
  container.id = 'bewly'
  container.setAttribute('data-version', version)
  container.setAttribute('data-dev', isDev ? 'true' : 'false')
  if (isMobileUserscriptPage)
    container.setAttribute('data-bewly-mobile-userscript', 'true')
  if (darkModeBaseColor)
    container.style.setProperty('--bew-dark-base-color', darkModeBaseColor)

  const styleRoot = useShadowDom
    ? container.attachShadow?.({ mode: 'open' }) || container
    : container
  const resetStyle = isMobileUserscriptPage ? `${resetCss}\n${mobileShadowCss}` : resetCss
  appendStyle(styleRoot, resetStyle)

  const root = document.createElement('div')
  styleRoot.appendChild(root)

  container.style.opacity = '0'
  container.style.transition = revealDelayMs > 0 ? 'opacity 0.5s' : 'none'

  const reveal = () => {
    window.setTimeout(() => {
      container.style.opacity = '1'
    }, revealDelayMs)
  }
  const scheduleReveal = () => {
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(reveal)
    else
      window.setTimeout(reveal, 0)
  }

  if (globalStyleCss !== undefined) {
    styleRoot.insertBefore(appendStyle(styleRoot, globalStyleCss), root)
    scheduleReveal()
  }
  else if (stylesheetUrl) {
    const stylesheet = document.createElement('link')
    stylesheet.rel = 'stylesheet'
    stylesheet.href = stylesheetUrl
    stylesheet.addEventListener('load', reveal, { once: true })
    styleRoot.insertBefore(stylesheet, root)
  }
  else {
    scheduleReveal()
  }

  if (svgIcons) {
    const icons = document.createElement('div')
    icons.innerHTML = svgIcons
    styleRoot.appendChild(icons)
  }

  document.body.appendChild(container)

  const app = createApp(component)
  setup(app)
  app.mount(root)

  return { app, container, root, styleRoot }
}
