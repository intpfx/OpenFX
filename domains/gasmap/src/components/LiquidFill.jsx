import React, { useEffect, useRef } from 'react';

// Canvas-based liquid fill component.
// Props:
// - progress: 0..1 fill level
// - width, height: logical size in px
// - fillColor: CSS rgba color for the liquid
// - className: optional wrapper class
const parseRgba = (rgba) => {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m[4] ? parseFloat(m[4]) : 1];
  return [239,68,68,1];
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const rgbaStr = (r,g,b,a) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

const lighten = (rgba, amt, alphaMul=1) => {
  const [r,g,b,a] = parseRgba(rgba);
  return rgbaStr(clamp(r + amt*255,0,255), clamp(g + amt*255,0,255), clamp(b + amt*255,0,255), clamp(a*alphaMul,0,1));
};

const darken = (rgba, amt, alphaMul=1) => {
  const [r,g,b,a] = parseRgba(rgba);
  return rgbaStr(clamp(r - amt*255,0,255), clamp(g - amt*255,0,255), clamp(b - amt*255,0,255), clamp(a*alphaMul,0,1));
};

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h/2, w/2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export default function LiquidFill({ progress = 0, width = 0, height = 0, fillColor = 'rgba(239,68,68,0.95)', className = '' }){
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let mounted = true;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    const resize = () => {
      // if width/height not provided, measure parent
      let w = width;
      let h = height;
      if ((!w || !h) && canvas.parentElement) {
        const rect = canvas.parentElement.getBoundingClientRect();
        w = Math.round(rect.width) || 120;
        h = Math.round(rect.height) || 44;
      }
      w = Math.max(1, Math.round(w || 120));
      h = Math.max(1, Math.round(h || 44));

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const baseColor = fillColor;

    function draw(time) {
      if (!mounted) return;
      const t = time / 1000;
      // determine logical width/height from canvas CSS size
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;

      ctx.clearRect(0,0,W,H);

      // clip to rounded rect
      ctx.save();
      roundRectPath(ctx, 0, 0, W, H, Math.min(12, H/2));
      ctx.clip();

      // Fill background subtle (transparent)
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(0,0,W,H);

      const baseY = H * (1 - progress);

      // layered waves
      const waves = 3;
      for (let i = 0; i < waves; i++){
        const phase = t * (0.6 + i*0.4) * (1 + i*0.3) * 2 * Math.PI;
        const amp = (Math.max(4, H*0.08) + i*(H*0.03)) * (1 - Math.pow(progress, 0.6));
        const freq = 1.2 + i*0.7 + Math.sin(t*0.4 + i) * 0.15;

        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x=0; x<=W; x+=2){
          const nx = x/W;
          const y = baseY + Math.sin(nx * freq * 2 * Math.PI + phase + i) * amp;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, baseY - Math.max(30, H*0.2), 0, baseY + Math.max(30, H*0.2));
        grad.addColorStop(0, lighten(baseColor, 0.06, 1));
        grad.addColorStop(0.6, baseColor);
        grad.addColorStop(1, darken(baseColor, 0.04, 1));

        ctx.fillStyle = grad;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fill();
      }

      // no glossy highlight — keep natural liquid look
      ctx.restore();

      // subtle border
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      roundRectPath(ctx, 0.5, 0.5, W-1, H-1, Math.min(12, H/2));
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [progress, width, height, fillColor]);

  return (
    <canvas ref={canvasRef} className={className} style={{ display: 'block', borderRadius: 9999 }} />
  );
}
