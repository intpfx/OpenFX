import '~/styles'
import 'uno.css'

import { BEWLY_DEV_OPEN_SETTINGS, BEWLY_MOUNTED } from '~/constants/globalEvents'
import { mountBewlyApp } from '~/contentScripts/mount-app'
import App from '~/contentScripts/views/App.vue'
import { settings } from '~/logic'
import { setupApp } from '~/logic/common-setup'
import RESET_BEWLY_CSS from '~/styles/reset.css?raw'
import { isMobileUserscriptRuntimePage, MOBILE_USERSCRIPT_SHADOW_CSS } from '~/userscript/mobile'
import { sanitizeInlineSvg } from '~/userscript/svg-sanitizer'
import { SVG_ICONS } from '~/utils/svgIcons'

import { version } from '../../package.json'
import { getDevScenario } from './scenarios'
import { installDevToolbar } from './toolbar'

const scenario = getDevScenario()
function openScenarioSettings() {
  if (scenario.openSettings)
    window.dispatchEvent(new Event(BEWLY_DEV_OPEN_SETTINGS))
}

window.addEventListener(BEWLY_MOUNTED, openScenarioSettings, { once: true })

mountBewlyApp({
  component: App,
  version,
  setup: setupApp,
  resetCss: RESET_BEWLY_CSS,
  mobileShadowCss: MOBILE_USERSCRIPT_SHADOW_CSS,
  svgIcons: sanitizeInlineSvg(SVG_ICONS),
  darkModeBaseColor: settings.value.darkModeBaseColor,
  isMobileUserscriptPage: isMobileUserscriptRuntimePage(),
  isDev: true,
  useShadowDom: false,
  revealDelayMs: 0,
})

installDevToolbar(scenario)
