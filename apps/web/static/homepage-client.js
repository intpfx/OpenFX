const NOISE_CHARS = "!@#$%^&*<>?[]{}|0123456789";
const SCRAMBLE_CHARS = "░▒▓█";
const state = {
  currentBrand: "FENGXIAO",
  uiBrand: "FENGXIAO",
  busy: false,
  inlineUnlockOpen: false,
  timeoutIds: [],
  frameIds: [],
  ghostIntervalId: null,
  unlockedProjectIds: [],
};

const elements = {
  brandWord: document.querySelector("#brandWord"),
  brandText: document.querySelector("#brandText"),
  brandBlock: document.querySelector("#brandBlock"),
  ghostR: document.querySelector("#brandGhostR"),
  ghostB: document.querySelector("#brandGhostB"),
  controlCluster: document.querySelector(".control-cluster"),
  primaryControl: document.querySelector("#homepagePrimaryControl"),
  primaryControlLabel: document.querySelector("#homepagePrimaryControlLabel"),
  inlineUnlockShell: document.querySelector("#inlineUnlockShell"),
  unlockKeyInput: document.querySelector("#unlockKeyInput"),
  unlockHint: document.querySelector("#unlockHint"),
  unlockConfirmButton: document.querySelector("#unlockConfirmButton"),
  unlockCancelButton: document.querySelector("#unlockCancelButton"),
  messageModal: document.querySelector("#messageModal"),
  messageNameInput: document.querySelector("#messageNameInput"),
  messageContentInput: document.querySelector("#messageContentInput"),
  messageSendButton: document.querySelector("#messageSendButton"),
};

function rngChar() {
  return NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
}

function isAnchor(ch) {
  const c = ch.toUpperCase();
  return c === "F" || c === "X" || c === "O";
}

function isAccentChar(word, ch) {
  return (word === "FENGXIAO" && ch === "O") ||
    (word === "OpenFX" && (ch === "F" || ch === "X"));
}

function getCharSpans() {
  return Array.from(elements.brandText?.querySelectorAll(".glitch-char") ?? []);
}

function readWord() {
  return getCharSpans().map((span) => span.textContent ?? "").join("");
}

function reindexSpans() {
  getCharSpans().forEach((span, index) => {
    span.dataset.idx = String(index);
  });
}

function setWord(word) {
  if (!elements.brandText) return;

  elements.brandText.innerHTML = "";
  for (const [index, ch] of word.split("").entries()) {
    const span = document.createElement("span");
    span.className = "glitch-char";
    span.dataset.idx = String(index);
    span.textContent = ch;
    if (isAccentChar(word, ch)) {
      span.style.color = "var(--accent)";
    }
    elements.brandText.append(span);
  }
}

function clearScheduledWork() {
  for (const id of state.timeoutIds) {
    clearTimeout(id);
  }
  state.timeoutIds = [];

  for (const id of state.frameIds) {
    cancelAnimationFrame(id);
  }
  state.frameIds = [];

  if (state.ghostIntervalId !== null) {
    clearInterval(state.ghostIntervalId);
    state.ghostIntervalId = null;
  }
}

function trackTimeout(callback, delay) {
  const id = window.setTimeout(() => {
    state.timeoutIds = state.timeoutIds.filter((value) => value !== id);
    callback();
  }, delay);
  state.timeoutIds.push(id);
  return id;
}

function scheduleAlign(word) {
  const first = requestAnimationFrame(() => {
    const second = requestAnimationFrame(() => {
      state.frameIds = state.frameIds.filter((value) => value !== second);
      alignBlock(word);
    });
    state.frameIds.push(second);
    state.frameIds = state.frameIds.filter((value) => value !== first);
  });
  state.frameIds.push(first);
}

function alignBlock(word) {
  if (!elements.brandWord || !elements.brandBlock) return;

  const spans = getCharSpans();
  if (!spans.length) return;

  const zone = elements.brandWord.parentElement;
  const lastSpan = spans[spans.length - 1];
  const suffix = word === "FENGXIAO" ? "XIAO" : "FX";
  const suffixStart = word.indexOf(suffix);
  if (!zone || suffixStart < 0 || !spans[suffixStart]) return;

  const zoneRect = zone.getBoundingClientRect();
  const textRight = lastSpan.getBoundingClientRect().right - zoneRect.left;
  const suffixLeft = spans[suffixStart].getBoundingClientRect().left - zoneRect.left;

  elements.brandBlock.style.left = `${suffixLeft}px`;
  elements.brandBlock.style.width = `${Math.max(textRight - suffixLeft, 20)}px`;
  if (!elements.brandBlock.style.opacity) {
    elements.brandBlock.style.opacity = "1";
  }
}

function resetGhosts() {
  if (!elements.ghostR || !elements.ghostB || !elements.brandWord) return;

  elements.ghostR.textContent = "";
  elements.ghostB.textContent = "";
  elements.ghostR.classList.remove("active-r");
  elements.ghostB.classList.remove("active-b");
  elements.brandWord.classList.remove("glitching");
}

function scrambleLabel(text) {
  if (!elements.primaryControlLabel) return;

  const target = text;
  const token = String(Date.now());
  elements.primaryControlLabel.dataset.scrambleToken = token;

  const steps = Math.max(target.length + 3, 8);
  const interval = 45;
  let frame = 0;

  const tick = () => {
    if (!elements.primaryControlLabel) return;
    if (elements.primaryControlLabel.dataset.scrambleToken !== token) return;

    const progress = frame / steps;
    const revealCount = Math.floor(target.length * progress);
    const output = target.split("").map((ch, index) => {
      if (index < revealCount) return ch;
      return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }).join("");

    elements.primaryControlLabel.textContent = output;
    frame += 1;

    if (frame <= steps) {
      window.setTimeout(tick, interval);
      return;
    }

    elements.primaryControlLabel.textContent = target;
  };

  tick();
}

function renderPrimaryControl() {
  if (!elements.primaryControl || !elements.primaryControlLabel || !elements.controlCluster || !elements.inlineUnlockShell) {
    return;
  }

  const role = state.uiBrand === "OpenFX" ? "unlock" : "message";
  const text = role === "unlock"
    ? (elements.primaryControl.dataset.unlockText || "UNLOCK")
    : (elements.primaryControl.dataset.messageText || "MESSAGE");

  if (role !== "unlock" && state.inlineUnlockOpen) {
    state.inlineUnlockOpen = false;
  }

  elements.primaryControl.dataset.role = role;
  elements.primaryControl.setAttribute("aria-label", text);
  elements.primaryControl.classList.toggle("primary", role === "unlock");
  elements.controlCluster.classList.toggle("unlock-editing", role === "unlock" && state.inlineUnlockOpen);
  elements.inlineUnlockShell.setAttribute(
    "aria-hidden",
    role === "unlock" && state.inlineUnlockOpen ? "false" : "true",
  );

  if (!state.inlineUnlockOpen && elements.primaryControlLabel.textContent !== text) {
    scrambleLabel(text);
  }
}

function openInlineUnlock() {
  state.inlineUnlockOpen = true;
  renderPrimaryControl();
  elements.unlockKeyInput?.focus();
  elements.unlockKeyInput?.select();
}

function closeInlineUnlock(resetInput = false) {
  state.inlineUnlockOpen = false;
  if (resetInput && elements.unlockKeyInput) {
    elements.unlockKeyInput.value = "";
  }
  renderPrimaryControl();
}

function setMessageButtonText(text, resetDelay = 0) {
  if (!elements.primaryControl) return;

  elements.primaryControl.dataset.messageText = text;
  if (state.uiBrand === "FENGXIAO") {
    renderPrimaryControl();
  }

  if (resetDelay > 0) {
    window.setTimeout(() => {
      elements.primaryControl.dataset.messageText = "MESSAGE";
      if (state.uiBrand === "FENGXIAO") {
        renderPrimaryControl();
      }
    }, resetDelay);
  }
}

function setUnlockButtonText(text) {
  if (!elements.primaryControl) return;
  elements.primaryControl.dataset.unlockText = text;
  if (state.uiBrand === "OpenFX") {
    renderPrimaryControl();
  }
}

function setUnlockedProjects(projectIds) {
  state.unlockedProjectIds = projectIds;
  document.querySelectorAll(".hidden-card").forEach((card) => {
    const id = card.dataset.cardId ?? "";
    card.classList.toggle("revealed", projectIds.includes(id));
  });
}

function openModal(element) {
  if (!element) return;
  element.classList.add("active");
  element.setAttribute("aria-hidden", "false");
}

function closeModal(element) {
  if (!element) return;
  element.classList.remove("active");
  element.setAttribute("aria-hidden", "true");
}

function finishAnim(word) {
  clearScheduledWork();
  resetGhosts();
  setWord(word);
  scheduleAlign(word);
  state.currentBrand = word;
  state.uiBrand = word;
  state.busy = false;
  renderPrimaryControl();
}

function toggleBrand() {
  if (state.busy || !elements.brandWord || !elements.ghostR || !elements.ghostB || !elements.brandText) {
    return;
  }

  state.busy = true;
  clearScheduledWork();

  const currentWord = readWord() === "OpenFX" ? "OpenFX" : "FENGXIAO";
  const target = currentWord === "FENGXIAO" ? "OpenFX" : "FENGXIAO";
  state.uiBrand = target;
  renderPrimaryControl();

  const noiseLen = Math.max(currentWord.length, target.length);
  const makeNoise = () => Array.from({ length: noiseLen }, () => rngChar()).join("");

  elements.ghostR.textContent = makeNoise();
  elements.ghostB.textContent = makeNoise();
  elements.ghostR.classList.add("active-r");
  elements.ghostB.classList.add("active-b");
  elements.brandWord.classList.add("glitching");

  state.ghostIntervalId = window.setInterval(() => {
    elements.ghostR.textContent = makeNoise();
    elements.ghostB.textContent = makeNoise();
  }, 80);

  let t = 0;
  const scheduleAt = (at, callback) => trackTimeout(callback, at);

  if (currentWord === "FENGXIAO") {
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
    ["p", "e", "n", "F", "X"].forEach((ch, index) => {
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
        elements.brandText.append(span);

        const frameId = requestAnimationFrame(() => {
          state.frameIds = state.frameIds.filter((value) => value !== frameId);
          span.classList.add(anchor ? "anchor-typing" : "typing");
        });
        state.frameIds.push(frameId);
      });
    });

    scheduleAt(t + 600, () => {
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
      elements.brandText.insertBefore(span, xSpan ?? null);

      const frameId = requestAnimationFrame(() => {
        state.frameIds = state.frameIds.filter((value) => value !== frameId);
        span.classList.add("typing");
      });
      state.frameIds.push(frameId);
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
      elements.brandText.append(span);

      const frameId = requestAnimationFrame(() => {
        state.frameIds = state.frameIds.filter((value) => value !== frameId);
        span.classList.add(anchor ? "anchor-typing" : "typing");
      });
      state.frameIds.push(frameId);
    });
  });

  scheduleAt(maxTypeTime + 300, () => {
    reindexSpans();
    finishAnim("FENGXIAO");
  });
}

async function doUnlock() {
  if (!elements.unlockKeyInput || !elements.unlockHint) return;

  const key = elements.unlockKeyInput.value.trim().toLowerCase();
  if (!key) {
    elements.unlockHint.textContent = "Enter a key";
    return;
  }

  const response = await fetch("/api/unlock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const json = await response.json();

  if (!response.ok) {
    elements.unlockHint.textContent = json.error === "invalid_key" ? "Invalid key" : "Unlock failed";
    return;
  }

  if (json.mode === "admin") {
    elements.unlockHint.textContent = "Admin access granted";
    closeInlineUnlock();
    window.location.href = json.redirect;
    return;
  }

  setUnlockedProjects(json.projectIds ?? []);
  elements.unlockHint.textContent = json.hint ?? "Unlocked hidden projects";
  setUnlockButtonText("UNLOCKED");
  closeInlineUnlock(true);
}

function doSendMessage() {
  if (!elements.messageContentInput || !elements.messageNameInput) return;

  const content = elements.messageContentInput.value.trim();
  if (!content) return;

  const name = elements.messageNameInput.value.trim() || "Anonymous";
  const messages = JSON.parse(localStorage.getItem("fx_msgs") || "[]");
  messages.push({ name, content, time: new Date().toISOString() });
  localStorage.setItem("fx_msgs", JSON.stringify(messages));

  closeModal(elements.messageModal);
  elements.messageNameInput.value = "";
  elements.messageContentInput.value = "";
  setMessageButtonText("SENT", 1800);
}

function bindModalCloseHandlers() {
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      const modalId = button.getAttribute("data-close-modal");
      closeModal(document.getElementById(modalId));
    });
  });

  [elements.messageModal].forEach((overlay) => {
    overlay?.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeModal(overlay);
      }
    });
  });
}

function bindEvents() {
  elements.brandWord?.addEventListener("click", toggleBrand);

  elements.primaryControl?.addEventListener("click", () => {
    const role = elements.primaryControl?.dataset.role;
    if (role === "unlock") {
      openInlineUnlock();
      return;
    }

    openModal(elements.messageModal);
    elements.messageNameInput?.focus();
  });

  elements.unlockConfirmButton?.addEventListener("click", () => {
    void doUnlock();
  });
  elements.unlockCancelButton?.addEventListener("click", () => {
    closeInlineUnlock(true);
  });
  elements.unlockKeyInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void doUnlock();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeInlineUnlock(true);
    }
  });
  elements.messageSendButton?.addEventListener("click", doSendMessage);
  bindModalCloseHandlers();

  window.addEventListener("resize", () => {
    const word = readWord() === "OpenFX" ? "OpenFX" : "FENGXIAO";
    alignBlock(word);
  });
}

setWord(state.currentBrand);
scheduleAlign(state.currentBrand);
renderPrimaryControl();
setUnlockedProjects(state.unlockedProjectIds);
bindEvents();
