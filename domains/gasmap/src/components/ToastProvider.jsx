import React, { createContext, useContext, useState, useEffect, useCallback, useLayoutEffect } from 'react';

const ToastContext = createContext(null);
const MAX_VISIBLE_TOASTS = 5;
const TOAST_STYLE_ID = 'gm-toast-motion-styles';
let toastSequence = 0;

const ensureToastMotionStyles = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(TOAST_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TOAST_STYLE_ID;
  style.textContent = `
    .gm-toast-item {
      transform: translateY(40px);
    }
    
    .gm-toast-entering {
      animation: gm-toast-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    
    .gm-toast-exiting {
      animation: gm-toast-exit 0.35s cubic-bezier(0.4, 0, 0.6, 1) forwards;
    }
    
    @keyframes gm-toast-enter {
      from { 
        transform: translateY(40px);
      }
      to { 
        transform: translateY(0);
      }
    }
    
    @keyframes gm-toast-exit {
      0% { 
        transform: translateY(0);
      }
      15% { 
        transform: translateY(-12px);
      }
      100% { 
        transform: translateY(60px);
      }
    }

    @keyframes gm-toast-power-up {
      0% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-10px);
      }
      100% {
        transform: translateY(60px);
      }
    }
  `;
  document.head.appendChild(style);
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((opts) => {
    const id = opts.id || `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const isProgress = typeof opts.progress === 'number';
    const isFeedback = opts.type === 'feedback';
    const toast = {
      id,
      type: opts.type || 'info', // info | success | warning | error
      title: opts.title || '',
      message: opts.message || '',
      // optional actions: [{ label: string, onClick: function }]
      actions: Array.isArray(opts.actions) ? opts.actions : null,
        // 支持 manualClose：手动关闭的 toast 强制为 sticky 且无自动时长
        manualClose: !!opts.manualClose,
        duration: isProgress || isFeedback || !!opts.manualClose ? 0 : (opts.duration ?? 3000),
        progress: isProgress ? opts.progress : null,
        sticky: isProgress || isFeedback || !!opts.manualClose ? true : (opts.sticky || false),
      // feedback-specific handlers
      onSubmit: typeof opts.onSubmit === 'function' ? opts.onSubmit : null,
      // prompt: new param used as placeholder / suggested input for feedback toasts
      prompt: typeof opts.prompt === 'string' ? opts.prompt : (opts.message || ''),
      defaultValue: typeof opts.defaultValue === 'string' ? opts.defaultValue : (typeof opts.prompt === 'string' ? opts.prompt : ''),
      createdAt: Date.now(),
      order: ++toastSequence,
    };
    setToasts((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      const next = [...filtered, toast];
      if (next.length > MAX_VISIBLE_TOASTS) {
        return next.slice(next.length - MAX_VISIBLE_TOASTS);
      }
      return next;
    });
    
    if (!toast.sticky && toast.duration > 0) {
      setTimeout(() => {
        // mark closing for exit animation
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 550);
      }, toast.duration);
    }
    return id;
  }, []);

  const update = useCallback((id, patch) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const dismiss = useCallback((id) => {
    let didMark = false;
    setToasts((prev) => {
      const exists = prev.some((t) => t.id === id);
      if (!exists) return prev;
      didMark = true;
      return prev.map((t) => (t.id === id ? { ...t, closing: true } : t));
    });
    if (didMark) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 550);
    }
  }, []);

  const value = { show, update, dismiss, toasts };
  // Debug helper: expose `show` to `window.__gm_show_toast` so DevTools can trigger toasts.
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.__gm_show_toast = show;
        return () => { try { delete window.__gm_show_toast; } catch (_) {} };
      }
    } catch (_err) { /* noop */ }
  }, [show]);
  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const MemoizedToastContent = React.memo(function MemoizedToastContent({ toast, onDismiss, isTop, isBottom, single, prefersDark, accentColor, typeBadgeStyleBase, showManualClose }) {
  const [feedbackValue, setFeedbackValue] = useState(() => toast.defaultValue || '');
  const radius = single ? '18px 18px 0 0' : (isTop ? '18px 18px 0 0' : (isBottom ? '0' : '0'));
  const BOTTOM_FUSE_OVERLAP = 24;

  return (
    <>
      {/* 第一行：type | title | 进度条 | 关闭按钮 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'nowrap',
          lineHeight: 1.4,
          width: '100%'
        }}
      >
        {/* type 和 title - 不可收缩 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', minWidth: 0 }}>
          <span style={{ ...typeBadgeStyleBase, color: accentColor }}>{toast.type.toUpperCase()}</span>
          {toast.title && (
            <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>{toast.title}</span>
          )}
        </div>
        {/* 进度条 - 只在有进度时显示，占据剩余空间 */}
        {typeof toast.progress === 'number' && (
          <div style={{ flex: '1 1 auto', minWidth: 60 }}>
            <div
              style={{
                height: 6,
                background: prefersDark ? 'rgba(148,163,184,0.28)' : 'rgba(203,213,225,0.5)',
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, toast.progress))}%`,
                  height: '100%',
                  background: accentColor,
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* 非 feedback 且提供 actions 时，在首行右侧渲染小型圆形动作按钮（与进度/反馈 toast 的关闭位置一致） */}
        {(() => {
          // Prepare actions: filter out close-like custom actions for manualClose toasts,
          // then append a synthetic small close-dot action so manual-close toasts
          // always show a stable dot in the top-line action area (same as A2HS).
          const baseActions = Array.isArray(toast.actions)
            ? toast.actions.filter((a) => {
                const label = (a && (a.label || '')).toString().trim().toLowerCase();
                if (toast.manualClose && (label === '关闭' || label === 'close' || label === '取消' || label === 'cancel')) return false;
                return true;
              })
            : [];

          const actionsToRender = [...baseActions];
          if (toast.manualClose) {
            const hasCloseLike = baseActions.some((a) => {
              const label = (a && (a.label || '')).toString().trim().toLowerCase();
              return label === '关闭' || label === 'close' || label === '取消' || label === 'cancel';
            });
            if (!hasCloseLike) {
              actionsToRender.push({ label: '关闭', onClick: () => onDismiss(toast.id), color: '#ef4444' });
            }
          }

          if (toast.type !== 'feedback' && Array.isArray(actionsToRender) && actionsToRender.length > 0) {
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', marginLeft: 'auto' }}>
                {actionsToRender.map((a, idx) => {
                  // Support button-style actions with text labels
                  const isButtonStyle = a.style === 'button';
                  const isDisabled = a.disabled === true;
                  
                  if (isButtonStyle) {
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (isDisabled) return;
                          try {
                            if (typeof a.onClick === 'function') a.onClick(toast.id);
                          } catch (err) { /* 忽略组件 action 错误 */ }
                        }}
                        disabled={isDisabled}
                        title={a.title || a.label}
                        aria-label={a.title || a.label}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 8,
                          border: `1px solid ${prefersDark ? '#334155' : '#e5e7eb'}`,
                          background: isDisabled ? (prefersDark ? 'rgba(15,23,42,0.3)' : 'rgba(255,255,255,0.3)') : (prefersDark ? '#0f172a' : '#ffffff'),
                          color: isDisabled ? (prefersDark ? 'rgba(226,232,240,0.4)' : 'rgba(17,24,39,0.4)') : (prefersDark ? '#e2e8f0' : '#111827'),
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          fontWeight: 500,
                          opacity: isDisabled ? 0.5 : 1,
                          pointerEvents: 'auto',
                          flex: '0 0 auto',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {a.label}
                      </button>
                    );
                  }
                  
                  // Default dot-style action
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        try {
                          if (typeof a.onClick === 'function') a.onClick(toast.id);
                        } catch (err) { /* 忽略组件 action 错误 */ }
                      }}
                      title={a.title || a.label}
                      aria-label={a.title || a.label}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 6,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 999,
                        pointerEvents: 'auto',
                        flex: '0 0 auto'
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: a.color || (String(a.label).trim() === '关闭' ? '#ef4444' : '#3b82f6'),
                          boxShadow: prefersDark ? `0 0 0 1px ${a.color || (String(a.label).trim() === '关闭' ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.35)')}` : `0 0 0 1px ${a.color || (String(a.label).trim() === '关闭' ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.35)')}`
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            );
          }
          return null;
        })()}

        {/* feedback 类型：显示 input（占据剩余空间），右侧为提交蓝点，最右为关闭 */}
        {toast.type === 'feedback' && (
          <>
            <div style={{ flex: '1 1 auto', minWidth: 60, display: 'flex', alignItems: 'center' }}>
              <input
                value={feedbackValue}
                onChange={(e) => setFeedbackValue(e.target.value)}
                placeholder={toast.prompt || ''}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 10,
                  border: prefersDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.06)',
                  background: prefersDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.6)',
                  color: 'inherit',
                  outline: 'none',
                  fontSize: 13,
                }}
              />
            </div>
            {/* 提交按钮（蓝色小圆点） */}
            <button
              type="button"
              onClick={() => {
                try {
                  if (typeof toast.onSubmit === 'function') {
                    toast.onSubmit(feedbackValue, toast.id);
                  } else {
                  }
                } catch (err) {
                }
                onDismiss(toast.id);
              }}
              title="提交"
              aria-label="提交"
              style={{
                border: 'none',
                background: 'transparent',
                padding: 6,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                pointerEvents: 'auto',
                flex: '0 0 auto',
                marginLeft: 6,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#3b82f6',
                  boxShadow: prefersDark ? '0 0 0 1px rgba(59,130,246,0.35)' : '0 0 0 1px rgba(59,130,246,0.35)'
                }}
              />
            </button>
            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              title="关闭"
              aria-label="关闭"
              style={{
                border: 'none',
                background: 'transparent',
                padding: 6,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                pointerEvents: 'auto',
                flex: '0 0 auto',
                marginLeft: 6,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#ef4444',
                  boxShadow: prefersDark ? '0 0 0 1px rgba(239,68,68,0.5)' : '0 0 0 1px rgba(239,68,68,0.5)'
                }}
              />
            </button>
          </>
        )}
      </div>
      {/* Manual-close toasts render the small close dot as a top-line action (see top actions block). */}
      {/* 第二行：message 文本区域（支持单/多行） */}
      {toast.message && (
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 13, opacity: 0.88, lineHeight: 1.5, display: 'block', wordBreak: 'break-word' }}>
            {toast.message}
          </span>
        </div>
      )}
      {toast.sticky && typeof toast.progress !== 'number' && toast.type !== 'feedback' && (!Array.isArray(toast.actions) || toast.actions.length === 0) && !toast.manualClose && (
        <div style={{ marginTop: 12, textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {/* Render custom actions if provided */}
          {Array.isArray(toast.actions) && toast.actions.length > 0 ? (
            // Use same filtering logic as the top actions to avoid rendering a redundant close action
            toast.actions.filter((a) => {
              const label = (a && (a.label || '')).toString().trim().toLowerCase();
              if (toast.manualClose && (label === '关闭' || label === 'close' || label === '取消' || label === 'cancel')) return false;
              return true;
            }).map((a, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  try {
                    if (typeof a.onClick === 'function') a.onClick(toast.id);
                  } catch (err) { }
                }}
                style={{
                  border: 'none',
                  background: a.background || (prefersDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)'),
                  color: a.color || (prefersDark ? '#f8fafc' : '#475569'),
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 10px',
                  borderRadius: 999,
                }}
              >
                {a.label}
              </button>
            ))
          ) : (
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              style={{
                border: 'none',
                background: prefersDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                color: prefersDark ? '#f8fafc' : '#475569',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 10px',
                borderRadius: 999,
              }}
            >
              关闭
            </button>
          )}
        </div>
      )}
    </>
  );
});

// ToastItem: single toast with enter/exit animation; movement between positions handled by FLIP in parent
const ToastItem = ({ innerRef, toast, onDismiss, isTop, isBottom, single, prefersDark, prefersReducedMotion, accent, accentColor, itemStyleBase, typeBadgeStyleBase, showManualClose }) => {
  const [animationState, setAnimationState] = useState('entering');

  useEffect(() => {
    if (prefersReducedMotion) {
      setAnimationState('visible');
      return;
    }

    const enterTimeout = setTimeout(() => {
      setAnimationState('visible');
    }, 50); // Short delay to ensure transition is applied

    return () => clearTimeout(enterTimeout);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (toast.closing) {
      setAnimationState('exiting');
    }
  }, [toast.closing]);

  const radius = single ? '18px 18px 0 0' : (isTop ? '18px 18px 0 0' : (isBottom ? '0' : '0'));
  const BOTTOM_FUSE_OVERLAP = 24;

  const animationStyle = {
    transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    transform: 'translateY(40px)',
  };

  if (animationState === 'visible') {
    animationStyle.transform = 'translateY(0)';
  }

  if (animationState === 'exiting') {
    // Use animation property instead of transform for exit to avoid conflicts
    delete animationStyle.transform;
    delete animationStyle.transition;
    animationStyle.animation = 'gm-toast-power-up 0.35s cubic-bezier(0.4, 0, 0.6, 1) forwards';
  }


  return (
    <div
      style={{
        ...itemStyleBase,
        ...accent,
        width: '100%',
        borderTopWidth: isTop ? undefined : 0,
        borderBottom: isBottom ? 'none' : undefined,
        borderRadius: radius,
        marginBottom: isBottom ? -BOTTOM_FUSE_OVERLAP : 0,
        paddingBottom: isBottom ? 12 + BOTTOM_FUSE_OVERLAP : undefined,
        ...(prefersReducedMotion ? {} : animationStyle),
      }}
    >
      {/* Inner wrapper receives FLIP transforms via ref; outer div handles enter/exit animation */}
      <div
        ref={innerRef}
        data-animation-state={animationState}
        style={{ width: '100%', display: 'block' }}
      >
        <MemoizedToastContent
          toast={toast}
          onDismiss={onDismiss}
          isTop={isTop}
          isBottom={isBottom}
          single={single}
          prefersDark={prefersDark}
          accentColor={accentColor}
          typeBadgeStyleBase={typeBadgeStyleBase}
          showManualClose={showManualClose}
        />
      </div>
    </div>
  );
};

// ToastViewport: renders toasts anchored above an element
export const ToastViewport = ({ anchorRef, offset = 12, zIndex = 99999, align = 'center' }) => {
  const { toasts, dismiss } = useToast();
  // Debug: log toasts for visibility while debugging visual issues
  useEffect(() => {
  }, [toasts]);
  const [anchorRect, setAnchorRect] = useState(null);
  const [prefersDark, setPrefersDark] = useState(() => {
    if (!globalThis.matchMedia) return false;
    return globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (!globalThis.matchMedia) return false;
    return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    ensureToastMotionStyles();
  }, []);

  useEffect(() => {
    if (!globalThis.matchMedia) return;
    const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event) => setPrefersDark(event.matches);
    media.addEventListener ? media.addEventListener('change', handler) : media.addListener(handler);
    return () => {
      media.removeEventListener ? media.removeEventListener('change', handler) : media.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    if (!globalThis.matchMedia) return;
    const media = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event) => setPrefersReducedMotion(event.matches);
    media.addEventListener ? media.addEventListener('change', handler) : media.addListener(handler);
    return () => {
      media.removeEventListener ? media.removeEventListener('change', handler) : media.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    if (!anchorRef?.current) return;
    const el = anchorRef.current;
    const updateRect = () => {
      setAnchorRect(el.getBoundingClientRect());
    };
    updateRect();
    const ro = new ResizeObserver(updateRect);
    ro.observe(el);
    globalThis.addEventListener('scroll', updateRect, true);
    globalThis.addEventListener('resize', updateRect);
    return () => {
      ro.disconnect();
      globalThis.removeEventListener('scroll', updateRect, true);
      globalThis.removeEventListener('resize', updateRect);
    };
  }, [anchorRef]);

  const viewportHeight = typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : 0;
  const anchorTopWithOffset = anchorRect ? Math.max(0, anchorRect.top - offset) : null;
  const dynamicBottom = anchorTopWithOffset != null ? Math.max(0, viewportHeight - anchorTopWithOffset) : null;

  const containerStyle = anchorRect
    ? {
        position: 'fixed',
        bottom: dynamicBottom != null ? dynamicBottom : undefined,
        left:
          align === 'left'
            ? anchorRect.left
            : align === 'right'
            ? anchorRect.right
            : anchorRect.left + anchorRect.width / 2,
        width: anchorRect.width,
        transform:
          align === 'center'
            ? 'translateX(-50%)'
            : align === 'right'
            ? 'translateX(-100%)'
            : 'none',
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'stretch',
        gap: 0,
        maxHeight: '60vh',
        overflow: 'visible',
        paddingBottom: 0,
        marginBottom: 0,
      }
    : {
        // 回退：当 anchorRef 未就绪时，固定显示在视口右上角
        position: 'fixed',
        top: Math.max(0, offset),
        right: 20,
        width: 360,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        gap: 0,
        maxWidth: 'min(520px, 80vw)',
      };

  const itemStyleBase = {
    pointerEvents: 'auto',
    borderRadius: 18,
    padding: '12px 18px',
    border: prefersDark ? '1px solid rgba(71,85,105,0.4)' : '1px solid rgba(255,255,255,0.4)',
    background: prefersDark ? 'rgba(0,0,0,1)' : 'rgba(255,255,255,0.3)',
    color: prefersDark ? '#e2e8f0' : '#1f2937',
    boxShadow: 'none',
    fontSize: 13,
    lineHeight: 1.45,
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    position: 'relative',
    overflow: 'visible',
    transformOrigin: 'center top',
    willChange: 'transform',
  };

  const typeStyles = {
    info: {},
    success: {},
    warning: {},
    error: {},
  };

  const accentColors = {
    info: '#3b82f6',
    success: '#22c55e',
    warning: '#f97316',
    error: '#ef4444',
  };

  const typeBadgeStyleBase = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    opacity: 0.82,
  };

  const limitedToasts = toasts.slice(-MAX_VISIBLE_TOASTS);
  const orderedToasts = [...limitedToasts].sort((a, b) => {
    const oa = typeof a?.order === 'number' ? a.order : (typeof a?.createdAt === 'number' ? a.createdAt : 0);
    const ob = typeof b?.order === 'number' ? b.order : (typeof b?.createdAt === 'number' ? b.createdAt : 0);
    return oa - ob;
  });
  const totalVisible = orderedToasts.length;

  // Determine a single toast (the most recent manualClose) that will show the red-dot manual close.
  const manualCloseToastId = (() => {
    for (let i = orderedToasts.length - 1; i >= 0; i--) {
      if (orderedToasts[i] && orderedToasts[i].manualClose) return orderedToasts[i].id;
    }
    return null;
  })();

  // FLIP animation refs
  const previousRectsRef = React.useRef({});
  const itemRefsRef = React.useRef(new Map());

  // Layout-based movement animation for stacking changes
  useLayoutEffect(() => {
    if (prefersReducedMotion) return;
    
    const prev = previousRectsRef.current;
    const nextRects = {};
    
    // Collect current positions of all toasts
    orderedToasts.forEach(t => {
      const el = itemRefsRef.current.get(t.id);
      if (el) {
        nextRects[t.id] = el.getBoundingClientRect();
      }
    });

    // Check if any toast is entering (not closing)
    const hasEntering = orderedToasts.some(t => {
      if (t.closing) return false;
      const el = itemRefsRef.current.get(t.id);
      if (!el) return false;
      const state = el.dataset && el.dataset.animationState;
      return state === 'entering';
    });
    
    // Skip FLIP if toasts are entering (but not if they're exiting)
    if (hasEntering) {
      previousRectsRef.current = nextRects;
      return;
    }

    // Apply FLIP to non-closing, visible toasts
    orderedToasts.forEach(t => {
      // Don't apply FLIP to closing toasts - they have their own exit animation
      if (t.closing) return;
      
      const el = itemRefsRef.current.get(t.id);
      if (!el) return;
      
      // Only apply FLIP to toasts that are fully visible
      const animState = el.dataset && el.dataset.animationState;
      if (animState !== 'visible') return;
      
      const prevRect = prev[t.id];
      const nextRect = nextRects[t.id];
      
      if (prevRect && nextRect) {
        const dy = prevRect.top - nextRect.top;
        
        // Only animate if position changed significantly
        if (Math.abs(dy) > 0.5) {
          // Invert: Move element back to its old position
          el.style.transition = 'none';
          el.style.transform = `translateY(${dy}px)`;
          
          // Force layout recalculation
          void el.offsetHeight;
          
          // Play: Animate to new position
          requestAnimationFrame(() => {
            el.style.transition = 'transform 320ms cubic-bezier(0.25, 0.8, 0.4, 1)';
            el.style.transform = 'translateY(0)';
          });
        }
      }
    });
    
    // Store positions for next cycle
    previousRectsRef.current = nextRects;
  }, [orderedToasts, prefersReducedMotion]);

  return (
    <div style={containerStyle} aria-live="polite" aria-atomic="true">
      {orderedToasts.map((t, index) => {
        const toastType = t.type || 'info';
        const accent = typeStyles[toastType] || typeStyles.info;
        const accentColor = accentColors[toastType] || accentColors.info;
        const isTop = index === 0;
        const isBottom = index === totalVisible - 1;
        const single = totalVisible === 1;
        
        return (
          <ToastItem
            key={t.id}
            innerRef={(el) => {
              if (el) itemRefsRef.current.set(t.id, el); else itemRefsRef.current.delete(t.id);
            }}
            toast={t}
            onDismiss={dismiss}
            isTop={isTop}
            isBottom={isBottom}
            single={single}
            prefersDark={prefersDark}
            prefersReducedMotion={prefersReducedMotion}
            accent={accent}
            accentColor={accentColor}
            itemStyleBase={itemStyleBase}
            typeBadgeStyleBase={typeBadgeStyleBase}
                // Show the red-dot manual close for any toast explicitly marked manualClose.
                // Previously this was only shown for the most-recent manualClose toast
                // (t.id === manualCloseToastId). To keep the manual-close affordance
                // visible when multiple manual toasts are present or when stacking
                // reorders them, render the red dot for all `manualClose` toasts.
                showManualClose={!!t.manualClose}
          />
        );
      })}
    </div>
  );
};