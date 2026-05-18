import { useSignal, useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { currentBrand, uiBrand } from "./state.ts";

const NOISE_CHARS = "!@#$%^&*<>?[]{}|0123456789";
function rngChar() {
  return NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
}
function isAnchor(ch: string) {
  const c = ch.toUpperCase();
  return c === "F" || c === "X" || c === "O";
}

export default function BrandToggle() {
  const textRef = useRef<HTMLSpanElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const ghostR = useRef<HTMLDivElement>(null);
  const ghostB = useRef<HTMLDivElement>(null);
  const timeoutIds = useRef<number[]>([]);
  const frameIds = useRef<number[]>([]);
  const ghostIntervalId = useRef<number | null>(null);
  const busy = useSignal(false);

  function trackTimeout(callback: () => void, delay: number) {
    const id = window.setTimeout(() => {
      timeoutIds.current = timeoutIds.current.filter((value) => value !== id);
      callback();
    }, delay);
    timeoutIds.current.push(id);
    return id;
  }

  function clearScheduledWork() {
    for (const id of timeoutIds.current) {
      clearTimeout(id);
    }
    timeoutIds.current = [];

    for (const id of frameIds.current) {
      cancelAnimationFrame(id);
    }
    frameIds.current = [];

    if (ghostIntervalId.current !== null) {
      clearInterval(ghostIntervalId.current);
      ghostIntervalId.current = null;
    }
  }

  function getCharSpans() {
    return Array.from(
      textRef.current?.querySelectorAll<HTMLSpanElement>(".glitch-char") ?? [],
    );
  }

  function readWord() {
    return getCharSpans().map((span) => span.textContent ?? "").join("");
  }

  function reindexSpans() {
    getCharSpans().forEach((span, index) => {
      span.dataset.idx = String(index);
    });
  }

  function isAccentChar(word: string, ch: string) {
    return (word === "FENGXIAO" && ch === "O") ||
      (word === "OpenFX" && (ch === "F" || ch === "X"));
  }

  function scheduleAlign(word: string) {
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => {
        frameIds.current = frameIds.current.filter((value) => value !== second);
        alignBlock(word);
      });
      frameIds.current.push(second);
      frameIds.current = frameIds.current.filter((value) => value !== first);
    });
    frameIds.current.push(first);
  }

  function resetGhosts() {
    const gr = ghostR.current;
    const gb = ghostB.current;
    const container = textRef.current?.parentElement;
    if (!gr || !gb || !container) return;

    gr.textContent = "";
    gb.textContent = "";
    gr.classList.remove("active-r");
    gb.classList.remove("active-b");
    container.classList.remove("glitching");
  }

  function finishAnim(word: "FENGXIAO" | "OpenFX") {
    clearScheduledWork();
    resetGhosts();
    setWord(word);
    scheduleAlign(word);
    currentBrand.value = word;
    uiBrand.value = word;
    busy.value = false;
  }

  // Build styled character spans inside the text element
  function setWord(w: string) {
    const el = textRef.current;
    if (!el) return;
    let html = "";
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      const accent = isAccentChar(w, ch);
      html +=
        `<span class="glitch-char" data-idx="${i}"` +
        (accent ? ` style="color:var(--accent)"` : "") +
        `>${ch}</span>`;
    }
    el.innerHTML = html;
  }

  // Align accent block under the suffix portion (XIAO / FX)
  function alignBlock(w: string) {
    const zone = textRef.current?.parentElement?.parentElement;
    const block = blockRef.current;
    if (!zone || !block) return;
    const spans = textRef.current?.querySelectorAll(".glitch-char");
    if (!spans || !spans.length) return;
    const lastSpan = spans[spans.length - 1] as HTMLElement;
    const zoneRect = zone.getBoundingClientRect();
    const textRight = lastSpan.getBoundingClientRect().right - zoneRect.left;
    const suffix = w === "FENGXIAO" ? "XIAO" : "FX";
    const suffixStart = w.indexOf(suffix);
    if (suffixStart < 0) return;
    const suffixLeft =
      (spans[suffixStart] as HTMLElement).getBoundingClientRect().left -
      zoneRect.left;
    block.style.left = suffixLeft + "px";
    block.style.width = Math.max(textRight - suffixLeft, 20) + "px";
    if (block.style.opacity === "") block.style.opacity = "1";
  }

  // Initial render on mount / signal change
  useSignalEffect(() => {
    const w = currentBrand.value;
    setWord(w);
    scheduleAlign(w);
  });

  useEffect(() => {
    const handleResize = () => {
      const word = readWord();
      if (word) alignBlock(word === "FENGXIAO" ? "FENGXIAO" : "OpenFX");
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearScheduledWork();
    };
  }, []);

  function toggle() {
    if (busy.value) return;
    busy.value = true;
    clearScheduledWork();

    const el = textRef.current;
    const container = el?.parentElement;
    const gr = ghostR.current;
    const gb = ghostB.current;
    if (!el || !container || !gr || !gb) {
      busy.value = false;
      return;
    }

    const curWord = readWord() === "OpenFX" ? "OpenFX" : "FENGXIAO";
    const target: "FENGXIAO" | "OpenFX" =
      curWord === "FENGXIAO" ? "OpenFX" : "FENGXIAO";
    uiBrand.value = target;

    // ── Phase 1: Ghost layers + glitch shake ──
    const noiseLen = Math.max(curWord.length, target.length);
    const makeNoise = () =>
      Array.from({ length: noiseLen }, () => rngChar()).join("");

    gr.textContent = makeNoise();
    gb.textContent = makeNoise();
    gr.classList.add("active-r");
    gb.classList.add("active-b");
    container.classList.add("glitching");

    ghostIntervalId.current = window.setInterval(() => {
      gr.textContent = makeNoise();
      gb.textContent = makeNoise();
    }, 80);

    let t = 0;
    const scheduleAt = (at: number, callback: () => void) => {
      trackTimeout(callback, at);
    };

    if (curWord === "FENGXIAO") {
      const spans = getCharSpans();
      const deleteOrder = [6, 5, 4, 3, 2, 1, 0];

      for (const idx of deleteOrder) {
        const span = spans[idx];
        if (!span) continue;
        const anchor = isAnchor(span.textContent ?? "");
        scheduleAt(t, () => {
          if (anchor) {
            span.classList.add("noise-flash");
            span.textContent = rngChar();
          }
          span.classList.add(anchor ? "anchor-deleting" : "deleting");
          trackTimeout(() => span.remove(), anchor ? 120 : 100);
        });
        t += anchor ? 150 : 120;
      }

      t += 120;
      const typeChars = ["p", "e", "n", "F", "X"];
      typeChars.forEach((ch, index) => {
        const at = t + index * 100;
        const anchor = isAnchor(ch);
        scheduleAt(at, () => {
          const span = document.createElement("span");
          span.className = "glitch-char";
          span.dataset.idx = "99";
          span.textContent = ch;
          if (anchor) {
            span.style.color = "var(--accent)";
            span.classList.add("noise-flash");
            span.textContent = rngChar();
            trackTimeout(() => {
              span.textContent = ch;
              span.classList.remove("noise-flash");
            }, 60);
          }
          span.style.opacity = "0";
          span.style.transform = anchor ? "scale(1.5)" : "translateY(6px)";
          el.append(span);

          const frameId = requestAnimationFrame(() => {
            frameIds.current = frameIds.current.filter((value) => value !== frameId);
            span.classList.add(anchor ? "anchor-typing" : "typing");
          });
          frameIds.current.push(frameId);
        });
      });

      scheduleAt(t + typeChars.length * 100 + 100, () => {
        reindexSpans();
        finishAnim("OpenFX");
      });
      return;
    }

    const spans = getCharSpans();
    const deleteOrder = [3, 2, 1, 0];

    for (const idx of deleteOrder) {
      const span = spans[idx];
      if (!span) continue;
      const anchor = isAnchor(span.textContent ?? "");
      scheduleAt(t, () => {
        if (anchor) {
          span.classList.add("noise-flash");
          span.textContent = rngChar();
        }
        span.classList.add(anchor ? "anchor-deleting" : "deleting");
        trackTimeout(() => span.remove(), anchor ? 120 : 100);
      });
      t += anchor ? 150 : 120;
    }

    t += 150;
    let maxTypeTime = t;

    ["E", "N", "G"].forEach((ch, index) => {
      const at = t + 60 + index * 45;
      maxTypeTime = Math.max(maxTypeTime, at);
      scheduleAt(at, () => {
        const xSpan = getCharSpans().find((span) => span.textContent === "X");
        const span = document.createElement("span");
        span.className = "glitch-char";
        span.dataset.idx = String(1 + index);
        span.textContent = ch;
        span.style.opacity = "0";
        span.style.transform = "translateY(6px)";
        el.insertBefore(span, xSpan ?? null);

        const frameId = requestAnimationFrame(() => {
          frameIds.current = frameIds.current.filter((value) => value !== frameId);
          span.classList.add("typing");
        });
        frameIds.current.push(frameId);
      });
    });

    ["I", "A", "O"].forEach((ch, index) => {
      const at = t + 90 + index * 50;
      const anchor = isAnchor(ch);
      maxTypeTime = Math.max(maxTypeTime, at);
      scheduleAt(at, () => {
        const span = document.createElement("span");
        span.className = "glitch-char";
        span.dataset.idx = String(5 + index);
        span.textContent = ch;
        if (anchor) {
          span.style.color = "var(--accent)";
          span.classList.add("noise-flash");
          span.textContent = rngChar();
          trackTimeout(() => {
            span.textContent = ch;
            span.classList.remove("noise-flash");
          }, 50);
          span.style.opacity = "0";
          span.style.transform = "scale(1.5)";
        } else {
          span.style.opacity = "0";
          span.style.transform = "translateY(6px)";
        }
        el.append(span);

        const frameId = requestAnimationFrame(() => {
          frameIds.current = frameIds.current.filter((value) => value !== frameId);
          span.classList.add(anchor ? "anchor-typing" : "typing");
        });
        frameIds.current.push(frameId);
      });
    });

    scheduleAt(maxTypeTime + 300, () => {
      reindexSpans();
      finishAnim("FENGXIAO");
    });
  }

  return (
    <div class="brand-zone">
      <div
        class="brand-word"
        id="brandWord"
        onClick={toggle}
        title="Click to toggle"
      >
        <span class="brand-text" ref={textRef} />
        <div class="glitch-ghost" ref={ghostR} />
        <div class="glitch-ghost" ref={ghostB} />
      </div>
      <div class="brand-block" ref={blockRef} />
    </div>
  );
}
