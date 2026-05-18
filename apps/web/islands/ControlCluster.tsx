import { useSignal } from "@preact/signals";
import { animate, scrambleText } from "animejs";
import { useEffect, useRef } from "preact/hooks";
import { unlockedProjectIds, uiBrand } from "./state.ts";

function AnimatedButtonLabel(props: { text: string }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const previousText = useRef("");

  useEffect(() => {
    const label = labelRef.current;
    if (!label) return;

    if (!previousText.current) {
      label.textContent = "";
    }

    animate(label, {
      innerHTML: scrambleText({
        text: props.text,
        chars: "braille",
        cursor: "░▒▓█",
      }),
      duration: 650,
    });

    previousText.current = props.text;
  }, [props.text]);

  return <span class="ctrl-btn-label" ref={labelRef}>{props.text}</span>;
}

export default function ControlCluster() {
  const showUnlock = useSignal(false);
  const showMessage = useSignal(false);
  const unlockKey = useSignal("");
  const unlockHint = useSignal("");
  const msgName = useSignal("");
  const msgContent = useSignal("");
  const msgBtnText = useSignal("MESSAGE");
  const unlockBtnText = useSignal("UNLOCK");
  const unlockInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showUnlock.value || uiBrand.value !== "OpenFX") return;
    unlockInputRef.current?.focus();
    unlockInputRef.current?.select();
  }, [showUnlock.value, uiBrand.value]);

  function openInlineUnlock() {
    showUnlock.value = true;
    unlockHint.value = "";
  }

  function closeInlineUnlock(resetInput = false) {
    showUnlock.value = false;
    if (resetInput) {
      unlockKey.value = "";
    }
  }

  function doUnlock() {
    const key = unlockKey.value.trim().toLowerCase();
    if (!key) {
      unlockHint.value = "Enter a key";
      return;
    }

    void (async () => {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const json = await res.json();

      if (!res.ok) {
        unlockHint.value = json.error === "invalid_key" ? "Invalid key" : "Unlock failed";
        return;
      }

      if (json.mode === "admin") {
        unlockHint.value = "Admin access granted";
        closeInlineUnlock();
        window.location.href = json.redirect;
        return;
      }

      unlockedProjectIds.value = json.projectIds;
      unlockHint.value = json.hint ?? "Unlocked hidden projects";
      unlockBtnText.value = "UNLOCKED";
      closeInlineUnlock(true);
    })();
  }

  function doSendMessage() {
    const content = msgContent.value.trim();
    if (!content) return;
    const name = msgName.value.trim() || "Anonymous";
    const msgs = JSON.parse(localStorage.getItem("fx_msgs") || "[]");
    msgs.push({ name, content, time: new Date().toISOString() });
    localStorage.setItem("fx_msgs", JSON.stringify(msgs));
    showMessage.value = false;
    msgName.value = "";
    msgContent.value = "";
    msgBtnText.value = "SENT";
    setTimeout(() => {
      msgBtnText.value = "MESSAGE";
    }, 1800);
  }

  return (
    <>
      <div class={`control-cluster${uiBrand.value === "OpenFX" && showUnlock.value ? " unlock-editing" : ""}`}>
        {uiBrand.value === "OpenFX" && (
          <>
            <button
              class="ctrl-btn primary"
              onClick={openInlineUnlock}
              aria-label={unlockBtnText.value}
            >
              <AnimatedButtonLabel text={unlockBtnText.value} />
            </button>

            <div class="inline-unlock-shell" aria-hidden={showUnlock.value ? "false" : "true"}>
              <input
                ref={unlockInputRef}
                class="inline-unlock-input"
                type="password"
                value={unlockKey}
                onInput={(e) =>
                  (unlockKey.value = (e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    doUnlock();
                  }

                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeInlineUnlock(true);
                  }
                }}
                placeholder="Enter key"
                autocomplete="off"
              />
              <button class="btn-primary inline-unlock-confirm" type="button" onClick={doUnlock}>
                OK
              </button>
              <button
                class="btn-ghost inline-unlock-cancel"
                type="button"
                onClick={() => closeInlineUnlock(true)}
              >
                Cancel
              </button>
            </div>
          </>
        )}
        {uiBrand.value === "FENGXIAO" && (
          <button
            class="ctrl-btn"
            onClick={() => (showMessage.value = true)}
            aria-label={msgBtnText.value}
          >
            <AnimatedButtonLabel text={msgBtnText.value} />
          </button>
        )}
      </div>

      {uiBrand.value === "OpenFX" && unlockHint.value && (
        <div class="inline-unlock-hint">{unlockHint.value}</div>
      )}

      {/* MESSAGE Modal */}
      {showMessage.value && (
        <div
          class="modal-overlay active"
          onClick={(e) => {
            if (e.target === e.currentTarget) showMessage.value = false;
          }}
        >
          <div class="modal">
            <h2>MESSAGE</h2>
            <label>Name</label>
            <input
              type="text"
              value={msgName}
              onInput={(e) =>
                (msgName.value = (e.target as HTMLInputElement).value)
              }
              placeholder="Optional"
            />
            <label>Message</label>
            <textarea
              value={msgContent}
              onInput={(e) =>
                (msgContent.value = (e.target as HTMLTextAreaElement).value)
              }
              placeholder="Collaboration, feedback, or just say hi..."
            />
            <div class="modal-actions">
              <button
                class="btn-ghost"
                onClick={() => (showMessage.value = false)}
              >
                Cancel
              </button>
              <button class="btn-primary" onClick={doSendMessage}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
