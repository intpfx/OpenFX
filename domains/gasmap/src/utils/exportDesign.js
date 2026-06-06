// compose two view images (plane/system) on the left and statistics on the right
import { applyWatermarkToCanvas } from './watermark.js';
import watermarkConfig from '../config/watermark.json' assert { type: 'json' };

export default async function exportDesign({ planeBlob, systemBlob, lengths = {}, fittings = {}, devices = {}, projectName = '设计导出', dpi = 300, orientation = 'landscape', preview = false, addWatermark = false } = {}) {
  const loadImage = (blob) => new Promise((resolve, reject) => {
    if (!blob) return resolve(null);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });

  const planeImg = await loadImage(planeBlob);
  const systemImg = await loadImage(systemBlob);

  // right column settings
  const rightW = 360; // px
  const padding = 20;
  const cardGap = 12;

  // layout: top area split into left (系统图) and right (平面图), bottom area for statistics treemap
  const singleTopW = Math.max((planeImg?.width || 600), (systemImg?.width || 600));
  const topW = Math.max(800, Math.round(singleTopW * 2));
  const topH = Math.max((planeImg?.height || 400), (systemImg?.height || 400));
  const bottomH = Math.max(280, Math.round(topH * 0.6));

  // If adding watermark, estimate and reserve bottom contact block height
  let reservedContactH = 0;
  if (addWatermark) {
    try {
      // use top area width as estimate (canvasW not available yet at this point)
      const logicalWidthEstimate = Math.max(1, topW - padding * 2);
      const numLines = (Array.isArray(watermarkConfig.bottomLines) ? watermarkConfig.bottomLines.length : 1) || 1;
      const autoBottomFont = Math.max(12, Math.round(logicalWidthEstimate * 0.012));
      const qrSize = Math.min(160, Math.max(64, Math.round(logicalWidthEstimate * 0.12)));
      // prefer configured contact gap from watermark config if present
      const cfgGap = (watermarkConfig && typeof watermarkConfig.contactGap === 'number') ? watermarkConfig.contactGap : Math.round(autoBottomFont * 1.2);
      const gap = Math.max(4, Math.round(cfgGap));
      reservedContactH = qrSize + gap + (autoBottomFont * numLines) + padding; // include extra padding
    } catch (e) {
      reservedContactH = 100;
    }
  }

  // compute right content grouped by category (管材 / 管件 / 设备)
  const entries = {
    pipe: Object.entries(lengths).map(([k, v]) => ({ label: k, value: typeof v === 'number' ? v.toFixed(2) : String(v) })),
    fitting: Object.entries(fittings).map(([k, v]) => ({ label: k, value: String(v) })),
    device: Object.entries(devices).map(([k, v]) => ({ label: k, value: String(v) })),
  };

  // treemap layout will be computed later for the bottom area

  const canvasW = Math.max(1000, topW + padding * 2);
  const canvasH = topH + bottomH + padding * 3 + reservedContactH;

  const cvs = document.createElement('canvas');
  cvs.width = Math.max(1, Math.floor(canvasW));
  cvs.height = Math.max(1, Math.floor(canvasH));
  const ctx = cvs.getContext('2d');

  // Leave canvas background transparent (do not fill)

  // left column origin
  const leftX = padding;
  const leftY = padding;

  // helper to draw images scaled into a box
  const drawScaled = (img, dx, dy, maxW, maxH) => {
    if (!img) return { w: maxW, h: maxH };
    const ratio = Math.min(maxW / img.width, maxH / img.height);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    ctx.drawImage(img, dx + Math.round((maxW - w) / 2), dy + Math.round((maxH - h) / 2), w, h);
    return { w: maxW, h: maxH };
  };

  // draw top area: left = 系统图, right = 平面图 (no rounded borders)
  const topX = leftX;
  const topY = leftY;
  const halfW = Math.round((cvs.width - padding * 2) / 2);
  const systemAreaX = topX;
  const systemAreaY = topY;
  const systemAreaW = halfW;
  const systemAreaH = topH;
  const planeAreaX = topX + halfW;
  const planeAreaY = topY;
  const planeAreaW = halfW;
  const planeAreaH = topH;

  // draw images into their respective halves without border
  drawScaled(systemImg, systemAreaX, systemAreaY, systemAreaW, systemAreaH);
  drawScaled(planeImg, planeAreaX, planeAreaY, planeAreaW, planeAreaH);

  // font and spacing scale: export currently uses a single output sizing (DP/screen).
  // Keep fontScale fixed at 1 to avoid per-paper scaling logic.
  const fontScale = 1;
  const titleFontSize = Math.max(14, Math.round(16 * fontScale));
  // project name under top images should use same font size as title
  const projectNameFontSize = titleFontSize;
  const itemFontSize = Math.max(12, Math.round(14 * fontScale));
  // New approach: Make stats font size noticeably larger than the project name.
  const statsFontSize = Math.max(54, Math.round(60 * fontScale));
  const slicePad = Math.max(8, Math.round(8 * fontScale));
  const itemGap = Math.max(4, Math.round(4 * fontScale));
  const minItemBarH = Math.max(Math.round(itemFontSize * 1.4), 18);

  // no project name shown here (removed per design). place stats directly below top area
  // bottom area: render statistics using the same card/grid style as the in-app 数据面板
  const bottomX = leftX;
  // move the bottom drawing region up by reservedContactH so contact block (QR/email)
  // sits clear at the very bottom and does not overlap the cards above.
  const bottomY = topY + topH + padding;
  const bottomW = cvs.width - padding * 2;
  const bottomAreaH = bottomH;

  

  // prepare numeric entries (fallback to 0 when not numeric)
  const raw = {
    pipe: Object.entries(lengths).map(([k, v]) => ({ label: k, value: (typeof v === 'number' ? v : Number(v)) || 0 })),
    fitting: Object.entries(fittings).map(([k, v]) => ({ label: k, value: (typeof v === 'number' ? v : Number(v)) || 0 })),
    device: Object.entries(devices).map(([k, v]) => ({ label: k, value: (typeof v === 'number' ? v : Number(v)) || 0 })),
  };

  const categoryTotals = {
    pipe: raw.pipe.reduce((s, it) => s + (it.value || 0), 0),
    fitting: raw.fitting.reduce((s, it) => s + (it.value || 0), 0),
    device: raw.device.reduce((s, it) => s + (it.value || 0), 0),
  };
  const totalAll = categoryTotals.pipe + categoryTotals.fitting + categoryTotals.device || 0;

  const colorMap = { pipe: '#0ea5e9', fitting: '#7c3aed', device: '#16a34a' };

  // draw statistics panel that mirrors the in-app 数据面板 cards (管材长度 / 管件 / 设备)
  const sectionGap = Math.max(12, Math.round(12 * fontScale));
  const cardGapPx = Math.max(10, Math.round(10 * fontScale));
  const minCardW = Math.max(180, Math.round(180 * fontScale));
  const cols = Math.max(1, Math.min(4, Math.floor((bottomW + cardGapPx) / (minCardW + cardGapPx))));
  const cardW = Math.floor((bottomW - (cols - 1) * cardGapPx) / cols);
  let cursorY = bottomY;

  // section headers removed by request - we display only the cards

  // helper to draw a single card (label left, value right)
  function drawCard(x, y, w, h, label, value, bgColor) {
    const borderRadius = 48;
    // card background
    if (bgColor) {
      ctx.fillStyle = bgColor;
    } else {
      ctx.fillStyle = '#ffffff';
    }
    roundRect(ctx, x, y, w, h, borderRadius, true, false);
    // border
    ctx.lineWidth = 1;
    ctx.strokeStyle = bgColor ? hexToRgba(bgColor, 0.9) : '#e6eef8';
    roundRect(ctx, x, y, w, h, borderRadius, false, true);
    // label
    ctx.fillStyle = bgColor ? '#ffffff' : '#64748b';
    ctx.font = `600 ${statsFontSize}px system-ui, -apple-system, "Segoe UI", Roboto, Arial`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const pad = Math.round(12 * fontScale);
    const textY = y + Math.round(h / 2);
    ctx.fillText(label, x + pad, textY);
    // value
    ctx.fillStyle = bgColor ? '#ffffff' : '#111827';
    ctx.font = `700 ${statsFontSize}px system-ui, -apple-system, "Segoe UI", Roboto, Arial`;
    ctx.textAlign = 'right';
    ctx.fillText(String(value), x + w - pad, textY);
  }

  // section: 管材长度统计 (headers removed)
  // grid of cards for lengths
  const lengthEntries = Object.entries(lengths || {});
  for (let i = 0; i < lengthEntries.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = bottomX + col * (cardW + cardGapPx);
    const y = cursorY + row * (Math.max(64, Math.round(statsFontSize * 2.8)) + cardGapPx);
    drawCard(x, y, cardW, Math.max(64, Math.round(statsFontSize * 2.8)), lengthEntries[i][0], (typeof lengthEntries[i][1] === 'number') ? lengthEntries[i][1].toFixed(2) : String(lengthEntries[i][1]), colorMap.pipe);
  }
  cursorY += Math.ceil(lengthEntries.length / cols) * (Math.max(64, Math.round(statsFontSize * 2.8)) + cardGapPx) + sectionGap;

  // section: 管件数量统计 (headers removed)
  const fittingEntries = Object.entries(fittings || {});
  for (let i = 0; i < fittingEntries.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = bottomX + col * (cardW + cardGapPx);
    const y = cursorY + row * (Math.max(64, Math.round(statsFontSize * 2.8)) + cardGapPx);
    drawCard(x, y, cardW, Math.max(64, Math.round(statsFontSize * 2.8)), fittingEntries[i][0], String(fittingEntries[i][1]), colorMap.fitting);
  }
  cursorY += Math.ceil(fittingEntries.length / cols) * (Math.max(64, Math.round(statsFontSize * 2.8)) + cardGapPx) + sectionGap;

  // section: 设备数量统计 (headers removed)
  const deviceEntries = Object.entries(devices || {});
  if (deviceEntries.length === 0) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = `400 ${statsFontSize}px system-ui, -apple-system, "Segoe UI", Roboto, Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('暂无设备数据', bottomX + Math.round(bottomW / 2), cursorY + Math.round(statsFontSize));
    cursorY += Math.round(statsFontSize * 2.2) + sectionGap;
  } else {
    for (let i = 0; i < deviceEntries.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = bottomX + col * (cardW + cardGapPx);
      const y = cursorY + row * (Math.max(64, Math.round(statsFontSize * 2.8)) + cardGapPx);
      drawCard(x, y, cardW, Math.max(64, Math.round(statsFontSize * 2.8)), deviceEntries[i][0], String(deviceEntries[i][1]), colorMap.device);
    }
    cursorY += Math.ceil(deviceEntries.length / cols) * (Math.max(64, Math.round(statsFontSize * 2.8)) + cardGapPx) + sectionGap;
  }

  // helper: convert hex to rgba with alpha
  function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // number formatter for display
  function formatValue(v) {
    if (v == null || Number.isNaN(v)) return '';
    if (typeof v === 'number') {
      const abs = Math.abs(v);
      if (abs === 0) return '0';
      if (abs >= 1000) return Math.round(v).toString();
      if (abs >= 100) return v.toFixed(1);
      return v.toFixed(2);
    }
    const n = Number(v);
    if (!Number.isNaN(n)) return formatValue(n);
    return String(v);
  }

  // fit text into width with ellipsis
  function ellipsize(ctx, text, maxWidth) {
    if (maxWidth <= 0) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;
    const ell = '…';
    const ellW = ctx.measureText(ell).width;
    let lo = 0, hi = text.length; // binary search for max fit length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const t = text.slice(0, mid) + ell;
      if (ctx.measureText(t).width <= maxWidth) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo) + ell;
  }

  // binary-search font size that allows `text` to fit into `maxWidth` (px)
  function fitFontSizeForWidth(ctx, text, maxWidth, maxSizePx, minSizePx, weight = '600') {
    if (maxWidth <= 0) return minSizePx;
    const family = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
    // quick reject: if maxSize already fits, return it
    ctx.font = `${weight} ${maxSizePx}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return maxSizePx;
    // if minSize still too large, return minSizePx (caller will ellipsize)
    ctx.font = `${weight} ${minSizePx}px ${family}`;
    if (ctx.measureText(text).width > maxWidth) return minSizePx;
    // binary search integer font px
    let lo = minSizePx, hi = maxSizePx;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      ctx.font = `${weight} ${mid}px ${family}`;
      if (ctx.measureText(text).width <= maxWidth) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === 'undefined') r = 5;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // optionally add watermark and bottom contact info using shared helper
  if (addWatermark) {
    try {
      const scale = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
      // pass config options into the helper so it respects pad/contactGap/qrBg settings
      await applyWatermarkToCanvas(cvs, {
        wmText: 'FENG XIAO',
        bottomLines: Array.isArray(watermarkConfig.bottomLines) ? watermarkConfig.bottomLines : ['intpfx@icloud.com', 'https://github.com/intpfx'],
        scale,
        contactGap: watermarkConfig.contactGap,
        pad: watermarkConfig.pad,
        qrBgColor: watermarkConfig.qrBgColor,
        qrBgPad: watermarkConfig.qrBgPad,
        qrBgRadius: watermarkConfig.qrBgRadius,
        qrPosition: watermarkConfig.qrPosition,
        // exportDesign already reserved bottom space; avoid double-reserve here
        ensureSpace: false
      });
    } catch (e) { /* ignore watermark errors */ }
  }

  if (preview) {
    // return the canvas element for preview
    return cvs;
  }

  // download (default behavior)
  return new Promise((resolve) => {
    cvs.toBlob((blob) => {
      if (!blob) return resolve(false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName || '设计'}_export_${new Date().toISOString().slice(0,10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      resolve(true);
    }, 'image/png');
  });
}
