import React, { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import ReactDOM from 'react-dom';
import pipelineConfig from '../config/pipeline.json' with { type: "json" };
import fixturesConfig from '../config/fixtures.json' with { type: "json" };
import equipmentConfig from '../config/equipment.json' with { type: "json" };
import adsConfig from '../config/ads.json' with { type: "json" };
import pkg from '../../package.json' with { type: "json" };
import BlockOverlay from './BlockOverlay.jsx';
import { applyWatermarkToCanvas } from '../utils/watermark.js';
import watermarkConfig from '../config/watermark.json' with { type: "json" };
// 支撑/立柱常量提升到模块级，便于 LiveDock 与 BottomZone 共享
const BRACKET_TYPES = fixturesConfig.bracketTypes;
const BRACKET_SPEC_OPTIONS = fixturesConfig.bracketSpecOptions;
/* BottomZone migrated inline into LiveDock.jsx */
/* Keep original props interface and behavior; preserve memoization */

const BottomZoneRaw = ({
  selectedDirection,
  selectedMaterial,
  selectedDiameter,
  selectedSegment,
  selectedComponent,
  selectedFitting,
  pipelineStats,
  onDirectionChange,
  onMaterialChange,
  onDiameterChange,
  onCreateSegment,
  onExtendSegment,
  onUpdateSegment,
  onSetChainValveCount,
  onCommitSegmentEdits,
  onAutoInsertRegulator,
  onDeleteComponent,
  onDeleteFitting,
  onDeleteSegment,
  hasCurrentPoint,
  hasSegments,
  forbiddenDirectionIndices,
  distance,
  onSetDistance,
  embedded = false,
  viewMode = 'system',
  // 新增：由父层 LiveDock 控制的“添加支撑”弹窗打开回调
  onOpenSupportDialog,
  // 新增：父层告知弹窗是否打开，用于隐藏属性面板
  isSupportDialogOpen
}) => {
  const { manualFittings, removeManualFittingById, uiMode, insertDeviceType, setInsertDeviceType, insertOptions, setInsertOptions, components } = useProject();
  // 插入就地浮层与草稿状态（仅在 BottomZone 内部使用）
  const [insertPopoverOpen, setInsertPopoverOpen] = useState(false);
  const [inlineInsertDraft, setInlineInsertDraft] = useState({});
  const [inlineInsertErrors, setInlineInsertErrors] = useState({});

  const allDiameterOptions = useMemo(() => {
    try {
      const map = pipelineConfig?.diameterOptions || {};
      const set = new Set();
      Object.keys(map).forEach(k => (map[k] || []).forEach(d => set.add(d)));
      const arr = Array.from(set);
      return arr.sort((a, b) => {
        const na = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
        const nb = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
        return na - nb;
      });
    } catch (e) {
      return (pipelineConfig?.diameterOptions?.[Object.keys(pipelineConfig?.diameterOptions || {})[0]] || []);
    }
  }, [pipelineConfig]);

  // 颜色与响应式状态
  const [isMobile, setIsMobile] = useState(globalThis.innerWidth <= 768);
  const [prefersDark, setPrefersDark] = useState(globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
  // 编辑态提升到 Bottom 区域层，避免 PropertiesPanel 重新挂载导致状态丢失
  const [isEditing, setIsEditing] = useState(false);

  // 小数滚轮上次值（用于越界进退位检测的后备方案）
  const lastDecRef = useRef(0);
  const [distanceDraft, setDistanceDraft] = useState('');
  const [distanceEditing, setDistanceEditing] = useState(false);
  useEffect(() => {
    const safeDistance = typeof distance === 'number' && !isNaN(distance) ? distance : 0;
    const intPartEff = Math.max(0, Math.floor(safeDistance));
    const decPartEff = Math.max(0, Math.min(99, Math.round((safeDistance - intPartEff) * 100)));
    lastDecRef.current = decPartEff;
    let media;
    const schemeHandler = (e) => setPrefersDark(e.matches);
    if (globalThis.matchMedia) {
      media = globalThis.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener ? media.addEventListener('change', schemeHandler) : media.addListener(schemeHandler);
    }
    return () => {
      if (media) {
        media.removeEventListener ? media.removeEventListener('change', schemeHandler) : media.removeListener(schemeHandler);
      }
    };
  }, [distance]);

  // 样式辅助（合并样式对象）
  const mergeStyles = (...styles) => Object.assign({}, ...styles);

  // Bottom 区域容器样式
  const bottomZoneContainerStyle = mergeStyles(
    {
      position: 'fixed',
      width: 'fit-content',
      bottom: 0,
      left: '50%',
      transform: 'translateX(-50%) translateY(-3px)',
      background: prefersDark ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 0.3)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRadius: 24,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)',
      border: `1px solid ${prefersDark ? 'rgba(71, 85, 105, 0.4)' : 'rgba(255, 255, 255, 0.4)'}`,
      padding: '10px 12px',
      zIndex: 1002,
      userSelect: 'none',
      WebkitUserSelect: 'none',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    },
    embedded ? {
      position: 'static',
      width: '100%',
      bottom: 'auto',
      left: 'auto',
      transform: 'none',
      background: 'transparent',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
      borderRadius: 0,
      boxShadow: 'none',
      border: 'none',
      padding: 0,
      zIndex: 'auto'
    } : {}
  );

  const bottomZoneContentStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    pointerEvents: 'auto'
  };

  // 属性面板样式
  const panelStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    width: '100%',
    padding: isMobile ? 10 : 12,
    borderRadius: 16,
    background: prefersDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(255, 255, 255, 0.9)',
    border: `1px solid ${prefersDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(203, 213, 225, 0.6)'}`,
    boxShadow: prefersDark
      ? '0 6px 18px rgba(2, 6, 23, 0.6)'
      : '0 6px 18px rgba(148, 163, 184, 0.25)'
  };

  // Bento 风格：面板项统一改为网格卡片
  const bentoGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 8
  };

  const bentoItemStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    minWidth: 0,
    padding: isMobile ? '6px 8px' : '8px 10px',
    borderRadius: 10,
    border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.35)' : 'rgba(226,232,240,0.8)'}`,
    background: prefersDark ? 'rgba(30,41,59,0.35)' : 'rgba(255,255,255,0.95)',
    color: prefersDark ? '#e5e7eb' : '#111827'
  };

  const bentoLabelStyle = {
    fontSize: 11,
    color: prefersDark ? '#94a3b8' : '#64748b',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    paddingRight: 6
  };

  const bentoValueStyle = {
    fontSize: isMobile ? 12 : 13,
    fontWeight: 700,
    color: prefersDark ? '#e5e7eb' : '#111827',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    maxWidth: '62%',
    minWidth: 0,
    overflow: 'hidden'
  };

  const PropertiesPanel = ({ stats, onUpdateSegment, onDelete }) => {
    if (!stats || !selectedSegment) return null;
    // 可编辑输入样式
    const inputStyle = {
      width: '100%',
      maxWidth: isMobile ? 120 : 160,
      padding: isMobile ? '6px 8px' : '8px 10px',
      borderRadius: 10,
      border: `1px solid ${prefersDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(203, 213, 225, 0.8)'}`,
      background: prefersDark ? 'rgba(30, 41, 59, 0.35)' : 'rgba(255, 255, 255, 0.95)',
      color: prefersDark ? '#e5e7eb' : '#111827',
      fontSize: isMobile ? 12 : 13,
      boxSizing: 'border-box'
    };
    const numberInputStyle = { ...inputStyle, maxWidth: isMobile ? 100 : 120 };
    const row = (label, control) => (
      <div style={bentoItemStyle}>
        <div style={bentoLabelStyle} title={label}>{label}</div>
        <div style={bentoValueStyle}>{control}</div>
      </div>
    );
    // 编辑模式与草稿：仅在编辑中允许修改材质与直径（isEditing 由 Bottom 区域提供）
    const [draft, setDraft] = useState({ material: selectedSegment.material, diameter: selectedSegment.diameter });
    // 草稿数量使用字符串以允许用户清空输入；提交时再解析
    const [draftCounts, setDraftCounts] = useState({
      flange: String(stats.segmentFlangeValves || 0)
    });
    const [submitError, setSubmitError] = useState('');
    // 统一提交：点击“完成”后由父组件原子性地提交段属性与阀门数量，
    // 通过 onCommitSegmentEdits(payload, pendings) 实现。这样可以
    // 确保更新依赖的 selectedSegment 在父层是一致的，避免竞态。
    useEffect(() => {
      // 当选择变化时，重置草稿；编辑态保持不变，进入/退出始终由用户手动点击
      setDraft({ material: selectedSegment.material, diameter: selectedSegment.diameter });
      // 只有在非编辑状态下才重置草稿数量，避免覆盖用户正在编辑的数据
      if (!isEditing) {
        setDraftCounts({
          flange: String(stats.segmentFlangeValves || 0)
        });
      }
      setSubmitError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSegment.material, selectedSegment.diameter, stats.segmentFlangeValves, isEditing]);
    // 校验：允许空字符串或非负整数
    const isValidIntegerOrEmpty = (s) => (s === '' || /^[0-9]+$/.test(s));
    const flangeValid = isValidIntegerOrEmpty(draftCounts.flange);
    const parseDesiredCount = (s) => (s === '' ? 0 : Math.max(0, Math.floor(Number(s))));
    const materialForOptions = isEditing ? draft.material : selectedSegment.material;
    const isSeamUI = materialForOptions === '无缝钢管' || materialForOptions === '直缝钢管';
    // 段长输入统一为文本 + 数字键盘，且即时更新
    const [draftLengthStr, setDraftLengthStr] = useState(
      typeof selectedSegment?.length === 'number' ? String(Number(selectedSegment.length).toFixed(2)) : ''
    );
    useEffect(() => {
      setDraftLengthStr(typeof selectedSegment?.length === 'number' ? String(Number(selectedSegment.length).toFixed(2)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSegment.length]);
    const isValidDecimalOrEmpty = (s) => (s === '' || /^\d*(?:\.\d*)?$/.test(s));
    const lengthValid = isValidDecimalOrEmpty(draftLengthStr);
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: prefersDark ? '#cbd5e1' : '#334155' }}>
            管道属性{isEditing ? ' · 编辑中' : ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onDelete && (
              <button type="button"
                onClick={onDelete}
                aria-label="删除"
                style={{
                  padding: isMobile ? '6px 10px' : '8px 12px',
                  borderRadius: 10,
                  background: prefersDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                  color: prefersDark ? '#fca5a5' : '#dc2626',
                  border: `1px solid ${prefersDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                  fontSize: isMobile ? 12 : 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >删除</button>
            )}
          <button type="button"
            onClick={() => {
              if (!isEditing) {
                setDraft({ material: selectedSegment.material, diameter: selectedSegment.diameter });
                setDraftCounts({ flange: String(stats.middleFlangeValves || 0) });
                setIsEditing(true);
              } else {
                if ((draft.material === '无缝钢管' || draft.material === '直缝钢管') && !flangeValid) {
                  setSubmitError('法兰球阀数量需为非负整数或留空');
                  return;
                }
                setSubmitError('');
                if ((draft.material === '无缝钢管' || draft.material === '直缝钢管') && !isValidIntegerOrEmpty(draftCounts.flange)) {
                  setSubmitError('法兰球阀数量需为非负整数');
                  return;
                }
                if (draftLengthStr !== '' && !isValidDecimalOrEmpty(draftLengthStr)) {
                  setSubmitError('当前段长度需为数字');
                  return;
                }
                let lengthToCommit = selectedSegment?.length;
                if (draftLengthStr !== '') {
                  const val = Number(draftLengthStr);
                  if (!Number.isFinite(val)) {
                    setSubmitError('当前段长度需为数字');
                    return;
                  }
                  lengthToCommit = Math.min(200, Math.max(0.1, val));
                }
                const payload = { material: draft.material, diameter: draft.diameter, length: lengthToCommit };
                const pendings = [];
                if (draft.material === '无缝钢管' || draft.material === '直缝钢管') {
                  pendings.push({ type: 'flangeValve', count: parseDesiredCount(draftCounts.flange) });
                }
                if (onCommitSegmentEdits) {
                  onCommitSegmentEdits(payload, pendings);
                } else {
                  onUpdateSegment && onUpdateSegment(payload);
                  pendings.forEach(p => {
                    if (onSetChainValveCount && p?.type) onSetChainValveCount(p.type, Math.max(0, Math.floor(Number(p.count) || 0)));
                  });
                }
                setIsEditing(false);
              }
            }}
            aria-label={isEditing ? '完成' : '编辑'}
            style={{
              padding: isMobile ? '6px 10px' : '8px 12px',
              borderRadius: 10,
              background: isEditing ? (prefersDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)') : (prefersDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)'),
              color: isEditing ? (prefersDark ? '#34d399' : '#065f46') : (prefersDark ? '#93c5fd' : '#1d4ed8'),
              border: `1px solid ${isEditing ? (prefersDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.35)') : (prefersDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.35)')}`,
              fontSize: isMobile ? 12 : 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >{isEditing ? '完成' : '编辑'}</button>
          </div>
        </div>
        <div style={bentoGridStyle}>
        {row('长度', (
          isEditing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.10 - 200.00"
                value={draftLengthStr}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraftLengthStr(v);
                  // 在编辑态仅更新草稿与样式，不实时更新段长
                }}
                aria-label="当前段长度"
                style={{
                  ...numberInputStyle,
                  border: lengthValid ? numberInputStyle.border : `1px solid ${prefersDark ? 'rgba(248, 113, 113, 0.6)' : 'rgba(239, 68, 68, 0.85)'}`,
                  background: prefersDark ? (lengthValid ? inputStyle.background : 'rgba(127, 29, 29, 0.2)') : (lengthValid ? inputStyle.background : 'rgba(254, 226, 226, 0.9)')
                }}
              />
              <span style={{ fontSize: isMobile ? 12 : 13, color: prefersDark ? '#cbd5e1' : '#334155' }}>m</span>
            </div>
          ) : (
            `${(typeof selectedSegment?.length === 'number' ? Number(selectedSegment.length).toFixed(2) : '0.00')} m`
          )
        ))}
        {row('材质', (
          isEditing ? (
            <select
              value={draft.material || ''}
              onChange={(e) => {
                const nextMaterial = e.target.value;
                setDraft(prev => ({
                  ...prev,
                  material: nextMaterial, // 切材质时同步修正直径选项
                  diameter: (diameterOptionsMap[nextMaterial] || diameters)[0]
                }));
              }}
              style={inputStyle}
            >
              {materials.map(m => (<option key={m} value={m}>{m}</option>))}
            </select>
          ) : (
            selectedSegment?.material || ''
          )
        ))}
        {row('直径', (
          isEditing ? (
            <select
              value={draft.diameter || ''}
              onChange={(e) => {
                const nextDiameter = e.target.value;
                setDraft(prev => ({ ...prev, diameter: nextDiameter }));
              }}
              style={inputStyle}
            >
              {(diameterOptionsMap[materialForOptions] || diameters).map(d => (<option key={d} value={d}>{d}</option>))}
            </select>
          ) : (
            selectedSegment?.diameter || ''
          )
        ))}

        {/* 显示当前段的手动支撑件，作为属性项追加 */}
        {(() => {
          const currentSegmentFittings = manualFittings.filter(item => item.segmentId === selectedSegment?.id);
          return currentSegmentFittings.map(item => (
            <div key={item.id} style={bentoItemStyle}>
              <div style={bentoLabelStyle} title={(() => {
                const typeLabel = item.type === 'bracket' ? (item.subType || '支撑') : (item.type === 'pillar' ? '立柱' : (item.type || '配件'));
                const specPart = item.spec || '';
                const heightPart = (((item.subType === '立柱') || (item.type === 'pillar')) && typeof item.height === 'number') ? `（${Number(item.height).toFixed(2)}m）` : '';
                return `${typeLabel}-${specPart}${heightPart}`;
              })()}>
                {(() => {
                  const typeLabel = item.type === 'bracket' ? (item.subType || '支撑') : (item.type === 'pillar' ? '立柱' : (item.type || '配件'));
                  const specPart = item.spec || '';
                  const heightPart = (((item.subType === '立柱') || (item.type === 'pillar')) && typeof item.height === 'number') ? `（${Number(item.height).toFixed(2)}m）` : '';
                  return `${typeLabel}-${specPart}${heightPart}`;
                })()}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <div style={bentoValueStyle}>{item.quantity}</div>
                <button type="button"
                  onClick={() => removeManualFittingById(item.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: prefersDark ? '#f87171' : '#dc2626',
                    fontSize: 16,
                    cursor: 'pointer',
                    padding: '2px 4px'
                  }}
                  aria-label="删除"
                >×</button>
              </div>
            </div>
          ));
        })()}

        {/* 编辑态下，提供“添加”按钮作为属性项 */}
        {isEditing && (
          <div style={bentoItemStyle}>
            <div style={bentoLabelStyle}>添加支撑</div>
            <button type="button"
              onClick={() => {
                try { onOpenSupportDialog && onOpenSupportDialog(); } catch (err) { console.warn('[BottomZone] 打开支撑弹窗失败', err); }
              }}
              aria-label="添加支撑"
              style={{
                padding: isMobile ? '6px 10px' : '8px 12px',
                borderRadius: 10,
                background: prefersDark ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.15)',
                color: prefersDark ? '#a78bfa' : '#6d28d9',
                border: `1px solid ${prefersDark ? 'rgba(139, 92, 246, 0.35)' : 'rgba(139, 92, 246, 0.35)'}`,
                fontSize: isMobile ? 12 : 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >添加</button>
          </div>
        )}
        </div>
        {/* 防爆电磁球阀字段已移除 */}
        {/* 物联网表字段已移除 */}
        {/* 调压箱字段已移除 */}
        {/* 校验与提示信息 */}
        {isEditing && submitError && (
          <div style={{ marginTop: 6, color: prefersDark ? '#fecaca' : '#b91c1c', fontSize: 12 }} aria-live="polite">{submitError}</div>
        )}
        {/* 底部操作区移除“删除”按钮，编辑按钮已移至标题栏右侧 */}
      </div>
    );
  };

  useEffect(() => {
    // PropertiesPanel 的挂起提交行为已在其内部控制
  }, []);

  const bottomZoneSectionStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8
  };

  // 方向配置
  const directions = [
    { angle: 0, label: '东', icon: '→' },
    { angle: 135, label: '南', icon: '↙' },
    { angle: 180, label: '西', icon: '←' },
    { angle: 315, label: '北', icon: '↗' },
    { angle: 270, label: '上', icon: '↑' },
    { angle: 90, label: '下', icon: '↓' }
  ];

  // 材质配置（来自配置）
  const materials = pipelineConfig.materials;

  // 直径映射（来自配置）
  const diameterOptionsMap = pipelineConfig.diameterOptions;

  const diameters = diameterOptionsMap[selectedMaterial] || diameterOptionsMap[materials[0]];

  const SelectorButton = ({ children, onClick, testid, disabled = false }) => {
    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);

    const baseStyle = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      width: isMobile ? 64 : 72,
      height: isMobile ? 64 : 72,
      background: hovered && !disabled ? (prefersDark ? 'rgba(55, 53, 53, 0.95)' : 'rgba(243, 245, 252, 0.98)') : (prefersDark ? 'rgba(47, 45, 45, 0.9)' : 'rgba(248, 250, 252, 0.95)'),
      border: `1px solid ${prefersDark ? 'rgba(71, 85, 105, 0.6)' : 'rgba(226, 232, 240, 0.8)'}`,
      borderRadius: 16,
      color: prefersDark ? '#e2e8f0' : '#0f172a',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      transition: 'transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease, background 0.18s ease',
      outline: 'none',
      pointerEvents: disabled ? 'none' : 'auto'
    };

    const valueStyle = { fontSize: isMobile ? 16 : 20, lineHeight: 1, width: testid === "btn-direction" ? '100%' : '200%', textAlign: 'center' };

    return (
      <button
        type="button"
        data-testid={testid}
        style={baseStyle}
        onClick={disabled ? undefined : onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        aria-disabled={disabled}
      >
        {/* If children is a short string of exactly 4 characters (e.g. 镀锌钢管), render as two rows of 2 chars each
          Skip this splitting for the diameter button to keep diameter labels single-line. */}
        {typeof children === 'string' && Array.from(children).length === 4 && testid !== 'btn-diameter' ? (
          (() => {
            const chars = Array.from(children);
            const first = chars.slice(0, 2).join('');
            const second = chars.slice(2).join('');
            return (
              <span style={{ ...valueStyle, display: 'inline-block', lineHeight: 1 }}>
                <span style={{ display: 'block' }}>{first}</span>
                <span style={{ display: 'block' }}>{second}</span>
              </span>
            );
          })()
        ) : (
          <span style={valueStyle}>{children}</span>
        )}
      </button>
    );
  };

  // 弹出式选择器组件：点击显示选项列表，选择后关闭
  const PopupSelector = ({ options, value, onChange, testid, disabled = false, disabledIndices = [], renderLabel }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hovered, setHovered] = useState(false);
    const containerRef = useRef(null);
    const buttonRef = useRef(null);
    const [popupPos, setPopupPos] = useState({ top: 0, left: 0, width: 0 });

    const buttonWidth = isMobile ? 64 : 72;
    const buttonHeight = isMobile ? 64 : 72;

    // 计算弹出框位置
    useEffect(() => {
      if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setPopupPos({
          top: rect.top, // 紧贴按钮顶部
          left: rect.left + rect.width / 2, // 居中对齐
          width: rect.width
        });
      }
    }, [isOpen]);

    // 点击外部关闭弹出框
    useEffect(() => {
      if (!isOpen) return;
      const handleClickOutside = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target) && 
            buttonRef.current && !buttonRef.current.contains(e.target)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }, [isOpen]);

    const borderColor = prefersDark ? 'rgba(71, 85, 105, 0.6)' : 'rgba(226, 232, 240, 0.8)';
    const bgColor = prefersDark ? 'rgba(47, 45, 45, 0.95)' : 'rgba(248, 250, 252, 0.98)';
    const bgColorHover = prefersDark ? 'rgba(55, 53, 53, 0.95)' : 'rgba(243, 245, 252, 0.98)';

    const baseStyle = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      width: buttonWidth,
      height: buttonHeight,
      background: hovered && !disabled ? bgColorHover : bgColor,
      border: `1px solid ${borderColor}`,
      // 打开时：上圆角变直角，与弹出框融合；关闭时：保持正常圆角
      borderRadius: isOpen ? '0 0 16px 16px' : 16,
      borderTop: isOpen ? 'none' : `1px solid ${borderColor}`,
      color: prefersDark ? '#e2e8f0' : '#0f172a',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      transition: 'background 0.18s ease',
      outline: 'none',
      pointerEvents: disabled ? 'none' : 'auto'
    };

    const valueStyle = { fontSize: isMobile ? 16 : 20, lineHeight: 1, width: testid === "btn-direction" ? '100%' : '200%', textAlign: 'center' };

    // 渲染当前值的显示文本
    const displayLabel = renderLabel ? renderLabel(value) : value;
    const displayChars = typeof displayLabel === 'string' ? Array.from(displayLabel) : [];

    // 弹出框内容使用Portal渲染到body
    const popupContent = isOpen ? ReactDOM.createPortal(
      <div
        ref={containerRef}
        role="listbox"
        style={{
          position: 'fixed',
          top: popupPos.top,
          left: popupPos.left,
          transform: 'translateX(-50%) translateY(-100%)',
          width: popupPos.width || buttonWidth,
          maxHeight: 240,
          overflowY: 'auto',
          overflowX: 'hidden',
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderBottom: 'none', // 底部无边框，与按钮融合
          borderRadius: '16px 16px 0 0', // 下圆角变直角
          boxShadow: '0 -4px 16px rgba(0,0,0,0.12)',
          zIndex: 999999,
          padding: '4px 0'
        }}
      >
        {options.map((opt, idx) => {
          const optValue = typeof opt === 'object' ? opt.value : opt;
          const optLabel = typeof opt === 'object' ? opt.label : opt;
          const isDisabled = disabledIndices.includes(idx);
          const isSelected = optValue === value || idx === value;
          // 计算字体大小：如果文本太长，自动缩小字体
          const labelLen = typeof optLabel === 'string' ? optLabel.length : 0;
          const optFontSize = labelLen > 6 ? (isMobile ? 11 : 12) : (labelLen > 4 ? (isMobile ? 12 : 13) : (isMobile ? 14 : 15));
          return (
            <button
              key={optValue ?? idx}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) {
                  onChange(typeof opt === 'object' && opt.returnIndex ? idx : optValue);
                  setIsOpen(false);
                }
              }}
              style={{
                width: '100%',
                padding: isMobile ? '10px 4px' : '8px 6px',
                background: isSelected
                  ? (prefersDark ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.15)')
                  : 'transparent',
                color: isDisabled
                  ? (prefersDark ? '#64748b' : '#9ca3af')
                  : (prefersDark ? '#e5e7eb' : '#0f172a'),
                border: 'none',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: isMobile ? 14 : 15,
                fontWeight: isSelected ? 700 : 400,
                textAlign: 'center',
                opacity: isDisabled ? 0.5 : 1,
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                lineHeight: 1.2
              }}
            >
              {optLabel}
            </button>
          );
        })}
      </div>,
      document.body
    ) : null;

    return (
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          ref={buttonRef}
          type="button"
          data-testid={testid}
          style={baseStyle}
          onClick={disabled ? undefined : () => setIsOpen(!isOpen)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          {typeof displayLabel === 'string' && displayChars.length === 4 && testid !== 'btn-diameter' ? (
            (() => {
              const first = displayChars.slice(0, 2).join('');
              const second = displayChars.slice(2).join('');
              return (
                <span style={{ ...valueStyle, display: 'inline-block', lineHeight: 1 }}>
                  <span style={{ display: 'block' }}>{first}</span>
                  <span style={{ display: 'block' }}>{second}</span>
                </span>
              );
            })()
          ) : (
            <span style={valueStyle}>{displayLabel}</span>
          )}
        </button>
        {popupContent}
      </div>
    );
  };

  const handleMultiButtonClick = () => {
    if (!hasCurrentPoint) return;
    if (hasSegments) {
      onExtendSegment();
    } else {
      onCreateSegment();
    }
  };

  const drawControlsContainerStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    transition: 'opacity 0.18s ease, transform 0.18s ease',
    opacity: uiMode === 'insert' ? 0 : 1,
    transform: uiMode === 'insert' ? 'translateY(-4px)' : 'translateY(0)',
    pointerEvents: uiMode === 'insert' ? 'none' : 'auto'
  };

  return (
    <div id="gm-live-bottom-zone" className="bottom-zone-internal" style={bottomZoneContainerStyle}>
      <div style={bottomZoneContentStyle}>
        {uiMode === 'insert' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', padding: '2px 0', gap: 6, flexWrap: 'wrap' }}>
            {(viewMode === 'plane'
              ? [
                  { key: 'room', label: '房间' },
                  { key: 'door', label: '门' },
                  { key: 'window', label: '窗' },
                ]
              : [
                  { key: 'copperValve', label: '球阀' },
                  { key: 'tee', label: '三通' },
                  { key: 'elbow', label: '弯头' },
                  { key: 'flangeValve', label: '法兰阀' },
                  { key: 'explosionProofValve', label: '电磁阀' },
                  { key: 'regulator', label: '调压箱' },
                  { key: 'meter', label: '燃气表' },
                  { key: 'pillar', label: '立柱' },
                  { key: 'junction', label: '接驳点' },
                  { key: 'blockage', label: '封堵' },
                  { key: 'heatShrinkSleeve', label: '热收缩套' },
                ]).map(item => (
              <button type="button"
                key={item.key}
                aria-label={`选择插入${item.label}`}
                onClick={() => {
                  setInsertDeviceType(item.key);
                  if (['regulator','meter','pillar','junction','tee','elbow'].includes(item.key)) {
                    // 打开就地浮层并重置/初始化草稿
                    const defaults = {
                      meterSpec: equipmentConfig.meterTypes?.[0] || 'G4',
                      regulatorSpec: equipmentConfig.regulatorTypes?.[0] || 'RX25',
                      pillar: {
                        diameter: (pipelineConfig?.diameterOptions?.['镀锌钢管'] || ['DN15'])[0],
                        height: 6,
                        quantity: 1,
                      }
                    };
                    setInlineInsertDraft(prev => {
                      const base = prev || {};
                      const next = { ...base };
                      if (item.key === 'meter') {
                        next.meterSpec = insertOptions?.meterSpec || defaults.meterSpec;
                        // 默认为左表/右表选项
                        next.meterSide = insertOptions?.meterSide || '左表';
                      } else if (item.key === 'regulator') {
                        next.regulatorSpec = insertOptions?.regulatorSpec || defaults.regulatorSpec;
                      } else if (item.key === 'pillar') {
                        const cur = insertOptions?.pillar || defaults.pillar;
                        next.pillar = {
                          diameter: cur?.diameter || defaults.pillar.diameter,
                          height: typeof cur?.height === 'number' ? cur.height : defaults.pillar.height,
                          quantity: typeof cur?.quantity === 'number' ? cur.quantity : defaults.pillar.quantity,
                        };
                      } else if (item.key === 'junction') {
                        next.junctionId = (insertOptions?.junctionId || '').trim();
                      } else if (item.key === 'tee') {
                        const cur = insertOptions?.tee || {};
                        next.teeKind = cur?.kind || cur?.teeKind || '等径';
                        next.branchDiameter = cur?.branchDiameter || null;
                      } else if (item.key === 'elbow') {
                        const cur = insertOptions?.elbow || {};
                        next.elbowKind = cur?.kind || '等径';
                        next.elbowBranchDiameter = cur?.branchDiameter || null;
                      }
                      return next;
                    });
                    setInsertPopoverOpen(true);
                  } else {
                    setInsertPopoverOpen(false);
                  }
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
                style={{
                  fontSize: isMobile ? 12 : 12,
                  fontWeight: 700,
                  borderRadius: 9999,
                  padding: isMobile ? '6px 12px' : '6px 12px',
                  background: insertDeviceType === item.key
                    ? (prefersDark ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.18)')
                    : (prefersDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.12)'),
                  color: prefersDark ? '#e5e7eb' : '#0f172a',
                  border: `1px solid ${prefersDark ? 'rgba(71, 85, 105, 0.6)' : 'rgba(226, 232, 240, 0.8)'}`,
                  cursor: 'pointer',
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        {uiMode === 'insert' && insertPopoverOpen && ['regulator','meter','pillar','junction','tee','elbow'].includes(insertDeviceType) ? (
          <div
            role="dialog"
            aria-label="插入参数设置"
            style={{
              position: 'relative',
              width: '100%',
              borderRadius: 16,
              border: `1px solid ${prefersDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(203, 213, 225, 0.6)'}`,
              background: prefersDark ? 'rgba(2, 6, 23, 0.95)' : 'rgba(255, 255, 255, 0.98)',
              boxShadow: prefersDark ? '0 6px 18px rgba(2, 6, 23, 0.6)' : '0 6px 18px rgba(148, 163, 184, 0.25)',
              maxHeight: isMobile ? 260 : 300,
              overflow: 'hidden',
              marginTop: 6
            }}
          >
            {/* 滚动提示 */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 18, background: 'linear-gradient(to bottom, rgba(2,6,23,0.15), rgba(2,6,23,0))', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 18, background: 'linear-gradient(to top, rgba(2,6,23,0.15), rgba(2,6,23,0))', pointerEvents: 'none' }} />
            {/* 顶部标题 + 操作按钮（保持与属性面板一致） */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '10px 12px 0 12px' : '12px 12px 0 12px' }}>
              <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: prefersDark ? '#cbd5e1' : '#334155' }}>
                {insertDeviceType === 'meter'
                  ? '燃气表参数'
                  : insertDeviceType === 'regulator'
                  ? '调压箱参数'
                  : insertDeviceType === 'pillar'
                  ? '立柱参数'
                  : insertDeviceType === 'tee'
                  ? '三通参数'
                  : insertDeviceType === 'elbow'
                  ? '弯头参数'
                  : '接驳点参数'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button"
                  onClick={() => { setInsertPopoverOpen(false); setInlineInsertErrors({}); }}
                  style={{ padding: '6px 10px', borderRadius: 10, border: `1px solid ${prefersDark ? 'rgba(148,163,184,0.35)' : 'rgba(203,213,225,0.8)'}`, background: 'transparent', color: prefersDark ? '#e5e7eb' : '#0f172a', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                >取消</button>
                <button type="button"
                  onClick={() => {
                    if (insertDeviceType === 'pillar') {
                      const h = inlineInsertDraft.pillar?.height;
                      const q = inlineInsertDraft.pillar?.quantity;
                      const validHeight = typeof h === 'number' && h >= 0;
                      const validQuantity = typeof q === 'number' && q >= 1;
                      if (!validHeight || !validQuantity) {
                        setInlineInsertErrors({ height: !validHeight, quantity: !validQuantity });
                        return;
                      }
                      setInsertOptions(prev => ({ ...prev, pillar: { diameter: inlineInsertDraft.pillar?.diameter, height: h, quantity: q } }));
                    } else if (insertDeviceType === 'meter') {
                      setInsertOptions(prev => ({ ...prev, meterSpec: inlineInsertDraft.meterSpec, meterSide: inlineInsertDraft.meterSide }));
                    } else if (insertDeviceType === 'regulator') {
                      setInsertOptions(prev => ({ ...prev, regulatorSpec: inlineInsertDraft.regulatorSpec }));
                      try { onAutoInsertRegulator && onAutoInsertRegulator(inlineInsertDraft.regulatorSpec); } catch (e) { /* noop */ }
                    } else if (insertDeviceType === 'junction') {
                      const v = (inlineInsertDraft?.junctionId || '').trim();
                      const err = inlineInsertErrors?.junctionId;
                      if (!v || err) {
                        setInlineInsertErrors(e => ({ ...e, junctionId: !v ? 'ID不能为空' : (err || null) }));
                        return;
                      }
                      setInsertOptions(prev => ({ ...prev, junctionId: v }));
                    } else if (insertDeviceType === 'tee') {
                      const kind = inlineInsertDraft.teeKind || '等径';
                      const branchDiameter = inlineInsertDraft.branchDiameter || null;
                      setInsertOptions(prev => ({ ...prev, tee: { kind, branchDiameter } }));
                    } else if (insertDeviceType === 'elbow') {
                      const kind = inlineInsertDraft.elbowKind || '等径';
                      const branchDiameter = inlineInsertDraft.elbowBranchDiameter || null;
                      setInsertOptions(prev => ({ ...prev, elbow: { kind, branchDiameter } }));
                    }
                    setInsertPopoverOpen(false);
                    setInlineInsertErrors({});
                  }}
                  style={{ padding: '6px 10px', borderRadius: 10, border: 'none', background: prefersDark ? '#3b82f6' : '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  disabled={insertDeviceType === 'junction' && (!!inlineInsertErrors?.junctionId || !(inlineInsertDraft?.junctionId || '').trim())}
                >确认</button>
              </div>
            </div>
            {/* 可滚动内容 */}
            <div style={{ padding: 12, paddingTop: 8, overflowY: 'auto', maxHeight: isMobile ? 240 : 280 }}>
              {/* 统一输入样式（紧凑） */}
              {(() => {
                const inputBase = {
                  width: '100%', maxWidth: 180, padding: isMobile ? '6px 8px' : '8px 10px', borderRadius: 10,
                  border: `1px solid ${prefersDark ? 'rgba(148,163,184,0.35)' : 'rgba(203,213,225,0.8)'}`,
                  background: prefersDark ? 'rgba(30,41,59,0.35)' : 'rgba(255,255,255,0.98)', color: prefersDark ? '#e5e7eb' : '#0f172a', fontSize: isMobile ? 12 : 13,
                };
                const smallNum = { ...inputBase, maxWidth: 120 };
                const gridWrap = (children) => (<div style={bentoGridStyle}>{children}</div>);
                const row = (label, control, extraRight = null) => (
                  <div style={bentoItemStyle}>
                    <div style={bentoLabelStyle} title={label}>{label}</div>
                    <div style={{ ...bentoValueStyle, gap: 6 }}>
                      {control}
                      {extraRight}
                    </div>
                  </div>
                );

                if (insertDeviceType === 'meter') {
                  return gridWrap(<>
                    {row('规格', (
                      <select aria-label="燃气表规格" value={inlineInsertDraft.meterSpec || equipmentConfig.meterTypes[0]} onChange={(e) => setInlineInsertDraft(d => ({ ...d, meterSpec: e.target.value }))} style={inputBase}>
                        {(equipmentConfig.meterTypes || []).map(t => (<option key={t} value={t}>{t}</option>))}
                      </select>
                    ))}
                    {row('表位', (
                      <select aria-label="燃气表表位" value={inlineInsertDraft.meterSide || '左表'} onChange={(e) => setInlineInsertDraft(d => ({ ...d, meterSide: e.target.value }))} style={inputBase}>
                        <option value="左表">左表</option>
                        <option value="右表">右表</option>
                      </select>
                    ))}
                  </>);
                }

                if (insertDeviceType === 'regulator') {
                  return gridWrap(<>
                    {row('规格', (
                      <select aria-label="调压箱规格" value={inlineInsertDraft.regulatorSpec || equipmentConfig.regulatorTypes[0]} onChange={(e) => setInlineInsertDraft(d => ({ ...d, regulatorSpec: e.target.value }))} style={inputBase}>
                        {(equipmentConfig.regulatorTypes || []).map(t => (<option key={t} value={t}>{t}</option>))}
                      </select>
                    ))}
                  </>);
                }

                if (insertDeviceType === 'pillar') {
                  return gridWrap(<>
                    {row('管径', (
                      <select aria-label="立柱管径" value={(inlineInsertDraft.pillar?.diameter) || (pipelineConfig?.diameterOptions?.['镀锌钢管'] || ['DN15'])[0]} onChange={(e) => setInlineInsertDraft(d => ({ ...d, pillar: { ...(d.pillar || {}), diameter: e.target.value } }))} style={inputBase}>
                        {(pipelineConfig?.diameterOptions?.['镀锌钢管'] || []).map(d => (<option key={d} value={d}>{d}</option>))}
                      </select>
                    ))}
                    {row('高度', (
                      <input type="text" inputMode="decimal" placeholder="默认 6" aria-label="立柱高度" value={String(inlineInsertDraft.pillar?.height ?? 6)} onChange={(e) => {
                        const v = e.target.value; const valid = /^\d*(?:\.\d*)?$/.test(v) && Number(v) >= 0;
                        setInlineInsertErrors(err => ({ ...err, height: !valid }));
                        setInlineInsertDraft(d => ({ ...d, pillar: { ...(d.pillar || {}), height: v === '' ? '' : Number(v) } }));
                      }}
                        style={{ ...smallNum, border: `1px solid ${inlineInsertErrors.height ? (prefersDark ? 'rgba(248,113,113,0.6)' : 'rgba(239,68,68,0.85)') : (prefersDark ? 'rgba(148,163,184,0.35)' : 'rgba(203,213,225,0.8)')}`, background: prefersDark ? (inlineInsertErrors.height ? 'rgba(127,29,29,0.2)' : smallNum.background) : (inlineInsertErrors.height ? 'rgba(254,226,226,0.9)' : smallNum.background) }} />
                    ), (<span style={{ fontSize: isMobile ? 12 : 13, color: prefersDark ? '#cbd5e1' : '#334155' }}>m</span>))}
                    {row('数量', (
                      <input type="text" inputMode="numeric" placeholder="默认 1" aria-label="立柱数量" value={String(inlineInsertDraft.pillar?.quantity ?? 1)} onChange={(e) => {
                        const v = e.target.value; const valid = /^\d+$/.test(v) && Number(v) >= 1;
                        setInlineInsertErrors(err => ({ ...err, quantity: !valid }));
                        setInlineInsertDraft(d => ({ ...d, pillar: { ...(d.pillar || {}), quantity: v === '' ? '' : Number(v) } }));
                      }}
                        style={{ ...smallNum, border: `1px solid ${inlineInsertErrors.quantity ? (prefersDark ? 'rgba(248,113,113,0.6)' : 'rgba(239,68,68,0.85)') : (prefersDark ? 'rgba(148,163,184,0.35)' : 'rgba(203,213,225,0.8)')}`, background: prefersDark ? (inlineInsertErrors.quantity ? 'rgba(127,29,29,0.2)' : smallNum.background) : (inlineInsertErrors.quantity ? 'rgba(254,226,226,0.9)' : smallNum.background) }} />
                    ))}
                  </>);
                }

                if (insertDeviceType === 'tee') {
                  const fallbackDia = allDiameterOptions[0] || 'DN15';
                  return gridWrap(<>
                    {row('类型', (
                      <select aria-label="三通类型" value={inlineInsertDraft.teeKind || '等径'} onChange={(e) => setInlineInsertDraft(d => ({ ...d, teeKind: e.target.value }))} style={inputBase}>
                        <option value="等径">等径</option>
                        <option value="异径">异径</option>
                      </select>
                    ))}
                    {inlineInsertDraft.teeKind === '异径' && row('支干管径', (
                      <select aria-label="支干管径" value={inlineInsertDraft.branchDiameter || fallbackDia} onChange={(e) => setInlineInsertDraft(d => ({ ...d, branchDiameter: e.target.value }))} style={inputBase}>
                        {(allDiameterOptions.length ? allDiameterOptions : [fallbackDia]).map(d => (<option key={d} value={d}>{d}</option>))}
                      </select>
                    ))}
                    <div style={{ gridColumn: '1 / -1', fontSize: 12, color: prefersDark ? '#94a3b8' : '#64748b' }}>插入时请先在画布上选择目标管线位置，三通将作为配件插入并显示为垂直短线。</div>
                  </>);
                }

                if (insertDeviceType === 'elbow') {
                  const fallbackDia = allDiameterOptions[0] || 'DN15';
                  return gridWrap(<>
                    {row('类型', (
                      <select aria-label="弯头类型" value={inlineInsertDraft.elbowKind || '等径'} onChange={(e) => {
                        const value = e.target.value;
                        setInlineInsertDraft(d => ({ ...d, elbowKind: value, elbowBranchDiameter: value === '等径' ? null : (d.elbowBranchDiameter || fallbackDia) }));
                      }} style={inputBase}>
                        <option value="等径">等径</option>
                        <option value="异径">异径</option>
                      </select>
                    ))}
                    {inlineInsertDraft.elbowKind === '异径' && row('管径', (
                      <select aria-label="弯头管径" value={inlineInsertDraft.elbowBranchDiameter || fallbackDia} onChange={(e) => setInlineInsertDraft(d => ({ ...d, elbowBranchDiameter: e.target.value }))} style={inputBase}>
                        {(allDiameterOptions.length ? allDiameterOptions : [fallbackDia]).map(d => (<option key={d} value={d}>{d}</option>))}
                      </select>
                    ))}
                    <div style={{ gridColumn: '1 / -1', fontSize: 12, color: prefersDark ? '#94a3b8' : '#64748b' }}>弯头需插入在端点位置，参数将用于统计口径。</div>
                  </>);
                }

                // junction
                return (<>
                  {gridWrap(
                    row('唯一ID', (
                      <input type="text" inputMode="text" placeholder="例如 J-001" aria-label="接驳点唯一ID" value={String(inlineInsertDraft.junctionId || '')}
                        onChange={(e) => {
                          const v = (e.target.value || '').trim();
                          setInlineInsertDraft(d => ({ ...d, junctionId: v }));
                          const exists = (components || []).some(c => c?.type === 'junction' && String(c?.junctionId || '').trim() === v && v);
                          setInlineInsertErrors(err => ({ ...err, junctionId: !v ? 'ID不能为空' : (exists ? 'ID已存在，请输入唯一ID' : null) }));
                        }}
                        style={{ ...inputBase, border: `1px solid ${inlineInsertErrors.junctionId ? (prefersDark ? 'rgba(248,113,113,0.6)' : 'rgba(239,68,68,0.85)') : (prefersDark ? 'rgba(148,163,184,0.35)' : 'rgba(203,213,225,0.8)')}`, background: prefersDark ? (inlineInsertErrors.junctionId ? 'rgba(127,29,29,0.2)' : inputBase.background) : (inlineInsertErrors.junctionId ? 'rgba(254,226,226,0.9)' : inputBase.background) }} />
                    ))
                  )}
                  {inlineInsertErrors?.junctionId ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444' }}>{inlineInsertErrors.junctionId}</div>
                  ) : null}
                  <div style={{ marginTop: 2, fontSize: 12, color: prefersDark ? '#94a3b8' : '#64748b' }}>用于工程合并时拼接的唯一标识。</div>
                </>);
              })()}
            </div>
          </div>
        ) : null}
        {/* 绘制模式下：有选中项时显示属性面板，否则显示绘制控件 */}
        {uiMode === 'draw' ? (
          // 有选中的设备/配件/线段时显示属性面板
          (selectedComponent || selectedFitting || selectedSegment) && !insertDeviceType ? (
            // 选中线段时直接使用PropertiesPanel
            selectedSegment && pipelineStats ? (
              <PropertiesPanel
                stats={pipelineStats}
                onUpdateSegment={onUpdateSegment}
                onDelete={() => onDeleteSegment && onDeleteSegment(selectedSegment)}
              />
            ) : selectedComponent ? (
              <div style={panelStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: prefersDark ? '#cbd5e1' : '#334155' }}>
                    设备属性
                  </div>
                  <button type="button"
                    onClick={() => onDeleteComponent && onDeleteComponent(selectedComponent)}
                    aria-label="删除"
                    style={{
                      padding: isMobile ? '6px 10px' : '8px 12px',
                      borderRadius: 10,
                      background: prefersDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                      color: prefersDark ? '#fca5a5' : '#dc2626',
                      border: `1px solid ${prefersDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                      fontSize: isMobile ? 12 : 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >删除</button>
                </div>
                <div style={bentoGridStyle}>
                  <div style={bentoItemStyle}>
                    <div style={bentoLabelStyle}>类型</div>
                    <div style={bentoValueStyle}>{{
                      copperValve: '球阀', flangeValve: '法兰阀', explosionProofValve: '电磁阀',
                      meter: '燃气表', regulator: '调压箱', pillar: '立柱',
                      junction: '接驳点', blockage: '封堵', heatShrinkSleeve: '热收缩套',
                      room: '房间', door: '门', window: '窗'
                    }[selectedComponent.type] || selectedComponent.type}</div>
                  </div>
                  {selectedComponent.meterSpec && (
                    <div style={bentoItemStyle}>
                      <div style={bentoLabelStyle}>规格</div>
                      <div style={bentoValueStyle}>{selectedComponent.meterSpec}</div>
                    </div>
                  )}
                  {selectedComponent.regulatorSpec && (
                    <div style={bentoItemStyle}>
                      <div style={bentoLabelStyle}>型号</div>
                      <div style={bentoValueStyle}>{selectedComponent.regulatorSpec}</div>
                    </div>
                  )}
                  {selectedComponent.junctionId && (
                    <div style={bentoItemStyle}>
                      <div style={bentoLabelStyle}>ID</div>
                      <div style={bentoValueStyle}>{selectedComponent.junctionId}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : selectedFitting ? (
              <div style={panelStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: prefersDark ? '#cbd5e1' : '#334155' }}>
                    配件属性
                  </div>
                  <button type="button"
                    onClick={() => onDeleteFitting && onDeleteFitting(selectedFitting)}
                    aria-label="删除"
                    style={{
                      padding: isMobile ? '6px 10px' : '8px 12px',
                      borderRadius: 10,
                      background: prefersDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                      color: prefersDark ? '#fca5a5' : '#dc2626',
                      border: `1px solid ${prefersDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                      fontSize: isMobile ? 12 : 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >删除</button>
                </div>
                <div style={bentoGridStyle}>
                  <div style={bentoItemStyle}>
                    <div style={bentoLabelStyle}>类型</div>
                    <div style={bentoValueStyle}>{{
                      tee: '三通', elbow: '弯头'
                    }[selectedFitting.type] || selectedFitting.type}</div>
                  </div>
                  {selectedFitting.teeKind && (
                    <div style={bentoItemStyle}>
                      <div style={bentoLabelStyle}>三通类型</div>
                      <div style={bentoValueStyle}>{selectedFitting.teeKind}</div>
                    </div>
                  )}
                  {selectedFitting.branchDiameter && (
                    <div style={bentoItemStyle}>
                      <div style={bentoLabelStyle}>支管径</div>
                      <div style={bentoValueStyle}>{selectedFitting.branchDiameter}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : null
          ) : (
            // 没有选中项或有选中插入设备时显示绘制控件
            <div style={drawControlsContainerStyle} aria-hidden={uiMode !== 'draw'}>
            <div style={bottomZoneSectionStyle}>
                {(() => {
                  const allForbidden = Array.isArray(forbiddenDirectionIndices) && forbiddenDirectionIndices.length >= directions.length;
                  const directionOptions = directions.map((d, idx) => ({ value: idx, label: d.label, returnIndex: true }));
                  return (
                    <PopupSelector
                      testid="btn-direction"
                      disabled={allForbidden}
                      options={directionOptions}
                      value={selectedDirection}
                      onChange={(idx) => onDirectionChange(idx)}
                      disabledIndices={forbiddenDirectionIndices || []}
                      renderLabel={(idx) => directions[idx]?.label || '东'}
                    />
                  );
                })()}
              </div>
              <div style={bottomZoneSectionStyle}>
                <PopupSelector
                  testid="btn-material"
                  options={materials}
                  value={selectedMaterial}
                  onChange={(m) => onMaterialChange(m)}
                  renderLabel={(m) => m}
                />
              </div>

              <div style={bottomZoneSectionStyle}>
                <PopupSelector
                  testid="btn-diameter"
                  options={diameters}
                  value={selectedDiameter}
                  onChange={(d) => onDiameterChange(d)}
                  renderLabel={(d) => d}
                />
              </div>

              {(() => {
                const safeDistance = typeof distance === 'number' && !isNaN(distance) ? distance : 0;
                const rounded = Math.round(safeDistance * 100) / 100;
                const displayFallback = `${rounded.toFixed(2)}`;
                const inputValue = distanceEditing ? distanceDraft : displayFallback;
                const boxStyle = {
                  width: isMobile ? 64 : 72,
                  height: isMobile ? 64 : 72,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: 16,
                  border: `1px solid ${prefersDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(203, 213, 225, 0.7)'}`,
                  background: prefersDark ? 'rgba(30, 41, 59, 0.35)' : 'rgba(255, 255, 255, 0.95)'
                };
                const inpStyle = {
                  width: '70%',
                  textAlign: 'center',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: isMobile ? 18 : 20,
                  fontWeight: 700,
                  color: prefersDark ? '#e5e7eb' : '#0f172a'
                };
                const unitStyle = { fontSize: isMobile ? 12 : 13, color: prefersDark ? '#cbd5e1' : '#334155' };

                const commit = () => {
                  setDistanceEditing(false);
                  const v = parseFloat(distanceDraft);
                  if (isNaN(v)) { setDistanceDraft(''); return; }
                  const next = Math.max(0, Math.min(200, Math.round(v * 100) / 100));
                  onSetDistance && onSetDistance(next);
                  // 提交后清空草稿，回到回退显示
                  setDistanceDraft('');
                };

                return (
                  <div style={bottomZoneSectionStyle}>
                    <div aria-label="绘制步长（米）" style={boxStyle}>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="步长输入"
                        value={inputValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (/^\d*(?:\.\d*)?$/.test(v)) {
                            setDistanceDraft(v);
                          }
                        }}
                        onFocus={() => { setDistanceEditing(true); if (distanceDraft === '') setDistanceDraft(displayFallback); }}
                        onBlur={commit}
                        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
                        placeholder="6"
                        style={inpStyle}
                      />
                      <span style={unitStyle}>m</span>
                    </div>
                  </div>
                );
              })()}

            <div style={bottomZoneSectionStyle}>
                {(() => {
                  const allForbidden = Array.isArray(forbiddenDirectionIndices) && forbiddenDirectionIndices.length >= directions.length;
                  return (
                    <MultiButton
                      disabled={!hasCurrentPoint || allForbidden}
                      onClick={handleMultiButtonClick}
                      isMobile={isMobile}
                      selectedDirection={selectedDirection}
                      directions={directions}
                    />
                  );
                })()}
              </div>
            </div>
          )
        ) : (
          uiMode === 'move' ? null : null
        )}
      </div>

      {/* 弹窗限制在 LiveDock 内：在 Bottom 包裹中内联渲染 */}
      {/* 注意：遮罩 absolute 不参与高度，但卡片为常规流元素，增加 scrollHeight */}
      {false /* 保留占位：实际弹窗渲染位置在 Bottom 包裹内 */}
    </div>
  );
};

// 多功能按钮组件
const MultiButton = ({ disabled, onClick, isMobile, selectedDirection, directions }) => {
  const baseStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    width: isMobile ? 64 : 72, height: isMobile ? 64 : 72,
    background: disabled ? 'linear-gradient(135deg, #9ca3af, #6b7280)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    border: 'none', borderRadius: 16, color: 'white', cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative', overflow: 'hidden', pointerEvents: 'auto'
  };

  const glossStyle = !disabled ? {
    content: '""', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))', transition: 'opacity 0.3s ease'
  } : null;

  return (
    <button type="button" style={baseStyle} onClick={disabled ? undefined : onClick} disabled={disabled}>
      {!disabled && <span style={glossStyle} />}
      <span style={{ fontSize: 24, lineHeight: 1 }}>{directions[selectedDirection]?.icon || '→'}</span>
    </button>
  );
};

// Memoized BottomZone component for performance parity
const BottomZone = React.memo(BottomZoneRaw);

// 设备插入区域组件（放在Center和Bottom之间）
const InsertDeviceZoneRaw = ({ viewMode = 'system' }) => {
  const { insertDeviceType, setInsertDeviceType, insertOptions, setInsertOptions, components } = useProject();
  const [insertPopoverOpen, setInsertPopoverOpen] = useState(false);
  const [inlineInsertDraft, setInlineInsertDraft] = useState({});
  const [inlineInsertErrors, setInlineInsertErrors] = useState({});

  const [isMobile, setIsMobile] = useState(globalThis.innerWidth <= 768);
  const [prefersDark, setPrefersDark] = useState(globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const resizeHandler = () => setIsMobile(globalThis.innerWidth <= 768);
    globalThis.addEventListener('resize', resizeHandler);
    let media;
    const schemeHandler = (e) => setPrefersDark(e.matches);
    if (globalThis.matchMedia) {
      media = globalThis.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener ? media.addEventListener('change', schemeHandler) : media.addListener(schemeHandler);
    }
    return () => {
      globalThis.removeEventListener('resize', resizeHandler);
      if (media) {
        media.removeEventListener ? media.removeEventListener('change', schemeHandler) : media.removeListener(schemeHandler);
      }
    };
  }, []);

  // 设备列表
  const deviceList = viewMode === 'plane'
    ? [
        { key: 'room', label: '房间' },
        { key: 'door', label: '门' },
        { key: 'window', label: '窗' },
      ]
    : [
        { key: 'copperValve', label: '球阀' },
        { key: 'tee', label: '三通' },
        { key: 'elbow', label: '弯头' },
        { key: 'flangeValve', label: '法兰阀' },
        { key: 'explosionProofValve', label: '电磁阀' },
        { key: 'regulator', label: '调压箱' },
        { key: 'meter', label: '燃气表' },
        { key: 'pillar', label: '立柱' },
        { key: 'junction', label: '接驳点' },
        { key: 'blockage', label: '封堵' },
        { key: 'heatShrinkSleeve', label: '热收缩套' },
      ];

  const allDiameterOptions = useMemo(() => {
    try {
      const map = pipelineConfig?.diameterOptions || {};
      const set = new Set();
      Object.keys(map).forEach(k => (map[k] || []).forEach(d => set.add(d)));
      const arr = Array.from(set);
      return arr.sort((a, b) => {
        const na = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
        const nb = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
        return na - nb;
      });
    } catch (e) {
      return (pipelineConfig?.diameterOptions?.[Object.keys(pipelineConfig?.diameterOptions || {})[0]] || []);
    }
  }, []);

  const handleDeviceClick = (item) => {
    // 如果点击的是已选中的设备，则取消选中
    if (insertDeviceType === item.key) {
      setInsertDeviceType(null);
      setInsertPopoverOpen(false);
      return;
    }
    setInsertDeviceType(item.key);
    if (['regulator','meter','pillar','junction','tee','elbow'].includes(item.key)) {
      const defaults = {
        meterSpec: equipmentConfig.meterTypes?.[0] || 'G4',
        regulatorSpec: equipmentConfig.regulatorTypes?.[0] || 'RX25',
        pillar: {
          diameter: (pipelineConfig?.diameterOptions?.['镀锌钢管'] || ['DN15'])[0],
          height: 6,
          quantity: 1,
        }
      };
      setInlineInsertDraft(prev => {
        const base = prev || {};
        const next = { ...base };
        if (item.key === 'meter') {
          next.meterSpec = insertOptions?.meterSpec || defaults.meterSpec;
          next.meterSide = insertOptions?.meterSide || '左表';
        } else if (item.key === 'regulator') {
          next.regulatorSpec = insertOptions?.regulatorSpec || defaults.regulatorSpec;
        } else if (item.key === 'pillar') {
          const cur = insertOptions?.pillar || defaults.pillar;
          next.pillar = {
            diameter: cur?.diameter || defaults.pillar.diameter,
            height: typeof cur?.height === 'number' ? cur.height : defaults.pillar.height,
            quantity: typeof cur?.quantity === 'number' ? cur.quantity : defaults.pillar.quantity,
          };
        } else if (item.key === 'junction') {
          next.junctionId = (insertOptions?.junctionId || '').trim();
        } else if (item.key === 'tee') {
          const cur = insertOptions?.tee || {};
          next.teeKind = cur?.kind || cur?.teeKind || '等径';
          next.branchDiameter = cur?.branchDiameter || null;
        } else if (item.key === 'elbow') {
          const cur = insertOptions?.elbow || {};
          next.elbowKind = cur?.kind || '等径';
          next.elbowBranchDiameter = cur?.branchDiameter || null;
        }
        return next;
      });
      setInsertPopoverOpen(true);
    } else {
      setInsertPopoverOpen(false);
    }
  };

  const borderColor = prefersDark ? 'rgba(71, 85, 105, 0.6)' : 'rgba(226, 232, 240, 0.8)';
  const bgColor = prefersDark ? 'rgba(2, 6, 23, 0.95)' : 'rgba(255, 255, 255, 0.98)';

  return (
    <div id="gm-live-insert-zone" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 8,
      width: '100%',
      padding: '8px 0'
    }}>
      {/* 设备按钮区 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        width: '100%', 
        padding: '2px 0', 
        gap: 6, 
        flexWrap: 'wrap' 
      }}>
        {deviceList.map(item => (
          <button 
            type="button"
            key={item.key}
            aria-label={`选择插入${item.label}`}
            aria-pressed={insertDeviceType === item.key}
            onClick={() => handleDeviceClick(item)}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
            style={{
              fontSize: isMobile ? 12 : 12,
              fontWeight: 700,
              borderRadius: 9999,
              padding: isMobile ? '6px 12px' : '6px 12px',
              background: insertDeviceType === item.key
                ? (prefersDark ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.18)')
                : (prefersDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.12)'),
              color: prefersDark ? '#e5e7eb' : '#0f172a',
              border: `1px solid ${borderColor}`,
              cursor: 'pointer',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease'
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 参数设置面板 */}
      {insertPopoverOpen && ['regulator','meter','pillar','junction','tee','elbow'].includes(insertDeviceType) ? (
        <div
          role="dialog"
          aria-label="插入参数设置"
          style={{
            position: 'relative',
            width: '100%',
            borderRadius: 16,
            border: `1px solid ${prefersDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(203, 213, 225, 0.6)'}`,
            background: bgColor,
            boxShadow: prefersDark ? '0 6px 18px rgba(2, 6, 23, 0.6)' : '0 6px 18px rgba(148, 163, 184, 0.25)',
            maxHeight: isMobile ? 260 : 300,
            overflow: 'hidden',
          }}
        >
          {/* 顶部标题 + 操作按钮 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '10px 12px 0 12px' : '12px 12px 0 12px' }}>
            <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: prefersDark ? '#cbd5e1' : '#334155' }}>
              {insertDeviceType === 'meter' ? '燃气表参数'
                : insertDeviceType === 'regulator' ? '调压箱参数'
                : insertDeviceType === 'pillar' ? '立柱参数'
                : insertDeviceType === 'tee' ? '三通参数'
                : insertDeviceType === 'elbow' ? '弯头参数'
                : '接驳点参数'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button"
                onClick={() => { setInsertPopoverOpen(false); setInlineInsertErrors({}); }}
                style={{ padding: '6px 10px', borderRadius: 10, border: `1px solid ${prefersDark ? 'rgba(148,163,184,0.35)' : 'rgba(203,213,225,0.8)'}`, background: 'transparent', color: prefersDark ? '#e5e7eb' : '#0f172a', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >取消</button>
              <button type="button"
                onClick={() => {
                  if (insertDeviceType === 'pillar') {
                    const h = inlineInsertDraft.pillar?.height;
                    const q = inlineInsertDraft.pillar?.quantity;
                    const validHeight = typeof h === 'number' && h >= 0;
                    const validQuantity = typeof q === 'number' && q >= 1;
                    if (!validHeight || !validQuantity) {
                      setInlineInsertErrors({ height: !validHeight, quantity: !validQuantity });
                      return;
                    }
                    setInsertOptions(prev => ({ ...prev, pillar: { diameter: inlineInsertDraft.pillar?.diameter, height: h, quantity: q } }));
                  } else if (insertDeviceType === 'meter') {
                    setInsertOptions(prev => ({ ...prev, meterSpec: inlineInsertDraft.meterSpec, meterSide: inlineInsertDraft.meterSide }));
                  } else if (insertDeviceType === 'regulator') {
                    setInsertOptions(prev => ({ ...prev, regulatorSpec: inlineInsertDraft.regulatorSpec }));
                  } else if (insertDeviceType === 'junction') {
                    const v = (inlineInsertDraft?.junctionId || '').trim();
                    const err = inlineInsertErrors?.junctionId;
                    if (!v || err) {
                      setInlineInsertErrors(e => ({ ...e, junctionId: !v ? 'ID不能为空' : (err || null) }));
                      return;
                    }
                    setInsertOptions(prev => ({ ...prev, junctionId: v }));
                  } else if (insertDeviceType === 'tee') {
                    const kind = inlineInsertDraft.teeKind || '等径';
                    const branchDiameter = inlineInsertDraft.branchDiameter || null;
                    setInsertOptions(prev => ({ ...prev, tee: { kind, branchDiameter } }));
                  } else if (insertDeviceType === 'elbow') {
                    const kind = inlineInsertDraft.elbowKind || '等径';
                    const branchDiameter = inlineInsertDraft.elbowBranchDiameter || null;
                    setInsertOptions(prev => ({ ...prev, elbow: { kind, branchDiameter } }));
                  }
                  setInsertPopoverOpen(false);
                  setInlineInsertErrors({});
                }}
                style={{ padding: '6px 10px', borderRadius: 10, border: 'none', background: prefersDark ? '#3b82f6' : '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                disabled={insertDeviceType === 'junction' && (!!inlineInsertErrors?.junctionId || !(inlineInsertDraft?.junctionId || '').trim())}
              >确认</button>
            </div>
          </div>
          {/* 可滚动内容 */}
          <div style={{ padding: 12, paddingTop: 8, overflowY: 'auto', maxHeight: isMobile ? 240 : 280 }}>
            {(() => {
              const inputBase = {
                width: '100%', maxWidth: 180, padding: isMobile ? '6px 8px' : '8px 10px', borderRadius: 10,
                border: `1px solid ${prefersDark ? 'rgba(148,163,184,0.35)' : 'rgba(203,213,225,0.8)'}`,
                background: prefersDark ? 'rgba(30,41,59,0.35)' : 'rgba(255,255,255,0.98)', color: prefersDark ? '#e5e7eb' : '#0f172a', fontSize: isMobile ? 12 : 13,
              };
              const smallNum = { ...inputBase, maxWidth: 120 };
              const bentoGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: isMobile ? 8 : 10, marginTop: 6 };
              const gridWrap = (children) => (<div style={bentoGridStyle}>{children}</div>);
              const row = (label, control, extraRight = null) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 600, color: prefersDark ? '#cbd5e1' : '#334155', minWidth: 48 }}>{label}</span>
                  {control}
                  {extraRight}
                </div>
              );

              if (insertDeviceType === 'meter') {
                return gridWrap(<>
                  {row('型号', (
                    <select value={inlineInsertDraft.meterSpec || ''} onChange={(e) => setInlineInsertDraft(d => ({ ...d, meterSpec: e.target.value }))} style={inputBase}>
                      {(equipmentConfig.meterTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ))}
                  {row('方向', (
                    <select value={inlineInsertDraft.meterSide || '左表'} onChange={(e) => setInlineInsertDraft(d => ({ ...d, meterSide: e.target.value }))} style={inputBase}>
                      {['左表', '右表'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ))}
                </>);
              }
              if (insertDeviceType === 'regulator') {
                return gridWrap(row('型号', (
                  <select value={inlineInsertDraft.regulatorSpec || ''} onChange={(e) => setInlineInsertDraft(d => ({ ...d, regulatorSpec: e.target.value }))} style={inputBase}>
                    {(equipmentConfig.regulatorTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )));
              }
              if (insertDeviceType === 'pillar') {
                return gridWrap(<>
                  {row('管径', (
                    <select value={inlineInsertDraft.pillar?.diameter || ''} onChange={(e) => setInlineInsertDraft(d => ({ ...d, pillar: { ...(d.pillar || {}), diameter: e.target.value } }))} style={inputBase}>
                      {allDiameterOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ))}
                  {row('高度', (
                    <input type="number" min="0" step="0.1" value={inlineInsertDraft.pillar?.height ?? ''} onChange={(e) => setInlineInsertDraft(d => ({ ...d, pillar: { ...(d.pillar || {}), height: parseFloat(e.target.value) || 0 } }))} style={{ ...smallNum, borderColor: inlineInsertErrors?.height ? '#ef4444' : undefined }} />
                  ), <span style={{ fontSize: 12, color: prefersDark ? '#94a3b8' : '#64748b' }}>米</span>)}
                  {row('数量', (
                    <input type="number" min="1" step="1" value={inlineInsertDraft.pillar?.quantity ?? ''} onChange={(e) => setInlineInsertDraft(d => ({ ...d, pillar: { ...(d.pillar || {}), quantity: parseInt(e.target.value) || 1 } }))} style={{ ...smallNum, borderColor: inlineInsertErrors?.quantity ? '#ef4444' : undefined }} />
                  ))}
                </>);
              }
              if (insertDeviceType === 'junction') {
                return gridWrap(row('ID', (
                  <input type="text" placeholder="唯一标识" value={inlineInsertDraft.junctionId || ''} onChange={(e) => {
                    const v = e.target.value.trim();
                    setInlineInsertDraft(d => ({ ...d, junctionId: v }));
                    const dup = (components || []).some(c => c?.type === 'junction' && String(c?.junctionId || '').trim() === v);
                    setInlineInsertErrors(prev => ({ ...prev, junctionId: dup ? 'ID已存在' : null }));
                  }} style={{ ...inputBase, borderColor: inlineInsertErrors?.junctionId ? '#ef4444' : undefined }} />
                ), inlineInsertErrors?.junctionId && <span style={{ fontSize: 11, color: '#ef4444' }}>{inlineInsertErrors.junctionId}</span>));
              }
              if (insertDeviceType === 'tee') {
                return gridWrap(<>
                  {row('类型', (
                    <select value={inlineInsertDraft.teeKind || '等径'} onChange={(e) => setInlineInsertDraft(d => ({ ...d, teeKind: e.target.value }))} style={inputBase}>
                      {['等径', '异径'].map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  ))}
                  {inlineInsertDraft.teeKind === '异径' && row('支管径', (
                    <select value={inlineInsertDraft.branchDiameter || ''} onChange={(e) => setInlineInsertDraft(d => ({ ...d, branchDiameter: e.target.value }))} style={inputBase}>
                      <option value="">选择</option>
                      {allDiameterOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ))}
                </>);
              }
              if (insertDeviceType === 'elbow') {
                return gridWrap(<>
                  {row('类型', (
                    <select value={inlineInsertDraft.elbowKind || '等径'} onChange={(e) => setInlineInsertDraft(d => ({ ...d, elbowKind: e.target.value }))} style={inputBase}>
                      {['等径', '异径'].map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  ))}
                  {inlineInsertDraft.elbowKind === '异径' && row('支管径', (
                    <select value={inlineInsertDraft.elbowBranchDiameter || ''} onChange={(e) => setInlineInsertDraft(d => ({ ...d, elbowBranchDiameter: e.target.value }))} style={inputBase}>
                      <option value="">选择</option>
                      {allDiameterOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ))}
                </>);
              }
              return null;
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const InsertDeviceZone = React.memo(InsertDeviceZoneRaw);

import { useProject } from "../contexts/ProjectContext.jsx";
import { ToastViewport, useToast } from './ToastProvider.jsx';
import { CompassButton } from './Compass.jsx'; // 指南针按钮组件
import CheckboxPill from './CheckboxPill.jsx';
import exportDesign from '../utils/exportDesign.js';

/**
 * LiveDock 复合组件
 * 垂直整合 Bottom（底部）、Center（中部核心控件）、Top（顶部工程管理）
 * - 保持各组件原有功能的完整性与可访问性
 * - 统一视觉风格与响应式布局
 * - 提供简洁 API 以便外部调用与配置
 */
  const LiveDock = forwardRef(({
    // Top/Center/Bottom 新命名
    bottomProps = null,
    centerProps = null,
    topProps = null,
    showTop = true,
    showCenter = true,
    showBottom = true,
    theme = 'auto', // 'auto' | 'light' | 'dark'
    responsive = true,
    onZoneToggle
}, ref) => {
    // 主题与响应式
    const [prefersDark, setPrefersDark] = useState(
        theme === 'dark' ? true : theme === 'light' ? false : (globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches)
    );
    const [isMobile, setIsMobile] = useState(globalThis.matchMedia && globalThis.matchMedia('(max-width: 768px)').matches);
    useEffect(() => {
        if (theme === 'auto') {
            let media;
            if (globalThis.matchMedia) {
                media = globalThis.matchMedia('(prefers-color-scheme: dark)');
                const schemeHandler = (e) => setPrefersDark(e.matches);
                media.addEventListener ? media.addEventListener('change', schemeHandler) : media.addListener(schemeHandler);
            }
            return () => {
                if (media) {
                    const schemeHandler = (e) => setPrefersDark(e.matches);
                    media.removeEventListener ? media.removeEventListener('change', schemeHandler) : media.removeListener(schemeHandler);
                }
            };
        }
    }, [theme]);
    useEffect(() => {
        if (!responsive) return;
        const mq = globalThis.matchMedia('(max-width: 768px)');
        const update = () => setIsMobile(!!mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, [responsive]);

    // 直接使用新命名 props

    // 设备朝向按钮使用独立组件，避免频繁更新影响父组件渲染

    // LiveDock spacing variables for unified layout
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--live-shell-pad', isMobile ? '8px 10px' : '10px 12px');
        root.style.setProperty('--live-zone-gap', '0px');
        root.style.setProperty('--live-header-gap', '8px');
        root.style.setProperty('--live-body-gap', '8px');
    }, [isMobile]);

    // 与 Bottom 区域对齐：测量 .bottom-zone-internal 的顶部位置，保证 LiveDock 堆叠在其之上
    // TODO: 重新接入 bottomZoneOffset 以对齐 Bottom 顶部位置
    // eslint-disable-next-line no-unused-vars
    const [bottomZoneOffset, setBottomZoneOffset] = useState(96); // 默认空隙
    const bottomMeasureRef = useRef(null);
    useEffect(() => {
        const measure = () => {
            const el = document.querySelector('.bottom-zone-internal');
            bottomMeasureRef.current = el || null;
            if (!el) { setBottomZoneOffset(96); return; }
            const rect = el.getBoundingClientRect();
            const offset = Math.max(24, Math.round(globalThis.innerHeight - rect.top) + 12); // 位于 Bottom 顶部上方 12px
            setBottomZoneOffset(offset);
        };
        const ro = new ResizeObserver(() => measure());
        measure();
        if (bottomMeasureRef.current) ro.observe(bottomMeasureRef.current);
        const onResize = () => measure();
        globalThis.addEventListener('resize', onResize);
        return () => {
            try { ro.disconnect(); } catch (err) { void err; }
            globalThis.removeEventListener('resize', onResize);
        };
    }, []);

    // 新增：支撑弹窗状态统一由 LiveDock 管理
    const [dialogOpen, setDialogOpen] = useState(null);
    const [dialogBracketType, setDialogBracketType] = useState('支架');
    const [dialogSpec, setDialogSpec] = useState((BRACKET_SPEC_OPTIONS['支架'] || [''])[0]);
    const [dialogHeight, setDialogHeight] = useState('');
    const [dialogQuantity, setDialogQuantity] = useState('1');
    const openSupportDialog = () => {
        setDialogOpen('bracket');
        setDialogBracketType('支架');
        setDialogSpec((BRACKET_SPEC_OPTIONS['支架'] || [''])[0]);
        setDialogHeight('');
        setDialogQuantity('1');
    };

    // 数据面板开合状态提升到 LiveDock，便于在其他逻辑中引用（例如防止 Bottom 区域在数据面板打开时收起）
    const [showDataPanel, setShowDataPanel] = useState(false);
    // 编辑模式的数据库面板状态与数据
    const [editModeOpen, setEditModeOpen] = useState(false);
    const [dbItems, setDbItems] = useState([]); // { key: string|array, value: any }
    const [dbSelectedKeys, setDbSelectedKeys] = useState(new Set());
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [addKind, setAddKind] = useState('完整版');
    const [addMonths, setAddMonths] = useState(1); // 1,6,12
    const [addQuantity, setAddQuantity] = useState(1); // 批量新增数量
    const [cardPreviewData, setCardPreviewData] = useState(null); // 卡片预览数据
    const [designPreviewCanvas, setDesignPreviewCanvas] = useState(null); // 图纸导出预览canvas
    const [designPreviewTransparent, setDesignPreviewTransparent] = useState(false);
    const [designExportReady, setDesignExportReady] = useState(false); // Track if design export is ready for preview
    const [showDesignPreview, setShowDesignPreview] = useState(false); // Track if user clicked preview button

    const genActivationCode = (kind) => {
      // 生成短格式激活码：类型前缀-6位随机字符（大写字母+数字）
      const prefix = {
        '完整版': 'FULL',
        '专业版': 'PRO',
        '企业版': 'ENT'
      }[kind] || 'FULL';
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除易混淆字符 I O 0 1
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      return `${prefix}-${code}`;
    };

    // 生成激活码卡片图片（高分辨率）
    const generateCardImage = async (codes) => {
      if (!codes || codes.length === 0) return;
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // 使用设备屏幕分辨率的2倍
      const dpr = window.devicePixelRatio || 1;
      const scale = dpr * 2;
      const baseWidth = 600;
      const rowHeight = 160;
      const topPadding = 100; // 顶部保留空白
      const baseHeight = topPadding * 2 + rowHeight * codes.length; // 主体高度（不含联系方式）

      // 预留底部联系方式区域，避免 helper 扩展画布造成背景分界
      const logicalWidth = baseWidth;
      const autoBottomFont = Math.max(12, Math.round(logicalWidth * 0.012));
      const qrSize = Math.min(160, Math.max(64, Math.round(logicalWidth * 0.12)));
      const contactGap = (typeof watermarkConfig?.contactGap === 'number') ? watermarkConfig.contactGap : Math.round(autoBottomFont * 1.2);
      const pad = (typeof watermarkConfig?.pad === 'number') ? watermarkConfig.pad : 20;
      const reservedContactH = qrSize + Math.max(4, Math.round(contactGap)) + autoBottomFont + Math.max(0, Math.round(pad));

      const totalHeight = baseHeight + reservedContactH;
      canvas.width = baseWidth * scale;
      canvas.height = totalHeight * scale;
      
      // 缩放上下文以支持高分辨率渲染
      ctx.scale(scale, scale);
      
      // 背景渐变
      const gradient = ctx.createLinearGradient(0, 0, baseWidth, totalHeight);
      gradient.addColorStop(0, prefersDark ? '#0f172a' : '#ffffff');
      gradient.addColorStop(1, prefersDark ? '#1e293b' : '#f8fafc');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, baseWidth, totalHeight);
      
      // 延后应用水印与联系方式到底部，避免修改画布尺寸导致后续绘制的缩放状态被重置
      const wmFontSize = 18;
      
      // 标题
      ctx.fillStyle = prefersDark ? '#f1f5f9' : '#0f172a';
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText('GasMap 激活码', 40, topPadding / 2);

      // 绘制每个激活码卡片
      codes.forEach((item, index) => {
        const y = topPadding + index * rowHeight;
        const { code, kind, expiration, codeExp } = item;
        
        // 卡片背景
        ctx.fillStyle = prefersDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(40, y, 520, 140);
        
        // 卡片边框
        ctx.strokeStyle = prefersDark ? 'rgba(71, 85, 105, 0.5)' : 'rgba(203, 213, 225, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(40, y, 520, 140);
        
        // 激活码（大字）
        ctx.fillStyle = prefersDark ? '#60a5fa' : '#2563eb';
        ctx.font = 'bold 36px monospace';
        ctx.fillText(code, 60, y + 50);
        
        // 种类标签
        ctx.fillStyle = prefersDark ? '#94a3b8' : '#64748b';
        ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('版本类型', 60, y + 85);
        ctx.fillStyle = prefersDark ? '#e5e7eb' : '#111827';
        ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText(kind, 140, y + 85);
        
        // 有效期
        ctx.fillStyle = prefersDark ? '#94a3b8' : '#64748b';
        ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('有效期至', 60, y + 115);
        ctx.fillStyle = prefersDark ? '#e5e7eb' : '#111827';
        ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText(formatDate(expiration), 140, y + 115);
        
        // 激活码失效时间
        if (codeExp) {
          const now = new Date().getTime();
          const daysLeft = Math.ceil((codeExp - now) / (1000 * 60 * 60 * 24));
          let expText = '';
          if (daysLeft > 0) {
            expText = `激活码将于 ${daysLeft} 天后失效`;
          } else {
            expText = '激活码已失效';
          }
          ctx.fillStyle = prefersDark ? '#94a3b8' : '#64748b';
          ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText(expText, 320, y + 115);
        }
      });
      
      // 最后应用水印与联系方式，并在需要时扩展底部空白，避免影响主体绘制的缩放
      try {
        await applyWatermarkToCanvas(canvas, { wmFontSize, qrPosition: 'left', scale, ensureSpace: false });
      } catch (err) {
        // 不阻塞卡片生成
        // eslint-disable-next-line no-console
        console.warn('[LiveDock] applyWatermarkToCanvas failed', err);
      }

      // Non-trial exports/cards intentionally omit watermark/contact lines when helper is skipped.

      // 返回canvas用于预览
      return canvas;
    };

    const addMonthsToDate = (date, months) => {
      const d = new Date(date.getTime());
      d.setMonth(d.getMonth() + months);
      return d;
    };

    const formatDate = (val) => {
      if (val === null || typeof val === 'undefined' || val === '') return '';
      let n = Number(val);
      let dt;
      if (!Number.isNaN(n) && String(val).trim() !== '') {
        dt = new Date(n);
      } else {
        dt = new Date(val);
      }
      if (Number.isNaN(dt.getTime())) return String(val);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}年${m}月${d}日`;
    };

    useEffect(() => {
      if (!editModeOpen) return;
      // refresh items from server when panel opens
      (async () => {
        try {
          const res = await fetch(`/kv/list?t=${Date.now()}`, { cache: 'no-store' });
          if (!res.ok) return;
          const data = await res.json();
          const items = (data.items || []).map(it => ({
            rawKey: Array.isArray(it.key) ? it.key : [it.key],
            key: Array.isArray(it.key) ? it.key.join('|') : String(it.key),
            value: it.value
          }));
          setDbItems(items);
        } catch (e) {
          console.warn('[LiveDock] failed to refresh kv list', e);
        }
      })();
    }, [editModeOpen]);

    // 简单的 toast helper 在 LiveDock 层可用给数据库面板使用
    const { show: _showToast } = useToast();
    const pushInfoToast = (type, title, message) => {
      try {
        _showToast({ type, title, message, duration: 3500, manualClose: true });
      } catch (e) { /* noop */ }
    };

    // 广告弹窗状态（提升到 LiveDock 层级）
    const [adOverlayVisible, setAdOverlayVisible] = useState(false);
    const [currentAd, setCurrentAd] = useState(null);

    // License info moved to ProjectContext; read from context instead to enable global access
    const { licenseVersion, subscriptionExpiry, activateVersion, getVersionConfig, versionFeatures: cfgVersionFeatures, isFeatureEnabled, currentProject } = useProject();
    const currentFeatures = getVersionConfig(licenseVersion) || getVersionConfig('trial');
    const canSwitchView = isFeatureEnabled && isFeatureEnabled('view', 'viewModeSwitch');

    // 加权随机选择广告的工具函数
    const selectAdByWeight = () => {
      const items = Array.isArray(adsConfig) ? adsConfig : (adsConfig?.items || []);
      if (!items || items.length === 0) return null;
      
      // 计算总权重
      const totalWeight = items.reduce((sum, ad) => sum + (ad.weight || 1), 0);
      
      // 生成随机数
      let random = Math.random() * totalWeight;
      
      // 根据权重选择广告
      for (const ad of items) {
        random -= (ad.weight || 1);
        if (random <= 0) {
          return ad;
        }
      }
      
      return items[0]; // fallback
    };

    // 便捷引用：从 bottomProps 读取当前选中段
    const selectedSegment = bottomProps?.selectedSegment;

    // 项目上下文（用于添加手动构件）
    const { uiMode, exportProject, setUiMode, addManualFitting, viewMode, setViewMode } = useProject();

    // 监听模式切换，根据配置决定是否弹出广告
    const prevUiModeRef = useRef(uiMode);
    useEffect(() => {
      // 跳过初始渲染
      if (prevUiModeRef.current === uiMode) return;
      
      // 根据当前版本配置判断是否弹广告
      if (currentFeatures.showAds && prevUiModeRef.current !== null) {
        const selectedAd = selectAdByWeight();
        if (selectedAd) {
          setCurrentAd(selectedAd);
          setAdOverlayVisible(true);
        }
      }
      
      prevUiModeRef.current = uiMode;
    }, [uiMode, currentFeatures.showAds]);

    // 可折叠状态（Top/Center/Bottom）
    const [isCenterZoneOpen, setIsCenterZoneOpen] = useState(!!showCenter);
    const [isTopZoneOpen, setIsTopZoneOpen] = useState(!!showTop);
    const [isBottomZoneOpen, setIsBottomZoneOpen] = useState(!!showBottom);

    // 读取全局 UI 模式以联动 Bottom 区域，并提供导出工程的便捷回调给 CenterZone
  // 上方已合并获取

  const handleExportProject = (e) => {
    e && e.stopPropagation && e.stopPropagation();
    try {
      if (!exportProject) { alert('没有可用的导出处理器'); return; }
      const result = exportProject();
      if (!result?.success) alert(result?.message || '导出失败');
    } catch (error) {
      alert('导出失败: ' + (error?.message || String(error)));
    }
  };

    // Bottom 区域折叠动画：测量内容高度并在显隐间进行 max-height 过渡
    const bottomWrapperRef = useRef(null);
    const shellRef = useRef(null);
    const [bottomContentMaxHeight, setBottomContentMaxHeight] = useState(0);
    useEffect(() => {
        const measureBottom = () => {
            const el = bottomWrapperRef.current;
            if (!el) return;
            const child = el.firstElementChild;
            const hEl = el.scrollHeight || 0;
            const hChild = (child && child.scrollHeight) ? child.scrollHeight : 0;
            const h = Math.max(hEl, hChild);
            // 优化：为移动端/桌面设置最小与最大阈值，超过最大值时内部滚动
            const minH = isMobile ? 140 : 160;
            const maxCap = Math.max(minH, Math.round(globalThis.innerHeight * (isMobile ? 0.55 : 0.6)));
            const next = Math.min(Math.max(h, minH), maxCap);
            setBottomContentMaxHeight(next);
        };

        let ro;      // 观察包裹容器
        let roChild; // 观察实际内容区域（BottomZone 根节点）

        // 初次与窗口变化时测量
        ro = new ResizeObserver(() => measureBottom());
        const el = bottomWrapperRef.current;
        if (el) {
            ro.observe(el);
            const child = el.firstElementChild;
            if (child) {
                // 关键：观察内容自身的尺寸变化（如编辑状态展开输入控件时）
                roChild = new ResizeObserver(() => measureBottom());
                roChild.observe(child);
            }
        }

        // 下一帧测量，确保子内容已挂载
        const id = requestAnimationFrame(measureBottom);
        const onResize = () => measureBottom();
        globalThis.addEventListener('resize', onResize);
        return () => {
            try { ro && ro.disconnect(); } catch { /* noop */ }
            try { roChild && roChild.disconnect(); } catch { /* noop */ }
            cancelAnimationFrame(id);
            globalThis.removeEventListener('resize', onResize);
        };
    }, [isMobile, showBottom, isBottomZoneOpen, dialogOpen]);

    // 模式状态来自 ProjectContext（避免重复显示冗余指示）
    // TODO: LiveDock 当前不直接使用 ProjectContext 的 uiMode/insertDeviceType

    // 在可见性状态变化时统一通知外部
    useEffect(() => {
        onZoneToggle?.({
          center: isCenterZoneOpen,
          top: isTopZoneOpen,
          bottom: isBottomZoneOpen
        });
    }, [isCenterZoneOpen, isTopZoneOpen, isBottomZoneOpen, onZoneToggle]);

    useImperativeHandle(ref, () => ({
        toggleCenter: () => setIsCenterZoneOpen(v => !v),
        toggleTop: () => setIsTopZoneOpen(v => !v),
        toggleBottom: () => setIsBottomZoneOpen(v => !v),
        setVisibility: (zones) => {
            if (typeof zones?.center === 'boolean') setIsCenterZoneOpen(zones.center);
            if (typeof zones?.top === 'boolean') setIsTopZoneOpen(zones.top);
            if (typeof zones?.bottom === 'boolean') setIsBottomZoneOpen(zones.bottom);
        }
    }));

    // 当父组件可见性改变时，与本地打开状态保持同步
    useEffect(() => { setIsTopZoneOpen(!!showTop); }, [showTop]);
    useEffect(() => { setIsCenterZoneOpen(!!showCenter); }, [showCenter]);
    useEffect(() => { setIsBottomZoneOpen(!!showBottom); }, [showBottom]);

    // 根据全局 UI 模式联动 Bottom 显隐（绘制/插入：显示；移动/属性：收起）
    // 这样在从“绘制模式”切到“属性模式”等情况下会触发收缩动画
    useEffect(() => {
      const hasSelection = !!(bottomProps?.selectedSegment || bottomProps?.selectedComponent || bottomProps?.selectedFitting || bottomProps?.selectedEndpoint);
      // Keep bottom open for draw/insert, or when viewing properties of a selection.
      // Also keep open when the data panel is explicitly opened (showDataPanel) to avoid accidental collapse.
      const shouldOpen = (
        uiMode === 'draw' ||
        uiMode === 'insert' ||
        (uiMode === 'property' && hasSelection) ||
        !!showDataPanel
      );
      if (!!showBottom && shouldOpen) {
        // 打开：先测量高度，再设置为打开以触发展开动画
        requestAnimationFrame(() => {
          const el = bottomWrapperRef.current;
          const child = el?.firstElementChild;
          const hEl = el?.scrollHeight || 0;
          const hChild = (child && child.scrollHeight) ? child.scrollHeight : 0;
          const h = Math.max(hEl, hChild);
          const minH = isMobile ? 140 : 160;
          const maxCap = Math.max(minH, Math.round(globalThis.innerHeight * (isMobile ? 0.55 : 0.6)));
          setBottomContentMaxHeight(Math.min(Math.max(h, minH), maxCap));
          setIsBottomZoneOpen(true);
        });
      } else {
        // 关闭：先记录当前高度，下一帧设置为0，从而平滑收起
        const el = bottomWrapperRef.current;
        const child = el?.firstElementChild;
        const hEl = el?.scrollHeight || 0;
        const hChild = (child && child.scrollHeight) ? child.scrollHeight : 0;
        const h = Math.max(hEl, hChild);
        const minH = isMobile ? 140 : 160;
        const maxCap = Math.max(minH, Math.round(globalThis.innerHeight * (isMobile ? 0.55 : 0.6)));
        setBottomContentMaxHeight(Math.min(Math.max(h, minH), maxCap));
        requestAnimationFrame(() => setIsBottomZoneOpen(false));
      }
    }, [uiMode, showBottom, isMobile, bottomProps?.selectedSegment, bottomProps?.selectedComponent, bottomProps?.selectedFitting, bottomProps?.selectedEndpoint, dialogOpen, showDataPanel]);

    const containerStyle = {
      position: 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      maxWidth: '100vw',
      zIndex: 1001,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      pointerEvents: 'none'
    };


   // 统一外壳：与 Bottom 保持一致的背景/边框/阴影，承载 Top + Center 两个区块
   const shellStyle = {
      width: isMobile ? '100%' : 'min(480px, 100%)',
     background: prefersDark ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 0.3)',
     backdropFilter: 'blur(16px)',
     WebkitBackdropFilter: 'blur(16px)',
     border: `1px solid ${prefersDark ? 'rgba(71, 85, 105, 0.4)' : 'rgba(255, 255, 255, 0.4)'}`,
     // only keep top corners rounded to mimic a bottom sheet
     borderRadius: '24px 24px 0 0',
     boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)',
     padding: 'var(--live-shell-pad)',
     paddingBottom: 0,
     color: prefersDark ? '#e2e8f0' : '#0f172a',
     display: 'flex',
     flexDirection: 'column',
     gap: 'var(--live-zone-gap)',
     pointerEvents: 'auto',
     zIndex: 999999
   };

    const TopZone = () => {
        const {
          projects,
          currentProject,
          setCurrentProjectId,
          createProject,
          deleteProject,
          renameProject,
          exportProject,
          importProject,
          uiMode,
          setUiMode,
          // 用于合并后的数据写入与持久化
          setSegments,
          setComponents,
          setFittings,
          setManualFittings,
          setDesignStartPoint,
          setCurrentPoint,
          setCanvasOffset,
          setScale,
          setShowLabels,
          setLabelVisibility,
          saveCurrentProject
        } = useProject();

        // 模式菜单开合与外部点击关闭
        const [showModeMenu, setShowModeMenu] = useState(false);
        const [adHeight, setAdHeight] = useState(0);
  const [capsuleMenuHeight, setCapsuleMenuHeight] = useState(0);

  useEffect(() => {
    if (showModeMenu) {
      // Give the DOM a chance to update after showModeMenu changes
      setTimeout(() => {
        const currentHeight = modeRef.current?.offsetHeight || 0;
        setCapsuleMenuHeight(currentHeight);
      }, 50);
    }
  }, [showModeMenu]);

  useEffect(() => {
    if (showModeMenu && modeRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        const capsuleMenuHeight = modeRef.current?.getBoundingClientRect().bottom || 0;
        const projectName = document.getElementById('gm-btn-project-name');
        const projectNameBottom = projectName ? projectName.getBoundingClientRect().bottom : 0;
        const baseline = isMobile ? 40 : 44; // 顶部行常规高度（项目名/新建按钮）
        const extra = Math.max(0, (modeRef.current?.offsetHeight || 0) - baseline); // 展开后增加的空间（menuH）
        const newHeight = Math.max(0, capsuleMenuHeight - projectNameBottom - extra);
        console.log('capsuleMenuHeight:', capsuleMenuHeight, 'projectNameBottom:', projectNameBottom, 'extra:', extra, 'newHeight:', newHeight);
        setAdHeight(newHeight);
      });

      resizeObserver.observe(modeRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [showModeMenu, isMobile]);
        const modeRef = useRef(null);
        useEffect(() => {
          if (!showModeMenu) return;
          const onDocClick = (e) => {
            if (!modeRef.current) return;
            if (!modeRef.current.contains(e.target)) {
              // 延迟到当前点击回合的所有处理结束后再关闭，避免卸载打断同一次点击的 onClick
              setTimeout(() => setShowModeMenu(false), 0);
            }
          };
          document.addEventListener('click', onDocClick);
          return () => document.removeEventListener('click', onDocClick);
        }, [showModeMenu]);

        const [showDropdown, setShowDropdown] = useState(false);
        const [inlineEditingId, setInlineEditingId] = useState(null);
        const [inlineName, setInlineName] = useState('');
        const fileInputRef = useRef(null);
        const projectListRef = useRef(null);

        // 工程复选框选择状态
        const [selectedProjectIds, setSelectedProjectIds] = useState([]);
        const toggleProjectSelection = (projectId) => {
            setSelectedProjectIds(prev => prev.includes(projectId)
                ? prev.filter(id => id !== projectId)
                : [...prev, projectId]);
        };
        const clearProjectSelection = () => setSelectedProjectIds([]);
        const canMerge = (selectedProjectIds?.length || 0) >= 2;
        const [merging, setMerging] = useState(false);
        const [, setMergeProgress] = useState('');
        const MERGE_WARNING_DURATION = 5200;
        const MERGE_ERROR_DURATION = 6200;
        const MERGE_SUCCESS_DURATION = 6000;
        const MERGE_INFO_DURATION = 4800;

        // Toast 提示：接入全局 ToastProvider
        const { show, update, dismiss } = useToast();
        const pushInfoToast = (type, title, message) => {
          _showToast({
            type,
            title,
            message,
            duration: MERGE_INFO_DURATION,
            manualClose: true
          });
        };

        // 进度 Toast：返回 toast id，后续用 update(id, { progress }) 持续更新
        const showProgressToast = (message, initialProgress = 0, options = {}) => {
          const id = show({
            type: options.type || 'info',
            title: options.title || '进度',
            message,
            // 进度类 Toast 需要可持续更新与手动关闭
            sticky: true,
            duration: 0,
            progress: typeof initialProgress === 'number' ? initialProgress : 0,
          });
          return id;
        };
        // 可选：便捷更新/收尾方法，便于调用处逐步推进或完成后收起
        const updateProgressToast = (id, progress, patch = {}) => update(id, { progress, ...patch });
        const finishProgressToast = (id, patch = {}) => {
          // 新策略：不自动关闭，由用户手动点红点关闭
          update(id, { progress: 100, ...patch });
        };

        const iconButton = (ariaLabel, onClick, children, id) => (
            <button type="button"
                id={id}
                aria-label={ariaLabel}
                onClick={onClick}
                style={{
                    width: isMobile ? 40 : 44,
                    height: isMobile ? 40 : 44,
                    borderRadius: 9999,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    transition: 'background 0.2s ease, transform 0.12s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = prefersDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
                <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {children}
                </span>
            </button>
        );

        // 统一操作按钮样式（用于 更名/删除/合并/导入 等）
        const actionBtnStyle = (disabled = false) => ({
          padding: '5px 8px',
          borderRadius: 8,
          border: `1px solid ${prefersDark ? '#334155' : '#e5e7eb'}`,
          background: disabled ? (prefersDark ? '#0b1220' : '#f3f4f6') : (prefersDark ? '#0f172a' : '#ffffff'),
          color: prefersDark ? '#e2e8f0' : '#111827',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 12,
          opacity: disabled ? 0.7 : 1
        });

        const getNextUnnamedSequence = () => {
            const prefix = '未命名工程-';
            const used = new Set();
            for (const p of projects || []) {
                if (p && typeof p.name === 'string' && p.name.startsWith(prefix)) {
                    const numStr = p.name.slice(prefix.length);
                    const n = parseInt(numStr, 10);
                    if (!isNaN(n) && n > 0) used.add(n);
                }
            }
            let i = 1;
            while (used.has(i)) i++;
            return i;
        };

        const handleNewProject = (e) => {
            e && e.stopPropagation();
            const seq = getNextUnnamedSequence();
            const defaultName = `未命名工程-${seq}`;
            try {
                const newProject = createProject(defaultName);
                setCurrentProjectId(newProject.id);
                setInlineEditingId(newProject.id);
                setInlineName(newProject.name);
                setShowDropdown(true);
            } catch (error) {
                alert(error.message);
            }
        };

        const handleSelectProject = (projectId) => {
          // 在切换工程前先保存当前工程，避免未持久化的内存状态被新工程覆盖
          try {
            if (typeof saveCurrentProject === 'function') saveCurrentProject();
          } catch (e) {
            console.warn('[LiveDock] saveCurrentProject before switch failed', e);
          }
          // 隐藏下拉并延后切换，给 React/localStorage 一次事件循环机会完成写入
          setShowDropdown(false);
          setTimeout(() => {
            try { setCurrentProjectId(projectId); } catch (e) { console.error('[LiveDock] setCurrentProjectId failed', e); }
          }, 0);
        };

        const handleDeleteProject = (e, projectId) => {
            e && e.stopPropagation();
            if (globalThis.confirm('确定要删除这个工程吗？')) {
                deleteProject(projectId);
            }
        };

        const handleRenameProject = (e, project) => {
            e && e.stopPropagation();
            setInlineEditingId(project.id);
            setInlineName(project.name);
            setShowDropdown(true);
        };

        const confirmInlineRename = (e, projectId) => {
            e && e.stopPropagation();
            const name = (inlineName || '').trim();
            if (!name) { alert('请输入工程名称'); return; }
            try {
                renameProject(projectId, name);
                setInlineEditingId(null);
                setInlineName('');
            } catch (error) {
                alert(error.message);
            }
        };

        const cancelInlineEdit = (e) => {
            e && e.stopPropagation();
            setInlineEditingId(null);
            setInlineName('');
        };

        const handleExportProject = (e) => {
            e && e.stopPropagation();
            if (!currentProject) { alert('没有可导出的工程'); return; }
            try {
                const result = exportProject();
                if (!result?.success) alert(result?.message || '导出失败');
            } catch (error) {
                alert('导出失败: ' + error.message);
            }
        };

        const handleImportClick = (e) => {
            e && e.stopPropagation();
            if (fileInputRef.current) fileInputRef.current.click();
        };

        const handleFileChange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const res = await importProject(file);
                if (!res?.success) alert(res?.message || '导入失败');
            } catch (error) {
                alert('导入失败: ' + error.message);
            } finally {
                e.target.value = '';
            }
        };

        const handleExportDesign = async (e) => {
          e && e.stopPropagation && e.stopPropagation();
          if (!centerProps?.onCaptureView) {
            alert('导出设计功能不可用');
            return;
          }
          
          // Reset export ready state
          setDesignExportReady(false);
          setShowDesignPreview(false);
          
          // Show progress toast with disabled Preview button and close button
          const progressToastId = show({
            type: 'info',
            title: '导出设计',
            message: '正在生成图纸，请稍候...',
            progress: 0,
            sticky: true,
            manualClose: true, // Add close button
            actions: [
              {
                label: '预览',
                style: 'button',
                disabled: true,
                onClick: () => {
                  // This will be enabled later when export is ready
                }
              }
            ]
          });
          
          try {
            const title = currentProject?.name || '未命名工程';
            
            // Update progress: capturing plane view
            update(progressToastId, { progress: 20, message: '正在捕获平面图...' });
            
            // capture plane then system
            const planeBlob = await centerProps.onCaptureView('plane', '——平面图');
            
            // Update progress: capturing system view
            update(progressToastId, { progress: 50, message: '正在捕获系统图...' });
            
            const systemBlob = await centerProps.onCaptureView('system', '——系统图');
            
            // Update progress: generating document
            update(progressToastId, { progress: 70, message: '正在生成导出文档...' });
            
            // preview before download; add watermark for trial/体验版
            const isTrial = (licenseVersion === 'trial');
            const canvas = await exportDesign({ planeBlob, systemBlob, lengths: centerProps?.lengths, fittings: centerProps?.fittings, devices: centerProps?.devices, projectName: title, dpi: 300, orientation: 'landscape', preview: true, addWatermark: isTrial });
            
            if (canvas && canvas instanceof HTMLCanvasElement) {
              setDesignPreviewCanvas(canvas);
              setDesignExportReady(true);
              
              // Update toast with enabled Preview button
              update(progressToastId, {
                progress: 100,
                message: '设计图已准备就绪',
                actions: [
                  {
                    label: '预览',
                    style: 'button',
                    disabled: false,
                    onClick: () => {
                      setShowDesignPreview(true);
                    }
                  }
                ]
              });
            } else {
              // fallback: trigger default download
              await exportDesign({ planeBlob, systemBlob, lengths: centerProps?.lengths, fittings: centerProps?.fittings, devices: centerProps?.devices, projectName: title, dpi: 300, orientation: 'landscape' });
              dismiss(progressToastId);
            }
          } catch (err) {
            console.error('[LiveDock] handleExportDesign failed', err);
            dismiss(progressToastId);
            setDesignExportReady(false);
            show({
              type: 'error',
              title: '导出失败',
              message: '设计图导出过程中出现错误',
              duration: 3000
            });
          }
        };

        const currentName = currentProject?.name || '未命名工程';

        // 新工程添加后确保下拉列表滚动到底部显示
        useEffect(() => {
            if (showDropdown && projectListRef.current) {
                requestAnimationFrame(() => {
                    try { projectListRef.current.scrollTop = projectListRef.current.scrollHeight; } catch { /* noop */ }
                });
            }
        }, [projects?.length, showDropdown]);

        // 合并逻辑：基于接驳点（junctionId）识别可合并工程并创建新工程
        const handleMergeProjects = async (e) => {
            e && e.stopPropagation();
            if (!canMerge || merging) return;
            let mergeToastId = null;
            try {
                console.log('[LiveDock] handleMergeProjects start', { selectedProjectIds, canMerge, merging });
                setMerging(true);
                setMergeProgress('分析选中工程…');
                // 单一进度 Toast 初始化
                mergeToastId = showProgressToast('分析选中工程…', 5, { title: '合并进度', type: 'info' });
                try { saveCurrentProject(); } catch (e) { console.error('[LiveDock] saveCurrentProject failed', e); }
                // 让 React 完成一次事件循环以应用保存后的 projects 更新
                await new Promise((resolve) => setTimeout(resolve, 0));

                let projectsSnapshot = projects;
                if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
                  try {
                    const stored = globalThis.localStorage.getItem('pipelineProjects');
                    if (stored) {
                      const parsed = JSON.parse(stored);
                      if (Array.isArray(parsed)) {
                        projectsSnapshot = parsed;
                      }
                    }
                  } catch (storageError) {
                    console.warn('[LiveDock] Failed to read latest projects from localStorage, fallback to context state', storageError);
                  }
                }

                const selected = (projectsSnapshot || []).filter(p => selectedProjectIds.includes(p.id));
                if (selected.length < 2) {
                  console.log('[LiveDock] merge aborted: fewer than 2 selected or projects stale', { selectedProjectIds, selectedLength: selected.length });
                  setMerging(false);
                  setMergeProgress('');
                  if (mergeToastId) update(mergeToastId, { type: 'warning', title: '合并中止', message: '请至少选中两个工程进行合并', progress: 100 });
                  return;
                }
                if (mergeToastId) update(mergeToastId, { message: '检查工程数据…', progress: 10 });

                // 早期数据检查：若选中工程均为空（无段/设备/管件），直接提示并退出
                const hasAnyData = selected.some(p =>
                  (Array.isArray(p.segments) && p.segments.length > 0) ||
                  (Array.isArray(p.components) && p.components.length > 0) ||
                  (Array.isArray(p.fittings) && p.fittings.length > 0) ||
                  (Array.isArray(p.manualFittings) && p.manualFittings.length > 0)
                );
                if (!hasAnyData) {
                  setMergeProgress('选中工程没有可合并的数据');
                  setMerging(false);
                  if (mergeToastId) update(mergeToastId, { type: 'error', title: '合并失败', message: '选中的工程均为空，请先绘制或保存后再试', progress: 100 });
                  return;
                }
                if (mergeToastId) update(mergeToastId, { message: '构建接驳点映射…', progress: 20 });

                // 构建接驳点ID映射：junctionId -> [{ projectId, comp }]
                const junctionMap = new Map();
                for (const proj of selected) {
                    const comps = Array.isArray(proj.components) ? proj.components : [];
                    for (const c of comps) {
                        if (c && c.type === 'junction' && String(c.junctionId || '').trim()) {
                            const key = String(c.junctionId).trim();
                            const list = junctionMap.get(key) || [];
                            list.push({ projectId: proj.id, comp: c });
                            junctionMap.set(key, list);
                        }
                    }
                }

                const commonJunctionIds = Array.from(junctionMap.entries())
                    .filter(([_, list]) => (list?.length || 0) >= 2)
                    .map(([id]) => id);

                const everyProjectHasJunction = selected.every(proj =>
                  (Array.isArray(proj.components) ? proj.components : []).some(c => c && c.type === 'junction' && String(c.junctionId || '').trim())
                );
                if (!everyProjectHasJunction) {
                  console.log('[LiveDock] merge aborted: some projects lack junction components');
                  setMerging(false);
                  setMergeProgress('');
                  if (mergeToastId) update(mergeToastId, { type: 'error', title: '合并失败', message: '存在未配置接驳点的工程', progress: 100 });
                  return;
                }

                if (commonJunctionIds.length === 0) {
                  console.log('[LiveDock] merge aborted: no common junction ids across selected projects');
                  setMerging(false);
                  setMergeProgress('');
                  if (mergeToastId) update(mergeToastId, { type: 'error', title: '合并失败', message: '未找到共同接驳点，无法合并工程', progress: 100 });
                  return;
                }

                const projectHasCommonJunction = selected.every(proj => {
                  const ids = new Set();
                  (Array.isArray(proj.components) ? proj.components : []).forEach(c => {
                    if (c && c.type === 'junction' && String(c.junctionId || '').trim()) {
                      ids.add(String(c.junctionId).trim());
                    }
                  });
                  return commonJunctionIds.some(id => ids.has(id));
                });

                if (!projectHasCommonJunction) {
                  console.log('[LiveDock] merge aborted: at least one project lacks the shared junction id', { commonJunctionIds });
                  setMerging(false);
                  setMergeProgress('');
                  if (mergeToastId) update(mergeToastId, { type: 'error', title: '合并失败', message: '所有工程需共享至少一个接驳点编号才能合并', progress: 100 });
                  return;
                }

                setMergeProgress(`识别到 ${commonJunctionIds.length} 个共同接驳点，正在合并管段…`);
                if (mergeToastId) update(mergeToastId, { message: `识别到 ${commonJunctionIds.length} 个共同接驳点，正在合并管段…`, progress: 30 });

                // 合并各项数据，避免ID冲突：为新工程生成全新ID
                const mergedSegments = [];
                const mergedComponents = [];
                const mergedFittings = [];
                const mergedManualFittings = [];

                // 记录已处理的接驳点，以避免重复插入
                const usedJunctionId = new Set();

                const genId = (prefix) => `${prefix}-${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

                // Align each project's coordinates to the anchor project's junctions (if possible)
                const anchorProj = selected[0] || {};
                // build anchor junction positions
                const anchorJunctionPos = new Map();
                for (const c of (anchorProj.components || [])) {
                  if (c && c.type === 'junction' && String(c.junctionId || '').trim() && typeof c.x === 'number' && typeof c.y === 'number') {
                    anchorJunctionPos.set(String(c.junctionId).trim(), { x: c.x, y: c.y });
                  }
                }

                for (const proj of selected) {
                  // compute translation (dx, dy) to align proj to anchor using matching junctions
                  let dx = 0;
                  let dy = 0;
                    if (proj.id !== anchorProj.id) {
                    const projJunctionPos = new Map();
                    for (const c of (proj.components || [])) {
                      if (c && c.type === 'junction' && String(c.junctionId || '').trim() && typeof c.x === 'number' && typeof c.y === 'number') {
                        projJunctionPos.set(String(c.junctionId).trim(), { x: c.x, y: c.y });
                      }
                    }
                    const matches = [];
                    for (const [jid, apos] of anchorJunctionPos.entries()) {
                      if (projJunctionPos.has(jid)) {
                        const ppos = projJunctionPos.get(jid);
                        matches.push({ dx: apos.x - ppos.x, dy: apos.y - ppos.y });
                      }
                    }
                    if (matches.length > 0) {
                      dx = matches.reduce((s, m) => s + m.dx, 0) / matches.length;
                      dy = matches.reduce((s, m) => s + m.dy, 0) / matches.length;
                      console.log('[LiveDock] aligning project', proj.id, { dx, dy, matched: matches.length });
                    } else {
                      console.log('[LiveDock] no matching junctions for project during alignment', proj.id);
                    }
                  }

                  const translatePoint = (p) => {
                    if (!p || typeof p !== 'object') return p;
                    const nx = (typeof p.x === 'number') ? (p.x + dx) : p.x;
                    const ny = (typeof p.y === 'number') ? (p.y + dy) : p.y;
                    return { ...p, x: nx, y: ny };
                  };
                  const translateSegment = (s) => ({ ...s, startPoint: translatePoint(s.startPoint), endPoint: translatePoint(s.endPoint) });
                  const translateComponent = (c) => ({ ...c, x: (typeof c.x === 'number' ? c.x + dx : c.x), y: (typeof c.y === 'number' ? c.y + dy : c.y) });
                  const translateFitting = (f) => ({ ...f, x: (typeof f.x === 'number' ? f.x + dx : f.x), y: (typeof f.y === 'number' ? f.y + dy : f.y) });

                  // 合并管段
                  for (const s of (proj.segments || [])) {
                    mergedSegments.push({ ...translateSegment(s), id: genId('seg') });
                  }
                  // 合并设备（接驳点按junctionId去重，优先保留首个）
                  for (const c of (proj.components || [])) {
                    if (c?.type === 'junction' && String(c.junctionId || '').trim()) {
                      const jid = String(c.junctionId).trim();
                      if (commonJunctionIds.includes(jid)) {
                        if (usedJunctionId.has(jid)) {
                          // 跳过重复接驳点
                          continue;
                        }
                        usedJunctionId.add(jid);
                      }
                    }
                    mergedComponents.push({ ...translateComponent(c), id: genId('comp') });
                  }
                  // 合并管件
                  for (const f of (proj.fittings || [])) {
                    mergedFittings.push({ ...translateFitting(f), id: genId('fit') });
                  }
                  // 合并手动支撑件
                  for (const mf of (proj.manualFittings || [])) {
                    mergedManualFittings.push({ ...translateFitting(mf), id: genId('mf') });
                  }
                }

                // 若合并后仍无任何元素（例如全部为空或被去重过滤），避免创建空白工程
                const totalMergedCount = (
                  mergedSegments.length +
                  mergedComponents.length +
                  mergedFittings.length +
                  mergedManualFittings.length
                );
                if (totalMergedCount === 0) {
                    setMergeProgress('未找到可合并的数据');
                    setMerging(false);
                    if (mergeToastId) update(mergeToastId, { type: 'error', title: '合并失败', message: '没有可合并的数据或被过滤', progress: 100 });
                    return;
                }
                if (mergeToastId) update(mergeToastId, { message: '创建新工程…', progress: 70 });

                setMergeProgress('创建新工程…');
                const ts = new Date();
                const name = `合并工程-${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}-${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}`;
                // Create new project pre-populated with merged data to avoid race/overwrite
                const base = selected[0] || {};
                const initialData = {
                    segments: mergedSegments,
                    components: mergedComponents,
                    fittings: mergedFittings,
                    manualFittings: mergedManualFittings,
                    designStartPoint: base.designStartPoint || { x: 200, y: 200 },
                    currentPoint: base.currentPoint || { x: 200, y: 200 },
                    canvasOffset: base.canvasOffset || { x: 0, y: 0 },
                    scale: typeof base.scale === 'number' ? base.scale : 1,
                    showLabels: !!base.showLabels,
                  // 兼容旧字段并为新结构提供独立视图偏移
                  labelOffsets: base.labelOffsetsSystem || base.labelOffsets || {},
                  labelOffsetsSystem: base.labelOffsetsSystem || base.labelOffsets || {},
                  labelOffsetsPlane: base.labelOffsetsPlane || {},
                    labelVisibility: base.labelVisibility || { galvanized: true, blockage: true, junction: true, union: true, designStart: true },
                    config: base.config || undefined
                };

                try {
                  console.log('[LiveDock] creating project with merged data', { counts: { mergedSegments: mergedSegments.length, mergedComponents: mergedComponents.length } });
                  // Validate merged data to avoid writing malformed entries that break rendering
                  const validateSegments = (arr) => (Array.isArray(arr) ? arr.filter(s => s && s.startPoint && s.endPoint && typeof s.startPoint.x === 'number' && typeof s.startPoint.y === 'number' && typeof s.endPoint.x === 'number' && typeof s.endPoint.y === 'number') : []);
                  const validateComponents = (arr) => (Array.isArray(arr) ? arr.filter(c => c && typeof c.type === 'string' && typeof c.x === 'number' && typeof c.y === 'number') : []);
                  const validSegments = validateSegments(mergedSegments);
                  const validComponents = validateComponents(mergedComponents);
                  const validFittings = (Array.isArray(mergedFittings) ? mergedFittings.filter(f => f && typeof f.type === 'string' && typeof f.x === 'number' && typeof f.y === 'number') : []);
                  const validManual = (Array.isArray(mergedManualFittings) ? mergedManualFittings.filter(m => m && m.id) : []);
                  const invalidCount = (mergedSegments.length - validSegments.length) + (mergedComponents.length - validComponents.length) + (mergedFittings.length - validFittings.length);
                  if (invalidCount > 0) {
                    console.warn('[LiveDock] filtered out invalid merged entries', { invalidCount });
                    if (mergeToastId) update(mergeToastId, { message: `已过滤 ${invalidCount} 条无效数据，写入并保存…`, progress: 80 });
                  } else {
                    if (mergeToastId) update(mergeToastId, { message: '写入数据并保存…', progress: 80 });
                  }
                  const newProj = createProject(name, { ...initialData, segments: validSegments, components: validComponents, fittings: validFittings, manualFittings: validManual });
                  // Ensure current project id and persist
                  setCurrentProjectId(newProj.id);
                  setMergeProgress('写入数据并保存…');
                  if (mergeToastId) update(mergeToastId, { message: '写入数据并保存…', progress: 85 });
                  // Small delay to allow context to settle, then persist current project
                  setTimeout(() => { try { saveCurrentProject(); } catch (e) { console.error('[LiveDock] saveCurrentProject after create failed', e); } }, 50);
                } catch (err) {
                  console.error('[LiveDock] error creating project with merged data', err);
                  setMerging(false);
                  setMergeProgress('');
                  if (mergeToastId) update(mergeToastId, { type: 'error', title: '合并失败', message: err?.message || '创建新工程时出现问题', progress: 100 });
                  return;
                }

                setMergeProgress('合并完成');
                setMerging(false);
                clearProjectSelection();
                if (mergeToastId) update(mergeToastId, { type: 'success', title: '合并完成', message: '新工程已添加到工程列表', progress: 100 });
                setShowDropdown(true);
                // 展开列表并滚动到底部以显示新工程（新工程追加在末尾）
                setTimeout(() => {
                    if (projectListRef.current) {
                        projectListRef.current.scrollTop = projectListRef.current.scrollHeight;
                    }
                }, 50);
            } catch (error) {
              console.error('[LiveDock] handleMergeProjects top-level error', error);
              setMerging(false);
              setMergeProgress('');
              if (mergeToastId) {
                update(mergeToastId, { type: 'error', title: '合并失败', message: error?.message || '执行过程中出现未知错误', progress: 100 });
              } else {
                // 兜底：若 toast 未初始化
                showProgressToast(error?.message || '执行过程中出现未知错误', 100, { title: '合并失败', type: 'error' });
              }
            }
        };

        return (
            <div id="gm-live-top-zone" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--live-zone-gap)' }}>
                {/* 顶部项目栏 */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--live-header-gap)', justifyContent: 'space-between' }}>
                  {/* 左侧：模式胶囊 + 项目名称 */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', overflow: 'visible', gap: 'var(--live-header-gap)' }}>
                    {/* 包裹式模式菜单容器（方案A）：按钮为底部区域，菜单向上展开，统一边框与背景 */}
                    <div id="gm-mode-capsule" style={{ position: 'relative', display: 'inline-flex' }}>
                      {(() => {
                        const capsuleHeight = isMobile ? 32 : 36;
                        const paddingX = isMobile ? '0 10px' : '0 12px';
                        // 简化模式：仅保留绘制和移动
                        const options = [
                          { key: 'draw', label: '绘制模式' },
                          { key: 'move', label: '移动模式' },
                        ];
                        // 根据视图模式限制可选项（平面：允许 移动）
                        const allowedKeys = viewMode === 'plane' ? ['move'] : options.map(o => o.key);
                        const visibleOptions = options.filter(opt => allowedKeys.includes(opt.key));
                        // 仅展示除当前模式外的其他模式
                        const filteredOptions = visibleOptions.filter(opt => opt.key !== uiMode);
                        const itemH = isMobile ? 36 : 38;
                        // 菜单项：仅显示可切换的其他模式
                        const menuItems = filteredOptions;
                        const menuH = menuItems.length * itemH;
                        return (
                          <div
                            ref={modeRef}
                            style={{                              borderRadius: 16,
                              border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.4)' : 'rgba(203,213,225,0.7)'}`,
                              background: prefersDark ? 'rgba(2, 6, 23, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                              overflow: 'hidden',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'flex-end',
                              width: 'fit-content',
                              height: showModeMenu ? (capsuleHeight + menuH) : capsuleHeight,
                              transition: 'height 0.22s ease'
                            }}
                          >
                            {/* 上方菜单区：展开时增加高度，收起高度为0 */}
                            <div style={{ height: showModeMenu ? menuH : 0, overflow: 'hidden', transition: 'height 0.22s ease' }}>
                              {menuItems.map((opt, idx) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => { setUiMode(opt.key); setShowModeMenu(false); }}
                                  style={{
                                    width: '100%',
                                    height: itemH,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0 10px',
                                    background: uiMode === opt.key
                                      ? (prefersDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.12)')
                                      : 'transparent',
                                    color: prefersDark ? '#e5e7eb' : '#0f172a',
                                    border: 'none',
                                    borderBottom: idx < menuItems.length - 1 ? `${prefersDark ? '1px solid rgba(71,85,105,0.25)' : '1px solid rgba(203,213,225,0.6)'}` : 'none',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center', display: 'block' }}>{opt.label}</span>
                                </button>
                              ))}
                            </div>
                            {/* 底部按钮区：作为触发器，位于统一容器底部 */}
                            <button
                              type="button"
                              aria-label="当前为模式选择，点击打开菜单"
                              onClick={() => setShowModeMenu(v => !v)}
                              style={{
                                height: capsuleHeight,
                                padding: paddingX,
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer'
                              }}
                              id="gm-btn-mode-trigger"
                              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                              <span style={{ fontSize: 12, fontWeight: 700, color: prefersDark ? '#e5e7eb' : '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '100%' }}>
                                {uiMode === 'draw' ? '绘制模式' : '移动模式'}
                              </span>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    <button type="button"
                      id="gm-btn-project-name"
                      aria-label="打开项目列表"
                      onClick={() => setShowDropdown(v => !v)}
                      style={{
                        height: isMobile ? 40 : 44,
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        color: prefersDark ? '#fff' : '#000',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        alignSelf: 'start'
                      }}
                    >{currentName}</button>
                  </div>
                  {/* 右侧：项目列表 + 新建（macOS 彩色圆点风格） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, alignSelf: 'start' }}>

                    {iconButton('新建工程', handleNewProject, (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span aria-hidden="true" style={{
                          width: isMobile ? 10 : 12,
                          height: isMobile ? 10 : 12,
                          borderRadius: 9999,
                          background: prefersDark ? 'linear-gradient(135deg, #34d399, #10b981)' : 'linear-gradient(135deg, #10b981, #34d399)',
                          boxShadow: prefersDark ? 'inset 0 0 0 1px rgba(255,255,255,0.15)' : 'inset 0 0 0 1px rgba(0,0,0,0.08)'
                        }} />
                      </div>
                    ), 'gm-btn-new-project')}
                  </div>

                  {/* 公告板（绝对定位）：填充胶囊右侧的空白矩形，仅展开时显示 */}
                  {(() => {
                    if (!showModeMenu) return null;
                    const capsuleW = (modeRef.current?.offsetWidth || 0);
                    const offset = capsuleW + (isMobile ? 8 : 12); // 左侧缩进：胶囊宽度 + 间距
                    const baseline = isMobile ? 40 : 44; // 顶部行常规高度（项目名/新建按钮）
                    const extra = Math.max(0, (modeRef.current?.offsetHeight || 0) - baseline); // 展开后增加的空间（menuH）
                    const top = baseline + 6; // 顶部位置固定（保持 6px 间距）
                    const borderColor = prefersDark ? 'rgba(71,85,105,0.35)' : 'rgba(226,232,240,0.8)';
                    const bgColor = prefersDark ? 'rgba(2,6,23,0.9)' : 'rgba(255,255,255,0.95)';
                    
                    const handleActivate = () => {
                      try {
                          show({
                            type: 'feedback',
                            title: '激活',
                            message: '输入激活码以解锁完整功能',
                            prompt: '请输入激活码',
                            defaultValue: '',
                            placeholder: 'FULL-ABC123',
                            manualClose: true,
                            onSubmit: async (value, id) => {
                            const trimmedValue = (value || '').trim().toUpperCase();
                            if (!trimmedValue) {
                              pushInfoToast('warning', '输入为空', '请输入有效的激活码');
                              return;
                            }
                            const res = await fetch("/activate", {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json"
                              },
                              body: JSON.stringify({ activationCode: trimmedValue })
                            });
                            const result = await res.json();
                            // 如果后端返回 editMode，则打开前端数据库编辑面板
                            if (res.ok && result.editMode) {
                              // 特殊激活码：打开数据库编辑面板
                              const items = (result.items || []).map(it => ({
                                rawKey: Array.isArray(it.key) ? it.key : [it.key],
                                key: Array.isArray(it.key) ? it.key.join('|') : String(it.key),
                                value: it.value
                              }));
                              setDbItems(items);
                              setEditModeOpen(true);
                              dismiss(id);
                              pushInfoToast('success', '数据库面板已打开', '您现在可以查看和编辑服务端数据');
                            } else if (res.ok && result.success) {
                              // 激活成功：后端返回 { kind, expiration }
                              const { kind, expiration } = result;
                              try {
                                const versionKey = (typeof kind === 'string' && kind) ? kind : 'full';
                                const expiryDateString = new Date(expiration).toISOString().split('T')[0];
                                activateVersion(versionKey, expiryDateString);
                                // 关闭激活对话框并显示成功提示
                                dismiss(id);
                                pushInfoToast('success', '激活成功', `${(cfgVersionFeatures[versionKey]?.name) || versionKey}已激活，有效期至 ${new Date(expiration).toLocaleDateString()}`);
                              } catch (e) {
                                pushInfoToast('error', '激活失败', '无法保存激活状态，请重试');
                              }
                            } else {
                              // 激活失败
                              pushInfoToast('error', '激活失败', result.message || '激活码已被使用、已过期或无效');
                            }
                          }
                        });
                      } catch (e) {
                        pushInfoToast('error', '错误', '无法打开激活对话框');
                      }
                    };
                    
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          top,
                          left: offset,
                          right: isMobile ? 8 : 12,
                          height: extra - 6,
                          borderRadius: 12,
                          border: `1px solid ${borderColor}`,
                          background: bgColor,
                          overflow: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          padding: '8px 12px',
                          gap: 6
                        }}
                      >
                        {/* 版本信息 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: prefersDark ? '#94a3b8' : '#64748b' }}>
                            版本:
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: prefersDark ? '#e5e7eb' : '#0f172a' }}>
                            {pkg?.version || 'unknown'}
                          </span>
                          {(() => {
                            const meta = cfgVersionFeatures?.meta || {};
                            const badge = (meta?.badgeColors?.[licenseVersion]) || (meta?.badgeColors?.trial) || { bg: (prefersDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.15)'), text: '#fbbf24' };
                            const name = (cfgVersionFeatures?.[licenseVersion]?.name) || (licenseVersion === 'trial' ? '体验版' : licenseVersion);
                            return (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={handleActivate}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleActivate();
                                  }
                                }}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: badge.bg,
                                  color: badge.text,
                                  cursor: 'pointer',
                                  userSelect: 'none'
                                }}
                                aria-label="激活版本"
                                title="点击激活"
                              >
                                {name}
                              </span>
                            );
                          })()}
                          {/* 订阅到期（仅在非试用版显示） */}
                          {licenseVersion !== 'trial' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                              <span style={{ fontSize: 10, color: prefersDark ? '#94a3b8' : '#64748b' }}>
                                订阅到期:
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: prefersDark ? '#e5e7eb' : '#0f172a' }}>
                                {subscriptionExpiry}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        {/* 功能标签（展示所有可配置项；已开启为徽章色，未开启为灰色） */}
                        {(() => {
                          // 映射与配色从配置中读取（便于只更新配置文件即可扩展版本/文案/颜色）
                          const meta = cfgVersionFeatures?.meta || {};
                          // Use localized labels from config and dedupe identical labels
                          const featureLabels = cfgVersionFeatures?.meta?.featureLabels || {};
                          // 构建所有特性的集合（取自配置中所有版本的并集）
                          const union = {};
                          Object.values(cfgVersionFeatures || {}).forEach(v => {
                            const feats = v.features || {};
                            Object.keys(feats).forEach(group => {
                              const sub = feats[group] || {};
                              Object.keys(sub).forEach(key => {
                                union[`${group}.${key}`] = { group, key };
                              });
                            });
                          });
                          const badge = (cfgVersionFeatures?.meta?.badgeColors?.[licenseVersion]) || (cfgVersionFeatures?.meta?.badgeColors?.trial) || { bg: (prefersDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.15)'), text: '#fbbf24' };
                          // label -> stats: collect all mapped underlying keys so we can compute partial enablement
                          const labelStats = {};
                          Object.keys(union).forEach(k => {
                            const { group, key } = union[k];
                            const cfgKey = `${group}.${key}`;
                            const cfgLabel = featureLabels[cfgKey] || cfgKey;
                            const enabled = !!(currentFeatures?.features?.[group] && currentFeatures.features[group][key]);
                            if (!labelStats[cfgLabel]) labelStats[cfgLabel] = { total: 0, enabledCount: 0, keys: [] };
                            labelStats[cfgLabel].total += 1;
                            if (enabled) labelStats[cfgLabel].enabledCount += 1;
                            labelStats[cfgLabel].keys.push(cfgKey);
                          });
                          const entries = Object.keys(labelStats).map(lbl => ({ label: lbl, ...labelStats[lbl] }));
                          return (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                              {entries.map((e, idx) => {
                                const pct = e.total > 0 ? (e.enabledCount / e.total) : 0;
                                const isFull = pct === 1;
                                const isNone = pct === 0;
                                // Create a gradient background for partial enablement
                                const grayBg = prefersDark ? '#374151' : '#e5e7eb';
                                const badgeBg = badge.bg || grayBg;
                                const bgStyle = isFull ? badgeBg : (isNone ? grayBg : `linear-gradient(90deg, ${badgeBg} ${Math.round(pct * 100)}%, ${grayBg} ${Math.round(pct * 100)}%)`);
                                const textColor = isNone ? (prefersDark ? '#cbd5e1' : '#6b7280') : (badge.text || (prefersDark ? '#fff' : '#000'));
                                const handleClick = (ev) => {
                                  try {
                                    const meta = cfgVersionFeatures?.meta || {};
                                    const descs = (e.keys || []).map(k => meta?.featureDescriptions?.[k] || featureLabels[k] || k);
                                    const message = descs.join('\n');
                                    pushInfoToast('info', e.label, message);
                                  } catch (err) { /* ignore */ }
                                };
                                return (
                                  <span key={`${e.label}-${idx}`} onClick={handleClick} title={Array.isArray(e.keys) ? e.keys.join(',') : ''} style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, background: bgStyle, color: textColor, cursor: 'pointer', userSelect: 'none' }}>{e.label}</span>
                                );
                              })}
                            </div>
                          );
                        })()}
                        
                        
                      </div>
                    );
                  })()}
                </div>

                {/* 下拉列表：带伸缩动画 */}
                <div style={{
                    overflow: 'hidden',
                    maxHeight: showDropdown ? (isMobile ? 260 : 280) : 0,
                    transition: 'max-height 0.28s ease',
                    marginTop: 6,
                    opacity: showDropdown ? 1 : 0.5
                }}>
                    <div style={{
                        borderRadius: 12,
                        border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.35)' : 'rgba(193,193,193,0.45)'}`,
                        background: prefersDark ? 'rgba(2,6,23,0.9)' : 'rgba(255,255,255,0.5)',
                        overflow: 'hidden',
                        transform: showDropdown ? 'scale(1)' : 'scale(0.98)',
                        transition: 'transform 0.28s ease, opacity 0.28s ease',
                        opacity: showDropdown ? 1 : 0.9
                    }}>
                        {(projects || []).length === 0 ? (
                            <div style={{ padding: 10, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>暂无工程，点击“新建工程”开始</div>
                        ) : (
                            <div ref={projectListRef} style={{ display: 'flex', flexDirection: 'column', maxHeight: isMobile ? 260 : 280, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                                {(projects || []).map(project => (
                                    <div key={project.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--live-body-gap)', padding: '7px 10px', borderBottom: `1px solid ${prefersDark ? 'rgba(71,85,105,0.25)' : 'rgba(255,255,255,0.3)'}` }}>
                                        {/* 选择复选框（圆形） */}
                                        {(() => {
                                            const checked = selectedProjectIds.includes(project.id);
                                            const isCurrent = currentProject?.name && project.id === (currentProject?.id);
                                            const size = 16;
                                            const borderColor = checked
                                                ? (prefersDark ? '#60a5fa' : '#3b82f6')
                                                : (isCurrent ? (prefersDark ? '#93c5fd' : '#60a5fa') : (prefersDark ? '#334155' : '#cbd5e1'));
                                            const fillColor = checked ? (prefersDark ? '#3b82f6' : '#3b82f6') : 'transparent';
                                            return (
                                                <button type="button"
                                                    onClick={() => toggleProjectSelection(project.id)}
                                                    aria-label={checked ? '取消选择工程' : '选择工程'}
                                                    aria-pressed={checked}
                                                    style={{
                                                        width: size,
                                                        height: size,
                                                        minWidth: size,
                                                        minHeight: size,
                                                        borderRadius: 9999,
                                                        border: `2px solid ${borderColor}`,
                                                        background: fillColor,
                                                        cursor: 'pointer'
                                                    }}
                                                />
                                            );
                                        })()}
                                        {/* 名称或内联编辑 */}
                                        {inlineEditingId === project.id ? (
                                            <input
                                                value={inlineName}
                                                onChange={(e) => setInlineName(e.target.value)}
                                                style={{ flex: 1, fontSize: 12, padding: '5px 8px', borderRadius: 8, border: `1px solid ${prefersDark ? '#334155' : '#e5e7eb'}`, background: prefersDark ? '#0f172a' : '#fff', color: prefersDark ? '#e2e8f0' : '#111827' }}
                                            />
                                        ) : (
                                            <button type="button" onClick={() => handleSelectProject(project.id)} style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', color: prefersDark ? '#e2e8f0' : '#111827', fontSize: 12, cursor: 'pointer' }}>
                                                {project.name}
                                            </button>
                                        )}

                                        {/* 操作按钮 */}
                                        {inlineEditingId === project.id ? (
                                            <>
                                                <button type="button" onClick={(e) => confirmInlineRename(e, project.id)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #d1fae5', background: '#ecfdf5', color: '#10b981', cursor: 'pointer', fontSize: 12 }}>保存</button>
                                                <button type="button" onClick={cancelInlineEdit} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>取消</button>
                                            </>
                                        ) : (
                                            <>
                                                <button type="button" onClick={(e) => handleRenameProject(e, project)} style={actionBtnStyle()}>{'更名'}</button>
                                                <button type="button" onClick={(e) => handleDeleteProject(e, project.id)} style={actionBtnStyle()}>{'删除'}</button>
                                                {/* 工程导出按钮已移至数据统计面板 (导出工程) */}
                                            </>
                                        )}
                                    </div>
                                ))}

                                {/* 合并与导入 - 将按钮放在一起靠右显示（仅在任一按钮可用时渲染容器） */}
                                {(currentFeatures.features.project.merge || currentFeatures.features.project.import) && (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--live-header-gap)', padding: '7px 10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--live-header-gap)' }}>
                                      {/* 根据版本配置显示合并按钮 */}
                                      {currentFeatures.features.project.merge && (
                                        <button type="button"
                                          id="gm-btn-merge-projects"
                                          onClick={handleMergeProjects}
                                          disabled={!canMerge || merging}
                                          style={actionBtnStyle(!canMerge || merging)}
                                        >合并</button>
                                      )}
                                      {/* removed duplicate export-mode & export-design buttons from project-list area */}
                                      {currentFeatures.features.project.import && (
                                        <button type="button" id="gm-btn-import-project" onClick={handleImportClick} style={actionBtnStyle()}>导入</button>
                                      )}
                                      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json,application/json" style={{ display: 'none' }} />
                                    </div>
                                  </div>
                                )}

                                {/* 全局 Toast 由 ToastViewport 渲染，不再在此处内联 */}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const CenterZone = (props = {}) => {
      const mergedProps = { ...(centerProps || {}), ...(props || {}) };
      const {
        scale,
        onReset,
        onCenter,
        lengths,
        fittings,
        devices,
        onToggleLabels,
        onExportStatistics,
        onExportProject,
        onExportDrawing,
        drawingExportReady,
        onShowDrawingPreview
      } = mergedProps || {};
      
      // Add toast functionality for export operations
      const { show: showExportToast, update: updateExportToast, dismiss: dismissExportToast } = useToast();

        // 统计面板（Bento 网格）不再使用进度条百分比，故移除 max* 计算

        // showDataPanel may be provided by parent LiveDock (lifted state); fall back to local state if not provided
        const [localShowDataPanel, setLocalShowDataPanel] = useState(false);
        const showDataPanel = (mergedProps && typeof mergedProps.showDataPanel !== 'undefined') ? mergedProps.showDataPanel : localShowDataPanel;
        const setShowDataPanel = (mergedProps && mergedProps.setShowDataPanel) ? mergedProps.setShowDataPanel : setLocalShowDataPanel;

        // 顶部导出工具条的点击处理（如果传入则使用）
        // (onExportDrawing now comes from mergedProps)

        // 设备朝向权限由 CompassButton 内部管理

        const iconButton = (ariaLabel, onClick, children, id) => (
            <button type="button"
                id={id}
                aria-label={ariaLabel}
                onClick={onClick}
                style={{
                    width: isMobile ? 40 : 44,
                    height: isMobile ? 40 : 44,
                    borderRadius: 9999,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    transition: 'background 0.2s ease, transform 0.12s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = prefersDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {children}
                </span>
            </button>
        );

        // 撤销 / 重做 能力（移至侧栏中部，位于“标注”左侧）
        const { undoLast, redoLast, history, redoHistory, logOperation, showLabels, setShowLabels, saveCurrentProject, labelVisibility, setLabelVisibility, currentProject } = useProject();

        const canUndo = (history?.length || 0) > 0;
        const canRedo = (redoHistory?.length || 0) > 0;
        const handleUndo = () => {
          if (!canUndo) return;
          const prevLen = history.length;
          undoLast();
          try { logOperation && logOperation('undo', { prevHistoryLength: prevLen }); } catch (err) { console.warn('[LiveDock] 撤销操作日志记录失败', err); }
        };
        const handleRedo = () => {
          if (!canRedo) return;
          const prevLen = redoHistory.length;
          redoLast();
          try { logOperation && logOperation('redo', { prevRedoLength: prevLen }); } catch (err) { console.warn('[LiveDock] 重做操作日志记录失败', err); }
        };

        // 指南针按钮由 CompassButton 内部管理状态与权限

        const handleExportDesignFromCenter = async (e) => {
          e && e.stopPropagation && e.stopPropagation();
          const capture = mergedProps?.onCaptureView || mergedProps?.onCaptureView;
          if (!capture) {
            alert('导出设计功能不可用');
            return;
          }
          
          // Reset export ready state
          setDesignExportReady(false);
          setShowDesignPreview(false);
          
          // Show progress toast with disabled Preview button and close button
          const progressToastId = showExportToast({
            type: 'info',
            title: '导出设计',
            message: '正在生成图纸，请稍候...',
            progress: 0,
            sticky: true,
            manualClose: true, // Add close button
            actions: [
              {
                label: '预览',
                style: 'button',
                disabled: true,
                onClick: () => {
                  // This will be enabled later when export is ready
                }
              }
            ]
          });
          
          try {
            const title = currentProject?.name || '未命名工程';
            
            // Update progress: capturing plane view
            updateExportToast(progressToastId, { progress: 20, message: '正在捕获平面图...' });
            
            const planeBlob = await capture('plane', '——平面图');
            
            // Update progress: capturing system view
            updateExportToast(progressToastId, { progress: 50, message: '正在捕获系统图...' });
            
            const systemBlob = await capture('system', '——系统图');
            
            // validate blobs are images
            const badBlob = (b) => (!b || !b.type || typeof b.type !== 'string' || !b.type.startsWith('image'));
            if (badBlob(planeBlob) || badBlob(systemBlob)) {
              console.error('[LiveDock] captureView returned non-image blob', { planeBlob, systemBlob });
              dismissExportToast(progressToastId);
              setDesignExportReady(false);
              alert('导出失败：无法获取图像数据（capture 返回的内容不是图片）');
              return;
            }
            
            // Update progress: generating document
            updateExportToast(progressToastId, { progress: 70, message: '正在生成导出文档...' });
            
            const isTrial = (licenseVersion === 'trial');
            const canvas = await exportDesign({ planeBlob, systemBlob, lengths: mergedProps?.lengths, fittings: mergedProps?.fittings, devices: mergedProps?.devices, projectName: title, dpi: 300, orientation: 'landscape', preview: true, addWatermark: isTrial });
            
            if (canvas && canvas instanceof HTMLCanvasElement) {
              setDesignPreviewCanvas(canvas);
              setDesignExportReady(true);
              
              // Update toast with enabled Preview button
              updateExportToast(progressToastId, {
                progress: 100,
                message: '设计图已准备就绪',
                actions: [
                  {
                    label: '预览',
                    style: 'button',
                    disabled: false,
                    onClick: () => {
                      setShowDesignPreview(true);
                    }
                  }
                ]
              });
            } else {
              await exportDesign({ planeBlob, systemBlob, lengths: mergedProps?.lengths, fittings: mergedProps?.fittings, devices: mergedProps?.devices, projectName: title, dpi: 300, orientation: 'landscape' });
              dismissExportToast(progressToastId);
            }
          } catch (err) {
            console.error('[LiveDock] handleExportDesignFromCenter failed', err);
            dismissExportToast(progressToastId);
            setDesignExportReady(false);
            showExportToast({
              type: 'error',
              title: '导出失败',
              message: '设计图导出过程中出现错误',
              duration: 3000
            });
          }
        };

    return (
      <div id="gm-live-center-zone" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--live-zone-gap)', minWidth: isMobile ? 280 : 320 }}>
        {/* 顶部工具行：统一容器 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--live-header-gap)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            paddingBottom: 6
          }}
        >
          <CompassButton isMobile={isMobile} prefersDark={prefersDark} />
          {iconButton(`当前缩放 ${Math.round((scale || 1) * 100)}%，点击重置`, onReset, (
            <div style={{ width: 40, height: 40, borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: prefersDark ? '#fff' : '#000' }}>{Math.round((scale || 1) * 100)}%</span>
            </div>
          ), 'gm-btn-reset-zoom')}
          {iconButton('居中', onCenter, (
            <div style={{ padding: '0 10px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: prefersDark ? '#fff' : '#000' }}>居中</span>
            </div>
          ), 'gm-btn-center')}
          <div style={{ width: isMobile ? 8 : 12 }} />
          <button type="button"
            id="gm-btn-undo"
            aria-label="撤销"
            onClick={handleUndo}
            disabled={!canUndo}
            style={{
              width: isMobile ? 40 : 44,
              height: isMobile ? 40 : 44,
              borderRadius: 9999,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              background: 'transparent', border: 'none',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              opacity: canUndo ? 1 : 0.5,
              transition: 'background 0.2s ease, transform 0.12s ease'
            }}
            onMouseEnter={(e) => { if (canUndo) e.currentTarget.style.background = prefersDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onMouseDown={(e) => { if (canUndo) e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 700, color: prefersDark ? '#fff' : '#000' }}>撤销</span>
          </button>
          <button type="button"
            id="gm-btn-redo"
            aria-label="重做"
            onClick={handleRedo}
            disabled={!canRedo}
            style={{
              width: isMobile ? 40 : 44,
              height: isMobile ? 40 : 44,
              borderRadius: 9999,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              background: 'transparent', border: 'none',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              opacity: canRedo ? 1 : 0.5,
              transition: 'background 0.2s ease, transform 0.12s ease',
              marginLeft: 6
            }}
            onMouseEnter={(e) => { if (canRedo) e.currentTarget.style.background = prefersDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onMouseDown={(e) => { if (canRedo) e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 700, color: prefersDark ? '#fff' : '#000' }}>重做</span>
          </button>
          {canSwitchView && iconButton(viewMode === 'plane' ? '切换为系统' : '切换为平面', () => {
            // Guard: do not switch view if feature disabled by version config (extra safety)
            try {
              if (!canSwitchView) return;
            } catch (e) { return; }
            setViewMode(prev => {
              const next = prev === 'system' ? 'plane' : 'system';
              if (next === 'plane') {
                // 切换到平面模式：若当前不在“插入/移动/删除”，则强制切到“插入”
                try {
                  if (!(uiMode === 'insert' || uiMode === 'move' || uiMode === 'delete')) {
                    setUiMode('insert');
                  }
                } catch (e) { /* ignore */ }
              }
              return next;
            });
          }, (
            <div style={{ padding: '0 10px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: prefersDark ? '#fff' : '#000' }}>{viewMode === 'system' ? '系统' : '平面'}</span>
            </div>
          ), 'gm-btn-toggle-viewmode')}
          {iconButton('标注开关', () => {
            // Toggle global label visibility from context (avoid mixing prop/context sources)
            try {
              setShowLabels(prev => !prev);
              // persist immediately
              saveCurrentProject && saveCurrentProject();
            } catch (err) { /* ignore */ }
            // NOTE: do NOT auto-open the data panel when toggling labels.
          }, (
            <div style={{ padding: '0 10px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: prefersDark ? '#fff' : '#000' }}>标注</span>
            </div>
          ), 'gm-btn-toggle-labels')}
          {/* 根据版本配置显示导出管理按钮 */}
          {(currentFeatures.features.export.project || 
            currentFeatures.features.export.statistics || 
            currentFeatures.features.export.design || 
            currentFeatures.features.export.drawing) && 
            iconButton('导出管理', () => setShowDataPanel(v => !v), (
              <div style={{ padding: '0 10px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: prefersDark ? '#fff' : '#000' }}>导出</span>
              </div>
            ), 'gm-btn-data-panel')
          }
        </div>
        {/* 快捷：当全局 showLabels 打开时，在工具栏下方显示复选框（不再置于统计面板内） */}
        {showLabels && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', padding: '2px 0', gap: 6, flexWrap: 'wrap' }}>
            <CheckboxPill
              id="gm-pill-galvanized"
              prefersDark={prefersDark}
              checked={!!labelVisibility?.galvanized}
              onChange={(v) => { setLabelVisibility(prev => ({ ...(prev || {}), galvanized: !!v })); saveCurrentProject && saveCurrentProject(); }}
              ariaLabel="切换镀锌管件可见性"
            >
              镀锌管件
            </CheckboxPill>
            <CheckboxPill
              id="gm-pill-union"
              prefersDark={prefersDark}
              checked={!!labelVisibility?.union}
              onChange={(v) => { setLabelVisibility(prev => ({ ...(prev || {}), union: !!v })); saveCurrentProject && saveCurrentProject(); }}
              ariaLabel="切换活接可见性"
            >
              活接
            </CheckboxPill>
            <CheckboxPill
              id="gm-pill-blockage"
              prefersDark={prefersDark}
              checked={!!labelVisibility?.blockage}
              onChange={(v) => { setLabelVisibility(prev => ({ ...(prev || {}), blockage: !!v })); saveCurrentProject && saveCurrentProject(); }}
              ariaLabel="切换封堵可见性"
            >
              封堵
            </CheckboxPill>
            <CheckboxPill
              id="gm-pill-junction"
              prefersDark={prefersDark}
              checked={!!labelVisibility?.junction}
              onChange={(v) => { setLabelVisibility(prev => ({ ...(prev || {}), junction: !!v })); saveCurrentProject && saveCurrentProject(); }}
              ariaLabel="切换接驳点可见性"
            >
              接驳点
            </CheckboxPill>
            <CheckboxPill
              id="gm-pill-design-start"
              prefersDark={prefersDark}
              checked={!!labelVisibility?.designStart}
              onChange={(v) => { setLabelVisibility(prev => ({ ...(prev || {}), designStart: !!v })); saveCurrentProject && saveCurrentProject(); }}
              ariaLabel="切换设计起点可见性"
            >
              设计起点
            </CheckboxPill>
          </div>
        )}

        {/* 数据面板：平滑展开 */}
        <div
          onClick={(e) => { e && e.stopPropagation && e.stopPropagation(); }}
          onMouseDown={(e) => { e && e.stopPropagation && e.stopPropagation(); }}
          onMouseUp={(e) => { e && e.stopPropagation && e.stopPropagation(); }}
          onPointerDown={(e) => { e && e.stopPropagation && e.stopPropagation(); }}
          onPointerUp={(e) => { e && e.stopPropagation && e.stopPropagation(); }}
          onTouchStart={(e) => { e && e.stopPropagation && e.stopPropagation(); }}
          onTouchEnd={(e) => { e && e.stopPropagation && e.stopPropagation(); }}
          style={{
            overflow: 'hidden',
            maxHeight: showDataPanel ? (isMobile ? 320 : 340) : 0,
            transition: 'max-height 0.32s ease',
            marginTop: 0
          }}
        >
          <div style={{ maxHeight: isMobile ? 320 : 340, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 10px', position: 'sticky', top: 0, backdropFilter: 'blur(3px)', zIndex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* 根据版本配置显示导出按钮 */}
                {currentFeatures.features.export.project && onExportProject && (
                  <button type="button" id="gm-btn-export-project" onClick={onExportProject} aria-label="导出工程" style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${prefersDark ? '#334155' : '#e5e7eb'}`, background: prefersDark ? '#0f172a' : '#ffffff', color: prefersDark ? '#e2e8f0' : '#111827', cursor: 'pointer', fontSize: 12 }}>导出工程</button>
                )}

                {currentFeatures.features.export.statistics && onExportStatistics && (
                  <button type="button" id="gm-btn-export-statistics" onClick={onExportStatistics} aria-label="导出统计数据" style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${prefersDark ? '#334155' : '#e5e7eb'}`, background: prefersDark ? '#0f172a' : '#ffffff', color: prefersDark ? '#e2e8f0' : '#111827', cursor: 'pointer', fontSize: 12 }}>导出统计</button>
                )}

                {/* export mode selector removed */}

                {/* 导出设计 */}
                {currentFeatures.features.export.design && (
                  <button type="button" id="gm-btn-export-design" onClick={handleExportDesignFromCenter} aria-label="导出设计" style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${prefersDark ? '#334155' : '#e5e7eb'}`, background: prefersDark ? '#0f172a' : '#ffffff', color: prefersDark ? '#e2e8f0' : '#111827', cursor: 'pointer', fontSize: 12 }}>导出设计</button>
                )}

                {currentFeatures.features.export.drawing && onExportDrawing && (
                  <button type="button" id="gm-btn-export-drawing" onClick={onExportDrawing} aria-label="导出图纸" style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${prefersDark ? '#334155' : '#e5e7eb'}`, background: prefersDark ? '#0f172a' : '#ffffff', color: prefersDark ? '#e2e8f0' : '#111827', cursor: 'pointer', fontSize: 12 }}>导出图纸</button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--live-body-gap)', padding: '8px 10px' }}>
              {/* 管材长度统计 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>管材长度统计</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>
                  总计: {Object.values(lengths || {}).reduce((sum, len) => sum + (typeof len === 'number' ? len : 0), 0).toFixed(2)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {(Object.entries(lengths || {})).map(([label, len]) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 10px', borderRadius: 10,
                      border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.35)' : 'rgba(226,232,240,0.8)'}`,
                      background: prefersDark ? 'rgba(30,41,59,0.35)' : 'rgba(255,255,255,0.95)',
                      color: prefersDark ? '#e5e7eb' : '#111827'
                    }}
                  >
                    <div style={{ fontSize: 11, color: prefersDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 6 }} title={label}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{len?.toFixed ? len.toFixed(2) : len}</div>
                  </div>
                ))}
              </div>
              {/* 管件数量统计 */}
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>管件数量统计</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {(Object.entries(fittings || {})).map(([label, count]) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 10px', borderRadius: 10,
                      border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.35)' : 'rgba(226,232,240,0.8)'}`,
                      background: prefersDark ? 'rgba(30,41,59,0.35)' : 'rgba(255,255,255,0.95)',
                      color: prefersDark ? '#e5e7eb' : '#111827'
                    }}
                  >
                    <div style={{ fontSize: 11, color: prefersDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 6 }} title={label}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{count}</div>
                  </div>
                ))}
              </div>
              {/* 设备统计 */}
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>设备数量统计</div>
              {(Object.entries(devices || {})).length === 0 ? (
                <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', padding: '6px 0' }}>暂无设备数据</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                  {Object.entries(devices || {}).map(([label, count]) => (
                    <div
                      key={label}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 10px', borderRadius: 10,
                        border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.35)' : 'rgba(226,232,240,0.8)'}`,
                        background: prefersDark ? 'rgba(30,41,59,0.35)' : 'rgba(255,255,255,0.95)',
                        color: prefersDark ? '#e5e7eb' : '#111827'
                      }}
                    >
                      <div style={{ fontSize: 11, color: prefersDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 6 }} title={label}>{label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{count}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* 导出操作移至顶部 */}
            </div>
          </div>
          {/* 注：标注复选框已移动至上方工具栏处 */}
        </div>
      </div>
    );
  };

  return (
    <div id="gm-live-dock" style={containerStyle} aria-label="LiveDock 复合区域" role="region">
      {/* Click-overlay: when data panel is open, clicking outside should close it */}
      {showDataPanel && (
        <div
          aria-hidden="true"
          onClick={() => setShowDataPanel(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'transparent' }}
        />
      )}
      <div id="gm-live-shell" style={shellStyle} ref={shellRef}>
        {showTop && isTopZoneOpen ? (<TopZone {...(topProps || {})} />) : null}
        {showCenter && isCenterZoneOpen ? (<CenterZone {...(centerProps || {})} showDataPanel={showDataPanel} setShowDataPanel={setShowDataPanel} onExportProject={handleExportProject} />) : null}
        {/* 设备插入区域：位于 CenterZone 和 BottomZone 之间 */}
        {showBottom && isCenterZoneOpen ? (<InsertDeviceZone viewMode={viewMode} />) : null}
        {showBottom ? (
          <div
            id="gm-live-bottom-wrapper"
            ref={bottomWrapperRef}
            style={{
              position: 'relative',
              overflow: 'hidden',
              marginTop: 12,
              marginBottom: 24,
              maxHeight: (isBottomZoneOpen ? bottomContentMaxHeight : 0),
              transition: 'max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease, transform 0.22s ease',
              opacity: isBottomZoneOpen ? 1 : 0.4,
              transform: isBottomZoneOpen ? 'translateY(0)' : 'translateY(-6px)',
              willChange: 'max-height, opacity, transform',
              pointerEvents: isBottomZoneOpen ? 'auto' : 'none'
            }}
          >
            {/* 内部滚动容器：当内容超过阈值时在此处滚动 */}
            <div style={{ maxHeight: (isBottomZoneOpen ? bottomContentMaxHeight : 0), overflowY: 'auto', overscrollBehavior: 'contain' }}>
              <BottomZone embedded {...(bottomProps || {})} viewMode={viewMode} onOpenSupportDialog={openSupportDialog} isSupportDialogOpen={!!dialogOpen} />
              {dialogOpen && (
                <>
                  {/* 局部遮罩，限制在 Bottom 包裹内 */}
                  <div
                    aria-hidden="true"
                    onClick={() => setDialogOpen(null)}
                    style={{ position: 'absolute', inset: 0, background: prefersDark ? 'rgba(2,6,23,0.45)' : 'rgba(15,23,42,0.30)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 10 }}
                  />
                  {/* Bento 风格卡片（常规流元素，参与高度测量） */}
                  <div style={{ position: 'relative', zIndex: 20, background: prefersDark ? 'linear-gradient(180deg, rgba(2,6,23,0.92), rgba(17,24,39,0.92))' : 'linear-gradient(180deg, #ffffff, #f9fafb)', borderRadius: 18, padding: isMobile ? 16 : 20, width: '100%', maxWidth: 480, margin: '12px auto 0', border: `1px solid ${prefersDark ? 'rgba(148,163,184,0.25)' : 'rgba(203,213,225,0.65)'}`, boxShadow: prefersDark ? '0 16px 40px rgba(2,6,23,0.6), 0 2px 6px rgba(2,6,23,0.4)' : '0 16px 40px rgba(148,163,184,0.35), 0 2px 6px rgba(148,163,184,0.25)' }}>
                  <h3 style={{ margin: 0, marginBottom: 12, color: prefersDark ? '#f3f4f6' : '#0f172a', fontSize: isMobile ? 16 : 18, fontWeight: 700 }}>添加支撑</h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 8, marginBottom: 16 }}>
                    {dialogOpen === 'bracket' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ color: prefersDark ? '#cbd5e1' : '#374151', fontSize: 12, fontWeight: 600 }}>类型：</label>
                        <select
                          value={dialogBracketType}
                          onChange={(e) => {
                            const t = e.target.value;
                            setDialogBracketType(t);
                            const firstSpec = (BRACKET_SPEC_OPTIONS[t] || [])[0] || '';
                            setDialogSpec(firstSpec);
                            setDialogHeight(t === '立柱' ? (dialogHeight || '2.0') : '');
                          }}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${prefersDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(203, 213, 225, 0.8)'}`, background: prefersDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(255, 255, 255, 0.96)', color: prefersDark ? '#e5e7eb' : '#111827', fontSize: 13 }}
                        >
                          {BRACKET_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
                        </select>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ color: prefersDark ? '#cbd5e1' : '#374151', fontSize: 12, fontWeight: 600 }}>规格：</label>
                      <select
                        value={dialogSpec}
                        onChange={(e) => setDialogSpec(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${prefersDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(203, 213, 225, 0.8)'}`, background: prefersDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(255, 255, 255, 0.96)', color: prefersDark ? '#e5e7eb' : '#111827', fontSize: 13 }}
                      >
                        {(BRACKET_SPEC_OPTIONS[dialogBracketType] || []).map(spec => (
                          <option key={spec} value={spec}>{spec}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ color: prefersDark ? '#cbd5e1' : '#374151', fontSize: 12, fontWeight: 600 }}>数量：</label>
                      <input
                        type="number"
                        min="1"
                        value={dialogQuantity}
                        onChange={(e) => setDialogQuantity(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${prefersDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(203, 213, 225, 0.8)'}`, background: prefersDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(255, 255, 255, 0.96)', color: prefersDark ? '#e5e7eb' : '#111827', fontSize: 13 }}
                      />
                    </div>

                    {dialogBracketType === '立柱' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ color: prefersDark ? '#cbd5e1' : '#374151', fontSize: 12, fontWeight: 600 }}>高度（米）：</label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          placeholder="例如 2.0"
                          value={dialogHeight}
                          onChange={(e) => setDialogHeight(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${prefersDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(203, 213, 225, 0.8)'}`, background: prefersDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(255, 255, 255, 0.96)', color: prefersDark ? '#e5e7eb' : '#111827', fontSize: 13 }}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${prefersDark ? 'rgba(148,163,184,0.25)' : 'rgba(203,213,225,0.6)'}` }}>
                    <button type="button" onClick={() => setDialogOpen(null)} style={{ padding: '10px 16px', borderRadius: 9999, border: `1px solid ${prefersDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(203, 213, 225, 0.8)'}`, background: 'transparent', color: prefersDark ? '#cbd5e1' : '#374151', fontSize: 14, cursor: 'pointer' }}>取消</button>
                    <button type="button"
                      onClick={() => {
                        const quantity = Math.max(1, parseInt(dialogQuantity) || 1);
                        const newItem = {
                          id: Date.now().toString(),
                          type: 'bracket',
                          spec: dialogSpec,
                          height: dialogBracketType === '立柱' ? Math.max(0.1, parseFloat(dialogHeight) || 2.0) : undefined,
                          subType: dialogOpen === 'bracket' ? dialogBracketType : undefined,
                          quantity,
                          segmentId: selectedSegment?.id || null,
                          pipeSpec: selectedSegment?.diameter || '15'
                        };
                        addManualFitting(newItem);
                        setDialogOpen(null);
                      }}
                      style={{ padding: '10px 16px', borderRadius: 9999, border: 'none', background: prefersDark ? 'linear-gradient(90deg,#3b82f6,#2563eb)' : 'linear-gradient(90deg,#2563eb,#3b82f6)', color: '#ffffff', fontSize: 14, cursor: 'pointer', boxShadow: prefersDark ? '0 6px 14px rgba(37,99,235,0.35)' : '0 6px 14px rgba(37,99,235,0.3)' }}
                    >添加</button>
                  </div>
                </div>
              </>
            )}
            </div>
          </div>
        ) : null}
      </div>
      {/* Toast 视图：锚定在 LiveDock 外壳顶部的上方，零间距融合 */}
      {/* 编辑模式：全屏数据库面板 */}
      {editModeOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000000, background: prefersDark ? 'rgba(2,6,23,0.9)' : 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box' }}>
            <div style={{ position: 'absolute', top: isMobile ? 12 : 18, right: isMobile ? 12 : 18, zIndex: 10000010 }}>
              <button type="button" onClick={() => { setEditModeOpen(false); setDbSelectedKeys(new Set()); }} aria-label="关闭数据库面板" title="关闭" style={{ width: 12, height: 12, padding: 0, borderRadius: 9999, border: 'none', background: '#ef4444', cursor: 'pointer' }} />
            </div>

            <div style={{ height: '100%', background: prefersDark ? 'rgba(4,6,15,0.96)' : '#f8fafc', overflow: 'hidden', boxShadow: prefersDark ? '0 20px 40px rgba(2,6,23,0.7)' : '0 12px 30px rgba(2,6,23,0.12)', color: prefersDark ? '#e6eef8' : '#0f172a' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '10px 12px' : '12px 16px', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.08)' : '#e6eef8'}` }}>
                <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: prefersDark ? '#e6eef8' : '#0f172a' }}>数据库面板</div>
                {/* header action area intentionally left empty on mobile; actions moved to bottom pill bar */}
                <div style={{ display: 'flex', gap: 8 }} />
              </div>

              <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0, tableLayout: 'fixed' }}>
                  <thead style={{ position: 'sticky', top: 0, background: prefersDark ? 'rgba(6,10,22,0.96)' : '#f1f5f9', zIndex: 2 }}>
                    <tr>
                      <th style={{ padding: isMobile ? 8 : 12, textAlign: 'center', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.08)' : '#e6eef8'}`, width: '20px', color: prefersDark ? '#bfe1ff' : '#0f172a', fontWeight: 700 }}>
                        <input 
                          type="checkbox" 
                          style={{ accentColor: prefersDark ? '#60a5fa' : '#2563eb' }} 
                          checked={dbItems.length > 0 && dbSelectedKeys.size === dbItems.length}
                          onChange={() => {
                            if (dbSelectedKeys.size === dbItems.length) {
                              setDbSelectedKeys(new Set());
                            } else {
                              setDbSelectedKeys(new Set(dbItems.map(it => String(it.key || ''))));
                            }
                          }}
                        />
                      </th>
                      <th style={{ padding: isMobile ? 8 : 12, textAlign: 'center', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.08)' : '#e6eef8'}`, width: '80px', fontSize: isMobile ? 13 : 14, whiteSpace: 'nowrap', color: prefersDark ? '#bfe1ff' : '#0f172a', fontWeight: 700 }}>激活码</th>
                      <th style={{ padding: isMobile ? 8 : 12, textAlign: 'center', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.08)' : '#e6eef8'}`, width: '40px', fontSize: isMobile ? 13 : 14, whiteSpace: 'nowrap', color: prefersDark ? '#bfe1ff' : '#0f172a', fontWeight: 700 }}>种类</th>
                      <th style={{ padding: isMobile ? 8 : 12, textAlign: 'center', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.08)' : '#e6eef8'}`, width: '80px', fontSize: isMobile ? 13 : 14, whiteSpace: 'nowrap', color: prefersDark ? '#bfe1ff' : '#0f172a', fontWeight: 700 }}>订阅到期</th>
                      <th style={{ padding: isMobile ? 8 : 12, textAlign: 'center', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.08)' : '#e6eef8'}`, width: '80px', fontSize: isMobile ? 13 : 14, whiteSpace: 'nowrap', color: prefersDark ? '#bfe1ff' : '#0f172a', fontWeight: 700 }}>激活码到期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbItems.map((it) => {
                      const v = it.value || {};
                      const k = String(it.key || '');
                      const selected = dbSelectedKeys.has(k);
                      return (
                        <tr key={k} style={{ background: selected ? (prefersDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.12)') : 'transparent' }}>
                          <td style={{ padding: isMobile ? 8 : 10, textAlign: 'center', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.06)' : '#eef2ff'}` }}>
                            <input type="checkbox" style={{ accentColor: prefersDark ? '#60a5fa' : '#2563eb' }} checked={selected} onChange={() => {
                              setDbSelectedKeys(prev => {
                                const s = new Set(prev);
                                if (s.has(k)) s.delete(k); else s.add(k);
                                return s;
                              });
                            }} />
                          </td>
                          <td style={{ padding: isMobile ? 8 : 10, textAlign: 'center', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.06)' : '#eef2ff'}`, fontSize: isMobile ? 12 : 13, whiteSpace: 'nowrap', fontFamily: 'monospace', color: prefersDark ? '#60a5fa' : '#2563eb' }}>{k}</td>
                          <td style={{ padding: isMobile ? 8 : 10, textAlign: 'center', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.06)' : '#eef2ff'}`, fontSize: isMobile ? 13 : 14, whiteSpace: 'nowrap', color: prefersDark ? '#e6eef8' : '#0f172a' }}>{v && v.kind}</td>
                          <td style={{ padding: isMobile ? 8 : 10, textAlign: 'center', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.06)' : '#eef2ff'}`, fontSize: isMobile ? 12 : 13, whiteSpace: 'nowrap', color: prefersDark ? '#cbd5e1' : '#475569' }}>{v ? formatDate(v.expiration) : ''}</td>
                          <td style={{ padding: isMobile ? 8 : 10, textAlign: 'center', borderBottom: `1px solid ${prefersDark ? 'rgba(148,163,184,0.06)' : '#eef2ff'}`, fontSize: isMobile ? 12 : 13, whiteSpace: 'nowrap', color: prefersDark ? '#cbd5e1' : '#475569' }}>{v ? formatDate(v.codeExp) : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 新增按钮/对话框 - 多态元素 */}
              <div style={{ 
                position: 'absolute', 
                right: isMobile ? 178 : 204,
                bottom: isMobile ? 18 : 24, 
                transformOrigin: 'right center',
                zIndex: 10000030,
                width: '200px',
                padding: showAddDialog ? '16px' : (isMobile ? '10px 18px' : '12px 20px'),
                borderRadius: 24,
                border: showAddDialog ? `1px solid ${prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(226,232,240,0.8)'}` : 'none',
                background: showAddDialog 
                  ? (prefersDark ? 'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98))' : 'linear-gradient(180deg, #ffffff, #f8fafc)')
                  : (prefersDark ? '#065f46' : '#10b981'),
                color: '#fff',
                cursor: showAddDialog ? 'default' : 'pointer',
                fontWeight: 700,
                boxShadow: showAddDialog 
                  ? (prefersDark ? '0 20px 50px rgba(0,0,0,0.7), 0 0 1px rgba(148,163,184,0.2)' : '0 12px 30px rgba(0,0,0,0.1), 0 0 1px rgba(203,213,225,0.6)')
                  : 'none',
                transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                overflow: 'hidden',
                pointerEvents: 'auto'
              }}>
                {!showAddDialog ? (
                  // 按钮状态
                  <div onClick={() => setShowAddDialog(true)} style={{ whiteSpace: 'nowrap' }}>
                    新增
                  </div>
                ) : (
                  // 对话框状态
                  <div style={{ animation: 'contentFadeIn 0.3s ease 0.2s both' }}>
                    <style>{`
                      @keyframes contentFadeIn {
                        from {
                          opacity: 0;
                          transform: translateY(10px);
                        }
                        to {
                          opacity: 1;
                          transform: translateY(0);
                        }
                      }
                    `}</style>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: prefersDark ? '#94a3b8' : '#64748b' }}>激活种类</label>
                        <select value={addKind} onChange={(e) => setAddKind(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.8)'}`, background: prefersDark ? 'rgba(15,23,42,0.6)' : '#fff', color: prefersDark ? '#f1f5f9' : '#111827', fontSize: 13, cursor: 'pointer', outline: 'none', transition: 'all 0.2s ease' }} onFocus={(e) => { e.currentTarget.style.borderColor = prefersDark ? '#3b82f6' : '#2563eb'; }} onBlur={(e) => { e.currentTarget.style.borderColor = prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.8)'; }}>
                          <option value="完整版">完整版</option>
                          <option value="专业版">专业版</option>
                          <option value="企业版">企业版</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: prefersDark ? '#94a3b8' : '#64748b' }}>订阅时长</label>
                        <select value={String(addMonths)} onChange={(e) => setAddMonths(Number(e.target.value))} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.8)'}`, background: prefersDark ? 'rgba(15,23,42,0.6)' : '#fff', color: prefersDark ? '#f1f5f9' : '#111827', fontSize: 13, cursor: 'pointer', outline: 'none', transition: 'all 0.2s ease' }} onFocus={(e) => { e.currentTarget.style.borderColor = prefersDark ? '#3b82f6' : '#2563eb'; }} onBlur={(e) => { e.currentTarget.style.borderColor = prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.8)'; }}>
                          <option value="1">1 个月</option>
                          <option value="6">6 个月</option>
                          <option value="12">1 年</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: prefersDark ? '#94a3b8' : '#64748b' }}>生成数量</label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={addQuantity}
                          onChange={(e) => {
                            const val = Math.max(1, Math.min(100, parseInt(e.target.value) || 1));
                            setAddQuantity(val);
                          }}
                          style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.8)'}`, background: prefersDark ? 'rgba(15,23,42,0.6)' : '#fff', color: prefersDark ? '#f1f5f9' : '#111827', fontSize: 13, outline: 'none', transition: 'all 0.2s ease' }}
                          onFocus={(e) => { e.target.style.borderColor = prefersDark ? '#3b82f6' : '#2563eb'; }}
                          onBlur={(e) => { e.target.style.borderColor = prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.8)'; }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                        <button type="button" onClick={async () => {
                          try {
                            const quantity = Math.max(1, Math.min(100, addQuantity));
                            const generatedCodes = [];
                            
                            for (let i = 0; i < quantity; i++) {
                              const key = genActivationCode(addKind);
                              const now = new Date();
                              const codeExpDate = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
                              const subExpDate = addMonthsToDate(now, addMonths);
                              subExpDate.setHours(23,59,59,999);
                              const value = { kind: addKind, expiration: subExpDate.getTime(), codeExp: codeExpDate.getTime() };
                              const resp = await fetch('/kv/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyPath: [key], value }) });
                              const j = await resp.json();
                              if (resp.ok && j.success) {
                                // push full data so we can render immediately without waiting for list refresh
                                generatedCodes.push({ code: key, kind: addKind, expiration: subExpDate.getTime(), codeExp: codeExpDate.getTime() });
                              } else {
                                throw new Error(j?.message || '服务器返回错误');
                              }
                            }
                            
                            try {
                              const r = await fetch(`/kv/list?t=${Date.now()}`, { cache: 'no-store' });
                              if (r.ok) {
                                const d = await r.json();
                                const items = (d.items || []).map(it => ({
                                  rawKey: Array.isArray(it.key) ? it.key : [it.key],
                                  key: Array.isArray(it.key) ? it.key.join('|') : String(it.key),
                                  value: it.value
                                }));
                                setDbItems(items);
                              }
                            } catch (e) {
                              console.warn('Failed to refresh list', e);
                            }
                            
                            const message = quantity === 1 
                              ? `已生成激活码 ${generatedCodes[0].code}`
                              : `成功生成 ${generatedCodes.length} 个激活码`;

                            // 准备卡片数据（使用刚生成的完整数据，以保证包含 codeExp）
                            const cardData = generatedCodes.map(it => ({ code: it.code, kind: it.kind, expiration: it.expiration, codeExp: it.codeExp }));
                            // 生成与手动导出一致的卡片预览（使用相同的渲染逻辑）
                            try {
                              const canvasPreview = await generateCardImage(cardData);
                              setCardPreviewData({ codes: cardData, canvas: canvasPreview });
                            } catch (e) {
                              // 回退到仅数据展示（不应发生）
                              setCardPreviewData(cardData);
                            }
                            
                            pushInfoToast('success', '新增成功', message);
                            setShowAddDialog(false);
                            setAddQuantity(1);
                          } catch (err) {
                            pushInfoToast('error', '新增失败', String(err));
                          }
                        }} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: prefersDark ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, boxShadow: prefersDark ? '0 4px 12px rgba(5,150,105,0.3)' : '0 4px 12px rgba(16,185,129,0.25)', transition: 'all 0.2s ease' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = prefersDark ? '0 6px 16px rgba(5,150,105,0.4)' : '0 6px 16px rgba(16,185,129,0.35)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = prefersDark ? '0 4px 12px rgba(5,150,105,0.3)' : '0 4px 12px rgba(16,185,129,0.25)'; }}>确认新增</button>
                        <button type="button" onClick={() => setShowAddDialog(false)} style={{ flex: 1, background: 'transparent', color: prefersDark ? '#cbd5e1' : '#475569', cursor: 'pointer', fontSize: 13, transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={(e) => { e.currentTarget.style.background = prefersDark ? 'rgba(71,85,105,0.15)' : 'rgba(226,232,240,0.4)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 导出按钮 */}
              <div style={{ position: 'absolute', right: isMobile ? 98 : 114, bottom: isMobile ? 18 : 24, zIndex: 10000020, pointerEvents: 'auto', opacity: showAddDialog ? 0.3 : (dbSelectedKeys.size === 0 ? 0.4 : 1), transform: showAddDialog ? 'scale(0.9)' : 'none', transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                <button 
                  type="button" 
                  disabled={dbSelectedKeys.size === 0}
                  onClick={async () => {
                    if (!dbSelectedKeys || dbSelectedKeys.size === 0) return;
                    const keys = Array.from(dbSelectedKeys);
                    const selectedItems = keys.map(k => {
                      const item = dbItems.find(it => it.key === k);
                      return {
                        code: k,
                        kind: item?.value?.kind || '完整版',
                        expiration: item?.value?.expiration,
                        codeExp: item?.value?.codeExp
                      };
                    });
                    const canvas = await generateCardImage(selectedItems);
                    setCardPreviewData({ codes: selectedItems, canvas });
                  }} 
                  style={{ 
                    padding: isMobile ? '10px 18px' : '12px 20px', 
                    borderRadius: 9999, 
                    border: 'none', 
                    background: dbSelectedKeys.size === 0 ? (prefersDark ? '#334155' : '#cbd5e1') : (prefersDark ? '#1e40af' : '#3b82f6'), 
                    color: dbSelectedKeys.size === 0 ? (prefersDark ? '#64748b' : '#94a3b8') : '#fff', 
                    cursor: dbSelectedKeys.size === 0 ? 'not-allowed' : 'pointer', 
                    fontWeight: 700 
                  }}>导出</button>
              </div>

              {/* 删除按钮 - 独立元素 */}
              <div style={{ position: 'absolute', right: isMobile ? 18 : 24, bottom: isMobile ? 18 : 24, zIndex: 10000020, pointerEvents: 'auto', opacity: showAddDialog ? 0.3 : (dbSelectedKeys.size === 0 ? 0.4 : 1), transform: showAddDialog ? 'scale(0.9)' : 'none', transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>

                <button 
                  type="button" 
                  disabled={dbSelectedKeys.size === 0}
                  onClick={async () => {
                  if (!dbSelectedKeys || dbSelectedKeys.size === 0) { pushInfoToast('info', '未选择', '请先选择要删除的记录'); return; }
                  if (!globalThis.confirm || !globalThis.confirm(`确认删除 ${dbSelectedKeys.size} 条记录？`)) return;
                  const keys = Array.from(dbSelectedKeys);
                  try {
                    await Promise.all(keys.map(k => {
                      const item = dbItems.find(it => it.key === k);
                      const keyPath = item?.rawKey || [k];
                      return fetch('/kv/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyPath }) });
                    }));
                    // refresh authoritative list
                    try {
                      const r = await fetch(`/kv/list?t=${Date.now()}`, { cache: 'no-store' });
                      if (r.ok) {
                        const d = await r.json();
                        const items = (d.items || []).map(it => ({
                          rawKey: Array.isArray(it.key) ? it.key : [it.key],
                          key: Array.isArray(it.key) ? it.key.join('|') : String(it.key),
                          value: it.value
                        }));
                        setDbItems(items);
                      } else {
                        setDbItems(prev => prev.filter(it => !dbSelectedKeys.has(it.key)));
                      }
                    } catch (e) {
                      setDbItems(prev => prev.filter(it => !dbSelectedKeys.has(it.key)));
                    }
                    setDbSelectedKeys(new Set());
                    pushInfoToast('success', '删除成功', '已删除选中记录');
                  } catch (err) {
                    pushInfoToast('error', '删除失败', String(err));
                  }
                }} style={{ 
                  padding: isMobile ? '10px 18px' : '12px 20px', 
                  borderRadius: 9999, 
                  border: 'none', 
                  background: dbSelectedKeys.size === 0 ? (prefersDark ? '#334155' : '#cbd5e1') : (prefersDark ? '#991b1b' : '#ef4444'), 
                  color: dbSelectedKeys.size === 0 ? (prefersDark ? '#64748b' : '#94a3b8') : '#fff', 
                  cursor: dbSelectedKeys.size === 0 ? 'not-allowed' : 'pointer', 
                  fontWeight: 700 
                }}>删除</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 卡片预览弹窗 */}
      {cardPreviewData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000001, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }} onClick={() => setCardPreviewData(null)}>
          <div style={{ position: 'relative', background: prefersDark ? 'rgba(15,23,42,0.98)' : '#ffffff', borderRadius: 16, padding: 24, maxWidth: '90%', maxHeight: '80vh', overflow: 'visible', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', paddingBottom: 120 }} onClick={(e) => e.stopPropagation()}>

            {/* 可滚动内容区（不会包含悬浮按钮） */}
            <div style={{ maxHeight: 'calc(80vh - 72px)', overflow: 'auto', paddingRight: 8 }}>
              {cardPreviewData.canvas ? (
                <img src={cardPreviewData.canvas.toDataURL('image/png')} alt="激活码卡片预览" style={{ width: '100%', maxWidth: 600, borderRadius: 8, border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.6)'}` }} />
              ) : cardPreviewData.map((item, idx) => (
                <div key={idx} style={{ padding: 16, marginBottom: 12, borderRadius: 12, background: prefersDark ? 'rgba(30,41,59,0.6)' : 'rgba(248,250,252,0.8)', border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.6)'}` }}>
                  <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color: prefersDark ? '#60a5fa' : '#2563eb', marginBottom: 12 }}>{item.code}</div>
                  <div style={{ display: 'flex', gap: 20, fontSize: 14 }}>
                    <div>
                      <span style={{ color: prefersDark ? '#94a3b8' : '#64748b' }}>版本：</span>
                      <span style={{ fontWeight: 600, color: prefersDark ? '#e5e7eb' : '#111827' }}>{item.kind}</span>
                    </div>
                    <div>
                      <span style={{ color: prefersDark ? '#94a3b8' : '#64748b' }}>有效期至：</span>
                      <span style={{ fontWeight: 600, color: prefersDark ? '#e5e7eb' : '#111827' }}>{formatDate(item.expiration)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 悬浮胶囊按钮 - 相对于弹窗容器绝对定位（不会随内容滚动） */}
            <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10000002, display: 'flex', gap: 12 }}>
              <button type="button" onClick={async () => {
                const canvas = cardPreviewData.canvas || null;
                const codes = cardPreviewData.codes || cardPreviewData;
                const filename = `GasMap激活码_${new Date().getTime()}.png`;
                const getBlob = () => new Promise((resolve) => {
                  if (canvas) {
                    canvas.toBlob((blob) => resolve(blob), 'image/png');
                  } else {
                    generateCardImage(codes).then(cv => cv.toBlob((blob) => resolve(blob), 'image/png'));
                  }
                });
                try {
                  const blob = await getBlob();
                  if (blob && typeof navigator !== 'undefined' && navigator.share) {
                    try {
                      const file = new File([blob], filename, { type: 'image/png' });
                      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: filename });
                      } else {
                        const url = URL.createObjectURL(blob);
                        await navigator.share({ title: filename, url });
                        URL.revokeObjectURL(url);
                      }
                      pushInfoToast('success', '已分享', '已打开系统分享菜单');
                    } catch (err) {
                      try {
                        if (navigator.clipboard && window.ClipboardItem) {
                          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
                          pushInfoToast('success', '已复制', '图片已复制到剪贴板');
                        } else {
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank', 'noopener,noreferrer');
                          setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 2000);
                        }
                      } catch (_) {
                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank', 'noopener,noreferrer');
                        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 2000);
                      }
                    }
                  } else {
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank', 'noopener,noreferrer');
                    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 2000);
                  }
                } catch (e) {}
                setCardPreviewData(null);
              }} style={{ padding: '14px 28px', borderRadius: 9999, background: prefersDark ? '#d2b11cff' : '#ef9b00ff', color: prefersDark ? '#e2e8f0' : '#111827', cursor: 'pointer', fontWeight: 700, fontSize: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}>分享</button>
              <button type="button" onClick={() => {
                const canvas = cardPreviewData.canvas || null;
                const codes = cardPreviewData.codes || cardPreviewData;
                
                if (canvas) {
                  canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `GasMap激活码_${new Date().getTime()}.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                    pushInfoToast('success', '导出成功', `已保存 ${codes.length} 个激活码卡片`);
                  }, 'image/png');
                } else {
                  generateCardImage(codes).then(canvas => {
                    canvas.toBlob((blob) => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `GasMap激活码_${new Date().getTime()}.png`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }, 'image/png');
                  });
                }
                setCardPreviewData(null);
              }} style={{ padding: '14px 32px', borderRadius: 9999, border: 'none', background: prefersDark ? 'linear-gradient(135deg, #1e40af, #1e3a8a)' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>保存为图片</button>
            </div>
          </div>
        </div>
      )}

      {/* 图纸导出预览弹窗 */}
      {designPreviewCanvas && showDesignPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000001, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }} onClick={() => { setDesignPreviewCanvas(null); setShowDesignPreview(false); }}>
          <div style={{ position: 'relative', background: prefersDark ? 'rgba(15,23,42,0.98)' : '#ffffff', borderRadius: 12, padding: 18, maxWidth: '94%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ maxHeight: '80vh', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
              {(() => {
                if (!designPreviewCanvas) return null;
                const getDataUrl = (canvas, transparent) => {
                  try {
                    if (transparent) return canvas.toDataURL('image/png');
                    const tmp = document.createElement('canvas');
                    tmp.width = canvas.width;
                    tmp.height = canvas.height;
                    const ctx = tmp.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, tmp.width, tmp.height);
                    ctx.drawImage(canvas, 0, 0);
                    return tmp.toDataURL('image/png');
                  } catch (e) {
                    try { return canvas.toDataURL('image/png'); } catch (_) { return ''; }
                  }
                };
                const src = getDataUrl(designPreviewCanvas, designPreviewTransparent);
                return (
                  <div style={{ background: designPreviewTransparent ? 'repeating-linear-gradient(45deg, #e6e6e6 0 10px, #cfcfcf 0 20px)' : '#ffffff', padding: 6, borderRadius: 6 }}>
                    <img src={src} alt="图纸导出预览" style={{ width: '100%', maxWidth: 1200, borderRadius: 6, border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.6)'}` }} />
                  </div>
                );
              })()}
            </div>

            {/* Controls: multi rows under the image (iOS settings style) */}
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 1200, width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: prefersDark ? 'rgba(2,6,23,0.04)' : 'transparent' }}>
                <div style={{ fontSize: 14, color: prefersDark ? '#e5e7eb' : '#0f172a' }}>透明背景</div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', height: 40 }}>
                  <input type="checkbox" checked={designPreviewTransparent} onChange={(e) => setDesignPreviewTransparent(!!e.target.checked)} style={{ display: 'none' }} />
                  <span style={{ width: 60, height: 40, borderRadius: 9999, background: designPreviewTransparent ? '#3b82f6' : '#e5e7eb', position: 'relative', display: 'inline-block', transition: 'background 0.18s' }}>
                    <span style={{ position: 'absolute', top: 4, left: designPreviewTransparent ? 28 : 4, width: 32, height: 32, borderRadius: 9999, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 0.18s' }} />
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: prefersDark ? 'rgba(2,6,23,0.04)' : 'transparent' }}>
                <div style={{ fontSize: 14, color: prefersDark ? '#e5e7eb' : '#0f172a' }}>保存为图片</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => {
                    const cvs = designPreviewCanvas;
                    if (!cvs) { setDesignPreviewCanvas(null); return; }
                    if (designPreviewTransparent) {
                      cvs.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${(currentProject?.name || '设计')}_export_${new Date().toISOString().slice(0,10)}.png`;
                        a.click();
                        URL.revokeObjectURL(url);
                        pushInfoToast('success', '导出成功', '已保存设计图片');
                      }, 'image/png');
                    } else {
                      const tmp = document.createElement('canvas');
                      tmp.width = cvs.width;
                      tmp.height = cvs.height;
                      const ctx = tmp.getContext('2d');
                      ctx.fillStyle = '#ffffff';
                      ctx.fillRect(0, 0, tmp.width, tmp.height);
                      ctx.drawImage(cvs, 0, 0);
                      tmp.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${(currentProject?.name || '设计')}_export_${new Date().toISOString().slice(0,10)}.png`;
                        a.click();
                        URL.revokeObjectURL(url);
                        pushInfoToast('success', '导出成功', '已保存设计图片');
                      }, 'image/png');
                    }
                    setDesignPreviewCanvas(null);
                    setShowDesignPreview(false);
                  }} style={{ height: 40, padding: '0 14px', borderRadius: 9999, border: 'none', background: prefersDark ? '#1e40af' : '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>保存</button>
                </div>
              </div>

              {/* Share row as the last row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 9999, background: prefersDark ? 'rgba(2,6,23,0.04)' : 'transparent' }}>
                <div style={{ fontSize: 14, color: prefersDark ? '#e5e7eb' : '#0f172a' }}>分享</div>
                <div>
                  <button type="button" onClick={async () => {
                    const cvs = designPreviewCanvas;
                    if (!cvs) { setDesignPreviewCanvas(null); return; }
                    const filename = `${(currentProject?.name || '设计')}_export_${new Date().toISOString().slice(0,10)}.png`;
                    const getBlob = () => new Promise((resolve) => {
                      if (designPreviewTransparent) {
                        cvs.toBlob((b) => resolve(b), 'image/png');
                      } else {
                        const tmp = document.createElement('canvas');
                        tmp.width = cvs.width; tmp.height = cvs.height;
                        const ctx2 = tmp.getContext('2d');
                        ctx2.fillStyle = '#ffffff';
                        ctx2.fillRect(0, 0, tmp.width, tmp.height);
                        ctx2.drawImage(cvs, 0, 0);
                        tmp.toBlob((b) => resolve(b), 'image/png');
                      }
                    });
                    try {
                      const blob = await getBlob();
                      if (blob && typeof navigator !== 'undefined' && navigator.share) {
                        try {
                          const file = new File([blob], filename, { type: 'image/png' });
                          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                            await navigator.share({ files: [file], title: filename });
                          } else {
                            const url = URL.createObjectURL(blob);
                            await navigator.share({ title: filename, url });
                            URL.revokeObjectURL(url);
                          }
                          pushInfoToast('success', '已分享', '已打开系统分享菜单');
                        } catch (err) {
                          try {
                            if (navigator.clipboard && window.ClipboardItem) {
                              await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
                              pushInfoToast('success', '已复制', '图片已复制到剪贴板');
                            } else {
                              const url = URL.createObjectURL(blob);
                              window.open(url, '_blank', 'noopener,noreferrer');
                              setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 2000);
                            }
                          } catch (_) {
                            const url = URL.createObjectURL(blob);
                            window.open(url, '_blank', 'noopener,noreferrer');
                            setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 2000);
                          }
                        }
                      } else {
                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank', 'noopener,noreferrer');
                        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 2000);
                      }
                    } catch (e) {}
                  }} style={{ height: 40, padding: '0 14px', borderRadius: 9999, border: 'none', background: prefersDark ? '#d2b11cff' : '#ef9b00ff', color: prefersDark ? '#e2e8f0' : '#111827', cursor: 'pointer', fontWeight: 700 }}>分享</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastViewport anchorRef={shellRef} offset={0} align="center" />
      
      {/* 广告弹窗 */}
      {currentAd && (
        <BlockOverlay
          mode="ad"
          visible={adOverlayVisible}
          adUrl={currentAd.link}
          adDuration={currentAd.duration || 5}
          onAdOpen={() => {
            try {
              globalThis.open(currentAd.link, '_blank', 'noopener,noreferrer');
            } catch (e) {
              console.warn('[LiveDock] Failed to open ad link', e);
            }
          }}
          onAdClose={() => {
            setAdOverlayVisible(false);
            setCurrentAd(null);
          }}
        />
      )}
    </div>
  );
});

export default LiveDock;