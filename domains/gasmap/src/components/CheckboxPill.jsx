import React from 'react';

export default function CheckboxPill({ id, checked, onChange, children, ariaLabel, prefersDark = false }) {
  const bg = checked
    ? (prefersDark ? 'linear-gradient(90deg,#34d399,#10b981)' : 'linear-gradient(90deg,#10b981,#34d399)')
    : (prefersDark ? '#374151' : '#e5e7eb');
  const color = checked ? '#ffffff' : (prefersDark ? '#e5e7eb' : '#0f172a');

  return (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!checked); } }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0,
        padding: '6px 10px',
        borderRadius: 9999,
        background: bg,
        color,
        border: 'none',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 700,
        transition: 'background 0.18s ease, transform 0.12s ease'
      }}
    >
      <span>{children}</span>
    </button>
  );
}
