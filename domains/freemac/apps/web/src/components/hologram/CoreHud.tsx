import { useState } from "react";
import type { RendererInfo } from "./HolographicCoreScene";
import type { AuthState, RelayStatusPresentation } from "../../hooks/useFreemacState";

interface FocusMetric {
  label: string;
  value: string;
}

interface Props {
  authState: AuthState;
  directUrl: string;
  focusMetrics: FocusMetric[];
  focusSummary: string;
  focusTitle: string;
  hoveredLabel: string | null;
  initialized: boolean;
  lastUpdatedLabel: string;
  loginBusy: boolean;
  loginError: string | null;
  loginPassword: string;
  machineIpv6: string | null;
  onLoginPasswordChange: (value: string) => void;
  onLogout: () => void | Promise<void>;
  onRelayOriginChange: (value: string) => void;
  onReportRelay: () => void | Promise<void>;
  onSaveRelay: () => void | Promise<void>;
  onSetupPasswordChange: (value: string) => void;
  onSubmitLogin: () => void | Promise<void>;
  onSubmitSetup: () => void | Promise<void>;
  relayBusy: boolean;
  relayError: string | null;
  relayMessage: string | null;
  relayOrigin: string;
  relayPresentation: RelayStatusPresentation;
  rendererInfo: RendererInfo | null;
  runtimeError: string | null;
  settingsListenHost: string;
  settingsListenPort: number;
  setupError: string | null;
  setupPassword: string;
  warningText: string;
}

export function CoreHud({
  authState,
  directUrl,
  focusMetrics,
  focusSummary,
  focusTitle,
  hoveredLabel,
  initialized,
  lastUpdatedLabel,
  loginBusy,
  loginError,
  loginPassword,
  machineIpv6,
  onLoginPasswordChange,
  onLogout,
  onRelayOriginChange,
  onReportRelay,
  onSaveRelay,
  onSetupPasswordChange,
  onSubmitLogin,
  onSubmitSetup,
  relayBusy,
  relayError,
  relayMessage,
  relayOrigin,
  relayPresentation,
  rendererInfo,
  runtimeError,
  settingsListenHost,
  settingsListenPort,
  setupError,
  setupPassword,
  warningText,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const visibleAuth = !initialized || authState !== "authenticated";

  return (
    <>
      <header className="core-hud core-hud--top">
        <div className="core-meta">
          {hoveredLabel && <span className="hud-hover-state">Inspecting {hoveredLabel}</span>}
          <div className="hud-chip-list">
            <span className={`hud-chip hud-chip--${relayPresentation.tone}`}>
              {relayPresentation.reportLabel}
            </span>
            <span className="hud-chip hud-chip--neutral">
              {rendererInfo?.preferredBackend === "webgpu"
                ? rendererInfo.activeRenderer === "webgl"
                  ? "WebGPU ready / WebGL active"
                  : "WebGPU active"
                : "WebGL active"}
            </span>
          </div>
          <div className="core-meta__actions">
            <button className="hud-button" onClick={() => setSettingsOpen((current) => !current)}>
              {settingsOpen ? "Close settings" : "Settings"}
            </button>
            {authState === "authenticated" && (
              <button className="hud-button hud-button--ghost" onClick={() => void onLogout()}>
                Log out
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="core-hud core-hud--focus">
        <div className="focus-panel">
          <div className="focus-panel__header">
            <div>
              <p className="core-panel__eyebrow">Selected layer</p>
              <h2>{focusTitle}</h2>
            </div>
          </div>
          <p className="focus-panel__copy">{focusSummary}</p>
          <div className="focus-panel__metrics">
            {focusMetrics.map((metric) => (
              <div key={metric.label} className="focus-metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="core-hud core-hud--status">
        <div className="signal-block">
          <span>Route</span>
          <strong>{machineIpv6 || "Waiting for IPv6"}</strong>
        </div>
        <div className="signal-block">
          <span>Direct</span>
          <strong>{directUrl}</strong>
        </div>
        <div className="signal-block signal-block--muted">
          <span>Signal</span>
          <p>{runtimeError || warningText}</p>
        </div>
        <div className="signal-block signal-block--muted">
          <span>Updated</span>
          <p>{lastUpdatedLabel}</p>
        </div>
      </aside>

      <div className="core-hud core-hud--hint">
        <div className="hint-pill">Move to inspect layers. Click to lock selection.</div>
      </div>

      {settingsOpen && (
        <section className="core-panel core-panel--settings">
          <div className="core-panel__header">
            <div>
              <p className="core-panel__eyebrow">Access relay</p>
              <h2>Minimal settings</h2>
            </div>
            <span>{`${settingsListenHost}:${settingsListenPort}`}</span>
          </div>

          <label>
            <span>Deno Deploy Origin</span>
            <input
              value={relayOrigin}
              onChange={(event) => onRelayOriginChange(event.target.value)}
              placeholder="mac.universes.cc"
            />
          </label>

          <div className="core-panel__actions">
            <button className="hud-button" onClick={() => void onSaveRelay()}>
              Save relay
            </button>
            <button
              className="hud-button hud-button--ghost"
              onClick={() => void onReportRelay()}
              disabled={relayBusy || !relayOrigin.trim()}
            >
              {relayBusy ? "Reporting..." : "Report now"}
            </button>
          </div>

          {relayMessage && <p className="core-panel__note">{relayMessage}</p>}
          {relayError && <p className="core-panel__error">{relayError}</p>}
        </section>
      )}

      {visibleAuth && (
        <section className="core-panel core-panel--auth">
          <div className="core-panel__header">
            <div>
              <p className="core-panel__eyebrow">{initialized ? "Access" : "Setup"}</p>
              <h2>{initialized ? "Unlock the core" : "Initialize freemac"}</h2>
            </div>
            <span>{initialized ? "Session required" : "First run"}</span>
          </div>

          {!initialized ? (
            <>
              <label>
                <span>Local Dashboard Password</span>
                <input
                  type="password"
                  value={setupPassword}
                  onChange={(event) => onSetupPasswordChange(event.target.value)}
                />
              </label>
              {setupError && <p className="core-panel__error">{setupError}</p>}
              <div className="core-panel__actions">
                <button className="hud-button" onClick={() => void onSubmitSetup()}>
                  Initialize
                </button>
              </div>
            </>
          ) : (
            <>
              <label>
                <span>Local Dashboard Password</span>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => onLoginPasswordChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void onSubmitLogin();
                    }
                  }}
                />
              </label>
              {loginError && <p className="core-panel__error">{loginError}</p>}
              <div className="core-panel__actions">
                <button
                  className="hud-button"
                  onClick={() => void onSubmitLogin()}
                  disabled={loginBusy || authState === "checking"}
                >
                  {loginBusy ? "Signing in..." : "Sign in"}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
