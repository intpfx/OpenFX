import { installDevRuntime } from './runtime'
import { getDevScenario } from './scenarios'

const scenario = getDevScenario()
installDevRuntime(scenario)

void import('./mount')
