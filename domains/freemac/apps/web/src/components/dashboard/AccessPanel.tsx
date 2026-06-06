interface RelayPresentation {
  connectionLabel: string;
  reportLabel: string;
  tone: "idle" | "success" | "error" | "running";
}

interface Props {
  currentIpv6: string | null;
  observedIpv6: string | null;
  publicPort: number;
  relayOrigin: string;
  currentListenHost: string;
  currentListenPort: number;
  relayPresentation: RelayPresentation;
  relayBusy: boolean;
  relayError: string | null;
  relayMessage: string | null;
  warningText: string;
  initialized: boolean;
  onRelayOriginChange: (value: string) => void;
  onSaveRelay: () => void;
  onReportRelay: () => void;
}

export function AccessPanel({
  currentIpv6,
  observedIpv6,
  publicPort,
  relayOrigin,
  currentListenHost,
  currentListenPort,
  relayPresentation,
  relayBusy,
  relayError,
  relayMessage,
  warningText,
  initialized,
  onRelayOriginChange,
  onSaveRelay,
  onReportRelay,
}: Props) {
  const directUrl = currentIpv6 ? `http://[${currentIpv6}]:${publicPort}` : "Unavailable";

  return (
    <section className="panel panel-accent">
      <div className="panel-header panel-header--stack">
        <div>
          <p className="eyebrow">Access</p>
          <h2>Remote access</h2>
        </div>
        <span className={`status-pill status-pill--${relayPresentation.tone}`}>
          {relayPresentation.reportLabel}
        </span>
      </div>

      <div className="detail-list detail-list--compact">
        <div>
          <span>Machine</span>
          <strong>{currentIpv6 || "Waiting for IPv6"}</strong>
        </div>
        <div>
          <span>Direct URL</span>
          <strong>{directUrl}</strong>
        </div>
        <div>
          <span>Relay</span>
          <strong>{relayOrigin || "Not linked"}</strong>
        </div>
        <div>
          <span>Listen</span>
          <strong>{`${currentListenHost}:${currentListenPort}`}</strong>
        </div>
      </div>

      <div className="form-grid compact-form">
        <label>
          <span>Deno Deploy Origin</span>
          <input
            value={relayOrigin}
            onChange={(event) => onRelayOriginChange(event.target.value)}
            placeholder="mac.universes.cc"
          />
        </label>
      </div>

      <div className="button-row button-row--tight">
        <button className="button" onClick={onSaveRelay}>
          Save Relay
        </button>
        <button
          className="ghost-button-solid"
          onClick={onReportRelay}
          disabled={relayBusy || !relayOrigin.trim()}
        >
          {relayBusy ? "Reporting..." : "Report Now"}
        </button>
        {relayOrigin && (
          <a
            className="stage-link"
            href={`https://${relayOrigin}`}
            target="_blank"
            rel="noreferrer"
          >
            Open Relay
          </a>
        )}
      </div>

      <p className="helper-text">{warningText}</p>
      {relayMessage && <p className="helper-text">{relayMessage}</p>}
      {relayError && <p className="error-text">{relayError}</p>}

      <div className="note-list">
        <div>
          <span>Observed IPv6</span>
          <p>{observedIpv6 || "No observation yet"}</p>
        </div>
        <div>
          <span>Relay State</span>
          <p>{relayPresentation.connectionLabel}</p>
        </div>
        <div>
          <span>Rule</span>
          <p>
            {initialized
              ? "Keep TCP/24531 open and treat the relay URL as the canonical public entry."
              : "Complete setup first, then bind the relay origin once."}
          </p>
        </div>
      </div>
    </section>
  );
}
