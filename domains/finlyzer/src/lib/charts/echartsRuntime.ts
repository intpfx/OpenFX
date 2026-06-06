import * as echarts from 'echarts/core'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CalendarComponent,
} from 'echarts/components'
import {
  LineChart,
  TreemapChart,
  HeatmapChart,
  ScatterChart,
} from 'echarts/charts'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'

echarts.use([
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CalendarComponent,
  LineChart,
  TreemapChart,
  HeatmapChart,
  ScatterChart,
  CanvasRenderer,
  SVGRenderer,
])

export { echarts }