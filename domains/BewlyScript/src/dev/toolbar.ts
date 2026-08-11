import type { DevScenario } from './scenarios'
import { DEV_SCENARIOS } from './scenarios'

function navigateToScenario(scenario: DevScenario): void {
  const url = new URL(window.location.href)
  url.searchParams.set('scenario', scenario.id)
  url.searchParams.delete('page')
  window.location.href = url.toString()
}

function clearScenarioStorage(): void {
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith('bewlyscript:')))
  keys.forEach(key => localStorage.removeItem(key))
  window.location.reload()
}

export function installDevToolbar(activeScenario: DevScenario): HTMLElement | undefined {
  if (new URL(window.location.href).searchParams.get('toolbar') === '0')
    return undefined

  const toolbar = document.createElement('aside')
  toolbar.id = 'bewly-dev-toolbar'
  toolbar.setAttribute('data-testid', 'bewly-dev-toolbar')
  toolbar.innerHTML = `
    <strong>BewlyScript Lab</strong>
    <label>
      场景
      <select data-testid="scenario-select" aria-label="开发场景">
        ${DEV_SCENARIOS.map(scenario => `<option value="${scenario.id}"${scenario.id === activeScenario.id ? ' selected' : ''}>${scenario.label}</option>`).join('')}
      </select>
    </label>
    <span data-testid="runtime-url">${activeScenario.targetUrl}</span>
    ${activeScenario.recommendedViewport ? `<span>建议视口 ${activeScenario.recommendedViewport.width}×${activeScenario.recommendedViewport.height}</span>` : ''}
    <button type="button" data-testid="reset-storage">重置场景数据</button>
  `

  const style = document.createElement('style')
  style.textContent = `
    #bewly-dev-toolbar {
      position: fixed;
      top: 10px;
      left: 50%;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: calc(100vw - 24px);
      padding: 8px 12px;
      border: 1px solid rgba(255,255,255,.2);
      border-radius: 12px;
      color: #f5f7fb;
      background: rgba(18,20,27,.88);
      box-shadow: 0 12px 36px rgba(0,0,0,.28);
      font: 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      transform: translateX(-50%);
      backdrop-filter: blur(18px);
    }
    #bewly-dev-toolbar label { display: flex; align-items: center; gap: 6px; }
    #bewly-dev-toolbar select,
    #bewly-dev-toolbar button {
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 8px;
      padding: 5px 8px;
      color: inherit;
      background: rgba(255,255,255,.08);
    }
    #bewly-dev-toolbar [data-testid="runtime-url"] {
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: .7;
    }
    @media (max-width: 700px) {
      #bewly-dev-toolbar { top: 6px; gap: 6px; padding: 6px 8px; }
      #bewly-dev-toolbar strong,
      #bewly-dev-toolbar [data-testid="runtime-url"],
      #bewly-dev-toolbar span { display: none; }
    }
  `

  toolbar.querySelector<HTMLSelectElement>('[data-testid="scenario-select"]')?.addEventListener('change', (event) => {
    const scenarioId = (event.currentTarget as HTMLSelectElement).value
    const scenario = DEV_SCENARIOS.find(item => item.id === scenarioId)
    if (scenario)
      navigateToScenario(scenario)
  })
  toolbar.querySelector<HTMLButtonElement>('[data-testid="reset-storage"]')?.addEventListener('click', clearScenarioStorage)

  document.head.appendChild(style)
  document.body.appendChild(toolbar)
  return toolbar
}
