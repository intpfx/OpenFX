import QRCode from 'qrcode';
import watermarkConfig from '../config/watermark.json' assert { type: 'json' };

export async function applyWatermarkToCanvas(cvs, options = {}) {
  if (!cvs || !cvs.getContext) return;
  let ctx = cvs.getContext('2d');
  if (options && options.debug && typeof document !== 'undefined') {
    try {
      const mk = document.createElement('div'); mk.id = 'wm-debug-invoked'; mk.textContent = 'wm invoked'; mk.style.position='fixed'; mk.style.left='20px'; mk.style.top='140px'; mk.style.background='rgba(0,0,0,0.7)'; mk.style.color='#fff'; mk.style.padding='4px 6px'; mk.style.zIndex=9999999;
      const prev = document.getElementById('wm-debug-invoked'); if (prev) prev.remove(); document.body.appendChild(mk);
    } catch (e) { /* noop */ }
  }
  // Merge options with centralized config (options override config)
  const cfg = watermarkConfig || {};
  const {
    wmText: cfgWmText,
    opacity: cfgOpacity,
    bottomLines: cfgBottomLines,
    wmFontSize: cfgWmFontSize,
    bottomFontSize: cfgBottomFontSize,
    qrPosition: cfgQrPosition,
    qrBgColor: cfgQrBgColor,
    qrBgPad: cfgQrBgPad,
    qrBgRadius: cfgQrBgRadius,
    contactGap: cfgContactGap
  } = cfg;

  const {
    wmText: optWmText,
    opacity: optOpacity,
    bottomLines: optBottomLines,
    wmFontSize: optWmFontSize,
    bottomFontSize: optBottomFontSize
  } = options || {};

  const wmText = (typeof optWmText === 'string') ? optWmText : (cfgWmText || 'FENG XIAO');
  const opacity = (typeof optOpacity === 'number') ? optOpacity : (typeof cfgOpacity === 'number' ? cfgOpacity : 0.10);
  const bottomLines = (typeof optBottomLines !== 'undefined') ? optBottomLines : (Array.isArray(cfgBottomLines) ? cfgBottomLines : ['intpfx@icloud.com', 'https://github.com/intpfx']);
  const wmFontSize = (typeof optWmFontSize === 'number') ? optWmFontSize : cfgWmFontSize;
  const bottomFontSize = (typeof optBottomFontSize === 'number') ? optBottomFontSize : cfgBottomFontSize;
  // Always prefer an explicit scale passed in; otherwise use devicePixelRatio for crisp exports
  const scale = (options && typeof options.scale === 'number' && options.scale > 0)
    ? options.scale
    : (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
  const qrPosition = (options && typeof options.qrPosition === 'string') ? options.qrPosition : (cfgQrPosition || 'left');
  const debug = !!(options && options.debug);

  try {
    // Compute sizing in advance so we can optionally extend the canvas to make room
    const initialPixelW = Math.round(cvs.width);
    const initialPixelH = Math.round(cvs.height);
    const initialLogicalW = Math.max(1, Math.round(initialPixelW / scale));
    // contact block sizing (logical units)
    const autoBottomFontPre = bottomFontSize || Math.max(12, Math.round(initialLogicalW * 0.012));
    const padLogicalOpt = (typeof options.pad === 'number') ? options.pad : (typeof cfg.pad === 'number' ? cfg.pad : 20);
    const gapLogicalOpt = (typeof options.contactGap === 'number') ? options.contactGap : (typeof cfgContactGap === 'number' ? cfgContactGap : Math.round(autoBottomFontPre * 1.2));
    const qrSizeLogicalPre = Math.min(160, Math.max(64, Math.round(initialLogicalW * 0.12)));
    const ensureSpace = options && Object.prototype.hasOwnProperty.call(options, 'ensureSpace') ? !!options.ensureSpace : true;
    const extraBottomLogical = ensureSpace ? (qrSizeLogicalPre + Math.max(4, Math.round(gapLogicalOpt)) + autoBottomFontPre + Math.max(0, Math.round(padLogicalOpt))) : 0;
    if (extraBottomLogical > 0) {
      // Copy original into a temp canvas, then extend height and redraw to make bottom space
      const tmp = document.createElement('canvas');
      tmp.width = cvs.width;
      tmp.height = cvs.height;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(cvs, 0, 0);
      const addPx = Math.round(extraBottomLogical * scale);
      cvs.height = initialPixelH + addPx;
      // width unchanged; height extended only at bottom
      ctx = cvs.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0);
    }

    // We'll draw the watermark and contact block onto an overlay canvas in pixel coordinates
    // and then composite it onto the provided canvas. This guarantees the watermark sits
    // on top of existing content regardless of when this function is called.
    const overlay = document.createElement('canvas');
    overlay.width = cvs.width;
    overlay.height = cvs.height;
    const octx = overlay.getContext('2d');
    if (!octx) return;
    // disable smoothing so QR stays crisp when scaled
    octx.imageSmoothingEnabled = false;
    octx.msImageSmoothingEnabled = false;

    octx.save();
    octx.fillStyle = `rgba(148,163,184,${opacity})`;
    // Work primarily in pixel coordinates to avoid fractional positioning which
    // causes blurry/soft text. cvs.width/cvs.height are already in device pixels.
    const pixelW = Math.round(cvs.width);
    const pixelH = Math.round(cvs.height);
    const logicalWidth = Math.max(1, Math.round(pixelW / scale));
    const logicalHeight = Math.max(1, Math.round(pixelH / scale));
    const autoWmFont = Math.max(18, Math.round((wmFontSize || Math.max(18, Math.round(logicalWidth * 0.02)))));
    // set font in pixel units so measurements match drawing on overlay
    octx.font = `${Math.round(autoWmFont * scale)}px system-ui, -apple-system, "Segoe UI", Roboto, Arial`;
    octx.textBaseline = 'middle';
    // measure in pixels
    const tm = octx.measureText(wmText);
    const textWpx = Math.ceil(tm.width);
    const textHpx = Math.ceil(autoWmFont * 1.2 * scale);
    const spacingXpx = textWpx + Math.round(80 * scale);
    const spacingYpx = textHpx + Math.round(60 * scale);
    // rotate/translate using pixel coordinates
    octx.save();
    octx.translate(Math.round(pixelW / 2), Math.round(pixelH / 2));
    octx.rotate(-Math.PI / 4);
    const span = Math.ceil((pixelW + pixelH) * 1.25);
    const startXpx = -span;
    const endXpx = span;
    const startYpx = -span;
    const endYpx = span;
    for (let x = startXpx; x < endXpx; x += spacingXpx) {
      for (let y = startYpx; y < endYpx; y += spacingYpx) {
        octx.fillText(wmText, Math.round(x), Math.round(y));
      }
    }
    octx.restore();
    octx.restore();

    // bottom contact info: text (left) + QR + email (bottom-left fixed)
    octx.save();
    octx.fillStyle = '#94a3b8';
    const autoBottomFont = bottomFontSize || Math.max(12, Math.round(logicalWidth * 0.012));
    octx.font = `${Math.round(autoBottomFont * scale)}px system-ui, -apple-system, "Segoe UI", Roboto, Arial`;
    octx.textAlign = 'left';
    // left/right padding in logical units (configurable)
    const padLogical = (typeof options.pad === 'number') ? options.pad : (typeof cfg.pad === 'number' ? cfg.pad : 20);
    const pad = Math.max(0, Math.round(padLogical));
    // compute a safe bottom baseline in logical units and convert to pixels when drawing
    // ensure we leave space for QR + email so the contact block won't overlap other content
    const padPx = Math.round(pad * scale);

    // split lines into URL lines, email lines, and other text lines
    const lines = Array.isArray(bottomLines) ? bottomLines.slice() : (typeof bottomLines === 'string' ? [bottomLines] : []);
    if (debug && typeof document !== 'undefined') {
      try {
        const m = document.createElement('div');
        m.id = 'wm-debug-lines';
        m.style.position = 'fixed'; m.style.left = '20px'; m.style.top = '180px'; m.style.padding = '6px 8px'; m.style.background = 'rgba(0,0,0,0.6)'; m.style.color = '#fff'; m.style.zIndex = 9999999;
        m.textContent = `wm-debug: lines=${lines.length} url=${lines.filter(l=>/^https?:\/\//i.test(l)).length}`;
        const prev = document.getElementById('wm-debug-lines'); if (prev) prev.remove(); document.body.appendChild(m);
      } catch (e) { /* noop */ }
    }
    const urlLines = lines.filter(l => (typeof l === 'string' && /^https?:\/\//i.test(l)));
    const emailLines = lines.filter(l => (typeof l === 'string' && /@/.test(l)));
    const textLines = lines.filter(l => !(typeof l === 'string' && (/^https?:\/\//i.test(l) || /@/.test(l))));

    // Choose QR size (logical units) then compute pixel sizes
    const qrSize = Math.min(160, Math.max(64, Math.round(logicalWidth * 0.12)));
    const qrPx = Math.max(1, Math.round(qrSize * scale));
    // gap in logical units between QR and email / text; prefer configured value
    const gapLogical = (typeof options.contactGap === 'number') ? options.contactGap : (typeof cfgContactGap === 'number' ? cfgContactGap : Math.round(autoBottomFont * 1.2));
    const gap = Math.max(4, Math.round(gapLogical));
    // reserve vertical space for the contact block (logical units)
    const contactBlockH = qrSize + gap + autoBottomFont;
    // baseline for left stacked text (logical units)
    const leftTextBaselineLogical = logicalHeight - (pad + contactBlockH) - Math.round(autoBottomFont * 0.5);
    // draw left stacked text lines (pixel-positioned) above the contact block
    for (let i = 0; i < textLines.length; i++) {
      const yLogical = leftTextBaselineLogical + (i * (autoBottomFont + 6));
      octx.fillText(String(textLines[i]), padPx, Math.round(yLogical * scale));
    }

    // attempt to draw QR for first URL fixed at bottom-left
    let qrRendered = false;
    let qrArea = null; // { dx, dy, size } in logical units
    if (urlLines.length > 0) {
      const url = String(urlLines[0]);
      try {
        // debug: record QR generation attempt
        // eslint-disable-next-line no-console
        console.debug && console.debug('[watermark] attempting QR generation for', url, { qrSize, qrPx, qrPosition });
        const qrCanvas = document.createElement('canvas');
        qrCanvas.width = qrPx;
        qrCanvas.height = qrPx;
        // ensure QR is generated at high pixel density
        await QRCode.toCanvas(qrCanvas, url, { margin: 0, width: qrPx, color: { dark: '#0f172a', light: '#ffffff' } });
        if (debug && typeof document !== 'undefined') {
          try {
            const qctx = qrCanvas.getContext('2d');
            const imgd = qctx.getImageData(0,0,qrCanvas.width, qrCanvas.height).data;
            let nonWhiteCount = 0;
            for (let i = 0; i < imgd.length; i += 4) {
              const r = imgd[i], g = imgd[i+1], b = imgd[i+2], a = imgd[i+3];
              if (a > 10 && (r < 250 || g < 250 || b < 250)) nonWhiteCount++;
            }
            // append to document to visually inspect
            qrCanvas.style.position = 'fixed';
            qrCanvas.style.right = '20px';
            qrCanvas.style.top = '220px';
            qrCanvas.style.border = '2px solid #4caf50';
            qrCanvas.id = 'wm-debug-qr';
            // remove any previous debug QR
            const prev = document.getElementById('wm-debug-qr'); if (prev && prev !== qrCanvas) try { prev.remove(); } catch (e) {}
            document.body.appendChild(qrCanvas);
            // eslint-disable-next-line no-console
            console.debug && console.debug('[watermark][debug] qr nonWhiteCount', nonWhiteCount, 'size', qrCanvas.width);
          } catch (e) { /* noop */ }
        }
        // compute dx/dy based on qrPosition
        let dxLogical = pad;
        if (qrPosition === 'right') dxLogical = Math.max(0, logicalWidth - pad - qrSize);
        // position QR so that there is guaranteed room for `gap + autoBottomFont` underneath
        const dyLogical = Math.max(0, logicalHeight - pad - autoBottomFont - gap - qrSize);
        // draw a slightly larger white rounded rectangle as background/border for the QR
        const rectPadLogical = (typeof options.qrBgPad === 'number') ? options.qrBgPad : (typeof cfgQrBgPad === 'number' ? cfgQrBgPad : 6);
        const rectPad = Math.max(1, Math.round(rectPadLogical)); // logical units padding around QR
        const rectXpx = Math.round((dxLogical - rectPad) * scale);
        const rectYpx = Math.round((dyLogical - rectPad) * scale);
        const rectSizePx = Math.round((qrSize + rectPad * 2) * scale);
        const rrPx = Math.max(2, Math.round((typeof options.qrBgRadius === 'number' ? options.qrBgRadius : (typeof cfgQrBgRadius === 'number' ? cfgQrBgRadius : 8)) * scale));
        // background color (configurable)
        const qrBgColor = (typeof options.qrBgColor === 'string') ? options.qrBgColor : (typeof cfgQrBgColor === 'string' ? cfgQrBgColor : '#ffffff');
        // background
        octx.save();
        octx.fillStyle = qrBgColor;
        // draw rounded rect in pixel coords
        octx.beginPath();
        octx.moveTo(rectXpx + rrPx, rectYpx);
        octx.arcTo(rectXpx + rectSizePx, rectYpx, rectXpx + rectSizePx, rectYpx + rectSizePx, rrPx);
        octx.arcTo(rectXpx + rectSizePx, rectYpx + rectSizePx, rectXpx, rectYpx + rectSizePx, rrPx);
        octx.arcTo(rectXpx, rectYpx + rectSizePx, rectXpx, rectYpx, rrPx);
        octx.arcTo(rectXpx, rectYpx, rectXpx + rectSizePx, rectYpx, rrPx);
        octx.closePath();
        octx.fill();
        octx.restore();
        // drawImage using pixel coords (QR on top of white bg)
        octx.drawImage(qrCanvas, Math.round(dxLogical * scale), Math.round(dyLogical * scale), qrPx, qrPx);
        // eslint-disable-next-line no-console
        console.debug('[watermark] QR drawn at', { dxLogical, dyLogical, qrSize, qrPx });
        qrRendered = true;
        qrArea = { dx: dxLogical, dy: dyLogical, size: qrSize };
      } catch (qrErr) {
        // fallback: render the URL text if QR generation fails
        // eslint-disable-next-line no-console
        console.warn('[watermark] QR generation failed, falling back to text', qrErr);
        const txtY = leftTextBaselineLogical + (textLines.length * (autoBottomFont + 6));
        octx.fillText(url, padPx, Math.round(txtY * scale));
      }
    }

    // debug visual marker for where QR would be drawn
    if (debug && qrArea) {
      octx.save();
      octx.strokeStyle = 'rgba(255,0,0,0.9)';
      octx.lineWidth = Math.max(2, Math.round(2 * scale));
      octx.strokeRect(Math.round(qrArea.dx * scale), Math.round(qrArea.dy * scale), Math.round(qrArea.size * scale), Math.round(qrArea.size * scale));
      octx.fillStyle = 'rgba(255,0,0,0.9)';
      octx.font = `${Math.max(10, Math.round(10 * scale))}px sans-serif`;
      octx.fillText('QR', Math.round((qrArea.dx + 4) * scale), Math.round((qrArea.dy + 14) * scale));
      octx.restore();
    }

    // if an email exists, place it under the QR (centered). If QR wasn't rendered, fall back to left-stack.
    if (emailLines.length > 0) {
      const email = String(emailLines[0]);
      if (qrRendered && qrArea) {
        octx.save();
        octx.textAlign = 'center';
        octx.textBaseline = 'top';
        let emailX = Math.round((qrArea.dx + Math.round(qrArea.size / 2)) * scale);
        // compute email Y in logical units: prefer placing the email directly
        // under the QR with the configured gap (this is the user-visible
        // control they asked for). If that would overflow the canvas bottom,
        // clamp the email so it stays fully visible.
        // note: when drawing we use `textBaseline = 'top'`, so the top of the
        // email text must not go past (logicalHeight - pad - fontHeight).
        const maxEmailTopLogical = logicalHeight - pad - autoBottomFont;
        const preferredEmailTopLogical = qrArea.dy + qrArea.size + gap;
        // ensure the email never overlaps the QR by clamping to be at least just below the QR
        const emailYLogical = Math.max(qrArea.dy + qrArea.size + 2, Math.min(maxEmailTopLogical, preferredEmailTopLogical));
        let emailY = Math.round(emailYLogical * scale);
        octx.fillText(email, emailX, emailY);
        octx.restore();
      } else {
        // fallback: draw email in left column stacked after other text lines
        const idx = textLines.length;
        const yLogical = leftTextBaselineLogical + (idx * (autoBottomFont + 6));
        octx.fillText(email, padPx, Math.round(yLogical * scale));
      }
    }

    octx.restore();

    // Composite overlay onto the original canvas to ensure watermark is on top.
    // Important: the caller may have a transformed/ scaled context (e.g. ctx.scale(scale, scale)).
    // Reset the transform to identity when drawing the overlay so the overlay is placed
    // in device pixels as intended, then restore the original transform.
    try {
      // Save current state, reset transform, draw at full pixel size, then restore.
      ctx.save();
      // Reset transform to identity so drawImage maps overlay pixels 1:1 to canvas pixels
      if (typeof ctx.setTransform === 'function') {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(overlay, 0, 0);
      ctx.restore();
    } catch (drawErr) {
      // eslint-disable-next-line no-console
      console.warn('[watermark] composite failed', drawErr);
    }
  } catch (e) {
    // swallow errors to avoid breaking export flow
    // eslint-disable-next-line no-console
    console.warn('[watermark] apply failed', e);
  }
}

export default applyWatermarkToCanvas;
