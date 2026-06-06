/**
 * Compass.jsx
 * 新增 useCompassHeading React hook：提供实时设备朝向（heading、direction）。
 * 保留 legacy 的 directionDisplay 导出以兼容可能的旧用法。
 * 不再在全局注册 DOM 事件，避免干扰 React 组件。
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

// 兼容保留：旧版导出的方向显示节点（未在新实现中使用）
export const directionDisplay = document.createElement('div');
directionDisplay.id = 'currentDirection';
directionDisplay.style.display = 'grid';
directionDisplay.style.placeItems = 'center';

const DIRECTIONS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北', '北'];

// 计算方向文字
function toDirection(heading) {
  if (heading == null || isNaN(heading)) return null;
  const idx = Math.round(heading / 45);
  return DIRECTIONS[idx];
}

/**
 * useCompassHeading
 * - heading: number | null (0-360)
 * - direction: string | null （中文方位）
 * - available: boolean 是否支持方向事件
 * - permission: 'default' | 'granted' | 'denied' | 'error'
 * - requestPermission: () => Promise<void> 主动请求权限（iOS）
 */
export function useCompassHeading(options = {}) {
  const { autoRequest = true } = options;
  const [heading, setHeading] = useState(null);
  const [direction, setDirection] = useState(null);
  const [permission, setPermission] = useState('default');
  const [available] = useState(typeof window !== 'undefined' && !!globalThis.DeviceOrientationEvent);
  const listenerRef = useRef(null);

  // 方向事件处理
  const handleOrientation = (event) => {
    let h = null;
    if (event.webkitCompassHeading !== undefined) {
      h = event.webkitCompassHeading;
    } else if (event.alpha != null) {
      h = (540 - event.alpha) % 360;
    }
    if (h != null && !isNaN(h)) {
      setHeading(h);
      setDirection(toDirection(h));
    }
  };

  const start = useCallback(() => {
    if (!available) return;
    if (!listenerRef.current) {
      listenerRef.current = (e) => handleOrientation(e);
      globalThis.addEventListener('deviceorientation', listenerRef.current);
    }
  }, [available]);

  const stop = useCallback(() => {
    if (listenerRef.current) {
      globalThis.removeEventListener('deviceorientation', listenerRef.current);
      listenerRef.current = null;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!available) return;
    try {
      const fn = typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission;
      if (typeof fn === 'function') {
        const resp = await DeviceOrientationEvent.requestPermission();
        if (resp === 'granted') {
          setPermission('granted');
          start();
        } else {
          setPermission(resp || 'denied');
        }
      } else {
        setPermission('granted');
        start();
      }
    } catch (err) {
      setPermission('error');
    }
  }, [available, start]);

  useEffect(() => {
    if (!available) return;
    if (autoRequest) requestPermission();
    return () => stop();
  }, [available, autoRequest, requestPermission, stop]);

  return { heading, direction, available, permission, requestPermission, stop };
}

/**
 * CompassButton
 * 将指南针按钮封装为独立、可记忆组件，避免其频繁的方向更新导致父组件整体重渲染。
 * - props: { isMobile: boolean, prefersDark: boolean }
 * - 内部使用 useCompassHeading 读取设备方向与权限状态
 */
export const CompassButton = React.memo(function CompassButton({ isMobile = false, prefersDark = false }) {
  const { direction, permission, available, requestPermission } = useCompassHeading();
  const [requesting, setRequesting] = useState(false);

  const labelText = direction ?? '北';
  const status = permission === 'granted'
    ? ''
    : (requesting
        ? '（请求中）'
        : (permission === 'denied'
            ? '（被拒绝）'
            : (permission === 'error' ? '（错误）' : '（未授权）')));
  const aria = status ? `设备朝向 ${labelText} ${status}` : `设备朝向 ${labelText}`;

  const onClick = async () => {
    if (!available) return;
    if (permission !== 'granted' && typeof requestPermission === 'function') {
      try {
        setRequesting(true);
        await requestPermission();
      } finally {
        setRequesting(false);
      }
    }
  };

  const baseStyle = {
    width: isMobile ? 40 : 44,
    height: isMobile ? 40 : 44,
    borderRadius: 9999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.2s ease, transform 0.12s ease'
  };

  return (
    <button
      type="button"
      id="gm-btn-compass"
      aria-label={aria}
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={(e) => { e.currentTarget.style.background = prefersDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: prefersDark ? '#fff' : '#000' }}>{labelText}</span>
      </span>
    </button>
  );
});
