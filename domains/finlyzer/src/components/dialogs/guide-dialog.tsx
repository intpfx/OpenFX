import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const APP_VERSION = __APP_VERSION__

const GUIDE_SECTIONS = [
  {
    eyebrow: '导入与起步',
    title: '先把账单拉进来，再连续清理未分类',
    points: [
      '支持微信、支付宝、银行卡文件连续导入，未分类流水会自动排在前面。',
      '先完成一轮主类和子类归档，再回头处理镜像、结转和长期承诺，效率更高。',
    ],
  },
  {
    eyebrow: '表格操作',
    title: '直接在主表上做选择、分析和联动查看',
    points: [
      '点击日期可快速选中记录，便于批量查看同一时间段的流水。',
      '点击金额可打开均摊分析，输入时长后立刻看到按天拆分后的日均金额。',
      '分类胶囊右侧会显示镜像、关联、候选结转、已结算等状态，沿着一条操作轨道处理即可。',
    ],
  },
  {
    eyebrow: '镜像与结转',
    title: '先确认关联关系，再决定是否结转或解除',
    points: [
      '发现成对流水时，可直接查看关联或解除镜像，避免重复统计。',
      '看到候选结转后，优先核对金额、日期和记录内容，再决定结转到承诺记录还是保留原样。',
    ],
  },
  {
    eyebrow: '承诺录入',
    title: '未来应收应付先录承诺，再用一条内容贯穿后续确认',
    points: [
      '手动录入时只维护一条“记录内容”，它会同时作为展示文本和后续人工匹配线索。',
      '建议把对账对象、用途和周期写进同一字段，后续查看候选结转时判断会更快。',
    ],
  },
]

export function GuideDialog({
  open,
  onOpenChange,
  onAcknowledge,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAcknowledge: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="guide-dialog-content">
        <div className="guide-dialog-shell">
          <DialogHeader className="guide-dialog-header">
            <div className="guide-dialog-header-band">
              <span className="guide-dialog-version">Production v{APP_VERSION}</span>
              <DialogTitle className="guide-dialog-title">操作指南</DialogTitle>
              <DialogDescription className="guide-dialog-description">
                这一版 Finlyzer 采用本地优先、主表直改的工作流。按照导入、分类、镜像/结转、手动承诺四段顺序处理，能最快把账面关系理顺。
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="guide-dialog-sections">
            {GUIDE_SECTIONS.map((section) => (
              <article key={section.title} className="guide-dialog-section">
                <div className="guide-dialog-section-head">
                  <span>{section.eyebrow}</span>
                  <strong>{section.title}</strong>
                </div>
                <div className="guide-dialog-section-body">
                  {section.points.map((point) => (
                    <p key={point}>{point}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className="guide-dialog-tipbar">
            <strong>操作建议</strong>
            <p>先把未分类记录清完，再处理镜像和候选结转；这样主表会一直保持清晰，不需要额外维护已经退场的对象体系。</p>
          </div>
          <DialogFooter className="guide-dialog-footer">
            <Button onClick={onAcknowledge}>开始使用</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}