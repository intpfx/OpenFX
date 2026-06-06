import React, { useEffect, useMemo, useRef, useState } from 'react';
import LiquidFill from './LiquidFill.jsx';

/**
 * BlockOverlay: 可复用的横屏/桌面模式遮罩组件 + 广告弹窗组件
 * 特性：
 * - 可通过 props 控制显示/隐藏（visible），不传则由内部检测自动控制
 * - 自动检测屏幕方向、指针类型与窗口宽度变化
 * - 默认提供响应式遮罩 UI，可通过 props 自定义文案和样式
 * - 通过事件回调向上层暴露检测状态与可见性变化
 * - 支持广告模式（mode="ad"），展示 iframe 和三个按钮（打开链接、去除广告、关闭）
 */
const BlockOverlay = ({
  id,
  visible,
  mode = 'block', // 'block' | 'ad'
  // 广告模式相关参数
  adUrl,
  adDuration = 5,
  onAdOpen,
  onAdRemove,
  onAdClose,
  // 原有遮罩模式参数
  requirePortrait = true,
  requireCoarsePointer = true,
  maxWidth = 600,
  titleText = '仅支持手机竖屏使用',
  descriptionText = '请在移动设备竖屏下访问并确保宽度不超过600px。桌面与横屏模式将被禁用。',
  className = 'fixed inset-0 z-[2000] bg-black bg-opacity-80 text-white flex flex-col items-center justify-center p-6 text-center',
  contentClassName = 'max-w-xs',
  style,
  children,
  onStateChange,
  onVisibilityChange,
}) => {
  const orientationMediaRef = useRef(null);
  const pointerMediaRef = useRef(null);
  
  // 广告模式：关闭按钮动画状态
  const [closeProgress, setCloseProgress] = useState(0);
  const [canClose, setCanClose] = useState(false);
  const animationStartTimeRef = useRef(null);
  const animationFrameRef = useRef(null);

  const [state, setState] = useState(() => {
    const isPortrait = (typeof window !== 'undefined') && ((globalThis.matchMedia && globalThis.matchMedia('(orientation: portrait)').matches) || globalThis.innerHeight >= globalThis.innerWidth);
    const isCoarsePointer = (typeof window !== 'undefined') && (globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches);
    const width = (typeof window !== 'undefined') ? globalThis.innerWidth : 0;
    const isNarrow = width <= maxWidth;
    const blocked = !(
      (!requirePortrait || isPortrait) &&
      (!requireCoarsePointer || isCoarsePointer) &&
      (isNarrow)
    );
    return { isPortrait, isCoarsePointer, width, isNarrow, blocked };
  });

  const computedVisible = useMemo(() => (
    typeof visible === 'boolean' ? visible : state.blocked
  ), [visible, state.blocked]);

  useEffect(() => {
    const orientationMedia = (typeof window !== 'undefined' && globalThis.matchMedia) ? globalThis.matchMedia('(orientation: portrait)') : null;
    const pointerMedia = (typeof window !== 'undefined' && globalThis.matchMedia) ? globalThis.matchMedia('(pointer: coarse)') : null;
    orientationMediaRef.current = orientationMedia;
    pointerMediaRef.current = pointerMedia;

    const updateFlags = () => {
      const isPortrait = orientationMedia ? orientationMedia.matches : (typeof window !== 'undefined' ? (globalThis.innerHeight >= globalThis.innerWidth) : true);
      const isCoarsePointer = pointerMedia ? pointerMedia.matches : false;
      const width = (typeof window !== 'undefined') ? globalThis.innerWidth : 0;
      const isNarrow = width <= maxWidth;
      const blocked = !(
        (!requirePortrait || isPortrait) &&
        (!requireCoarsePointer || isCoarsePointer) &&
        (isNarrow)
      );
      const next = { isPortrait, isCoarsePointer, width, isNarrow, blocked };
      setState(prev => {
        const changed = (
          prev.isPortrait !== next.isPortrait ||
          prev.isCoarsePointer !== next.isCoarsePointer ||
          prev.width !== next.width ||
          prev.isNarrow !== next.isNarrow ||
          prev.blocked !== next.blocked
        );
        if (changed) {
          onStateChange && onStateChange(next);
        }
        return next;
      });
    };

    updateFlags();

    const onResize = () => updateFlags();
    if (typeof window !== 'undefined') {
      globalThis.addEventListener('resize', onResize);
      globalThis.addEventListener('orientationchange', onResize);
    }
    if (orientationMedia) {
      orientationMedia.addEventListener ? orientationMedia.addEventListener('change', updateFlags) : orientationMedia.addListener(updateFlags);
    }
    if (pointerMedia) {
      pointerMedia.addEventListener ? pointerMedia.addEventListener('change', updateFlags) : pointerMedia.addListener(updateFlags);
    }
    return () => {
      if (typeof window !== 'undefined') {
        globalThis.removeEventListener('resize', onResize);
        globalThis.removeEventListener('orientationchange', onResize);
      }
      if (orientationMedia) {
        orientationMedia.removeEventListener ? orientationMedia.removeEventListener('change', updateFlags) : orientationMedia.removeListener(updateFlags);
      }
      if (pointerMedia) {
        pointerMedia.removeEventListener ? pointerMedia.removeEventListener('change', updateFlags) : pointerMedia.removeListener(updateFlags);
      }
    };
  }, [maxWidth, requirePortrait, requireCoarsePointer, onStateChange]);

  // 可见性变化通知
  const lastVisibleRef = useRef(computedVisible);
  useEffect(() => {
    if (lastVisibleRef.current !== computedVisible) {
      onVisibilityChange && onVisibilityChange(computedVisible);
      lastVisibleRef.current = computedVisible;
    }
  }, [computedVisible, onVisibilityChange]);

  // 广告模式：关闭按钮动画
  useEffect(() => {
    if (mode !== 'ad' || !computedVisible) {
      // 重置状态
      setCloseProgress(0);
      setCanClose(false);
      animationStartTimeRef.current = null;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    // 开始动画
    const duration = (adDuration || 5) * 1000; // 转换为毫秒
    animationStartTimeRef.current = performance.now();

    const animate = (currentTime) => {
      if (!animationStartTimeRef.current) return;
      
      const elapsed = currentTime - animationStartTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      setCloseProgress(progress);
      
      if (progress >= 1) {
        setCanClose(true);
        animationFrameRef.current = null;
      } else {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [mode, computedVisible, adDuration]);

  if (!computedVisible) return null;

  // 广告模式渲染
  if (mode === 'ad') {
    return (
      <div 
        id={id} 
        className="fixed inset-0 z-[999999] bg-black bg-opacity-90 flex items-center justify-center p-4"
        style={style}
      >
        <div className="w-full h-full max-w-6xl max-h-[90vh] flex flex-col gap-3">
          {/* iframe 容器 */}
          <div className="flex-1 bg-white rounded-2xl overflow-hidden shadow-2xl">
            {adUrl && (
              <iframe
                src={adUrl}
                className="w-full h-full border-0"
                title="广告内容"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              />
            )}
          </div>

          {/* 按钮区域 */}
          <div className="flex gap-3 justify-center">
            {/* 打开链接按钮（蓝色液态玻璃风格） */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdOpen && onAdOpen();
              }}
              className="px-8 py-3 text-white font-medium transition-colors shadow-lg"
              style={{
                borderRadius: 9999,
                pointerEvents: 'auto',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(59,130,246,0.12))',
                border: '1px solid rgba(59,130,246,0.22)',
                boxShadow: '0 8px 24px rgba(59,130,246,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
              }}
            >
              打开链接
            </button>

            {/* 关闭广告按钮（液态玻璃风格，去掉读秒文本） */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (canClose && onAdClose) {
                  onAdClose();
                }
              }}
              disabled={!canClose}
              className={`relative px-8 py-3 text-white font-medium transition-all shadow-lg overflow-hidden close-btn ${canClose ? 'can-close' : ''}`}
              style={{
                borderRadius: 9999,
                cursor: canClose ? 'pointer' : 'not-allowed',
                opacity: canClose ? 1 : 0.75,
                pointerEvents: 'auto',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 8px 30px rgba(2,6,23,0.6), inset 0 1px 0 rgba(255,255,255,0.02)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
              }}
            >
              {/* Liquid Fill canvas component (fills with progress) */}
              <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <LiquidFill progress={closeProgress} fillColor={'rgba(239,68,68,0.95)'} />
              </div>

              {/* 按钮文字（不显示倒计时） */}
              <span className="relative z-10 btn-content" style={{ pointerEvents: 'none' }}>
                关闭广告
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 原有遮罩模式渲染

  return (
    <div id={id} className={className} style={style}>
      <div className={contentClassName}>
        {children ? (
          children
        ) : (
          <>
            <div className="text-lg font-bold mb-3">{titleText}</div>
            <div className="text-sm opacity-90 mb-5">{descriptionText}</div>
            <div className="text-xs text-gray-200">当前状态：{state.isPortrait ? '竖屏' : '横屏'} · {state.isCoarsePointer ? '触控设备' : '桌面设备'} · 宽度 {state.width}px</div>
          </>
        )}
      </div>
    </div>
  );
};

export default BlockOverlay;