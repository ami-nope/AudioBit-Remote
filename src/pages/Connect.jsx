import { useMemo, useState } from "react";
import { CheckCircle2, QrCode, Link2 } from "lucide-react";
import HostSwitcher from "../components/HostSwitcher";
import QRScanner from "../components/QRScanner";

export default function Connect({
  hosts,
  activeHostIndex,
  sessionId,
  pairCode,
  status,
  error,
  onSelectHost,
  onSessionIdChange,
  onPairCodeChange,
  onConnect,
  onQRScanText,
  onScannerError,
}) {
  const [scannerOpen, setScannerOpen] = useState(false);

  const isReconnecting = status === "reconnecting";
  const isConnecting = status === "connecting" || isReconnecting;
  const isConnected = status === "connected";
  const canSubmit = useMemo(
    () =>
      sessionId.trim().length > 0 &&
      /^\d{6}$/.test(pairCode) &&
      !isConnecting &&
      !isConnected,
    [isConnected, isConnecting, pairCode, sessionId]
  );

  return (
    <main className="screen connect-screen">
      <section className="panel connect-card">
        <HostSwitcher
          hosts={hosts}
          activeHostIndex={activeHostIndex}
          onSelectHost={onSelectHost}
          compact
        />

        {isConnected ? (
          <div className="connect-success">
            <CheckCircle2 size={54} />
            <h1>{`Host ${activeHostIndex + 1} connected`}</h1>
            <p>Opening remote controls...</p>
          </div>
        ) : (
          <>
            <div className="section-head">
              <h1>{`Connect Host ${activeHostIndex + 1}`}</h1>
              <p className="subtext">
                Scan the pairing QR to connect instantly, or enter the session details manually.
                You can keep up to two host connections open at the same time.
              </p>
            </div>

            <div className="connect-method">
              <button
                type="button"
                className={`method-toggle ${scannerOpen ? "active" : ""}`}
                onClick={() => setScannerOpen((prev) => !prev)}
              >
                <QrCode size={16} />
                <span>{scannerOpen ? "Hide QR Scanner" : "Scan QR Code"}</span>
              </button>

              {scannerOpen ? (
                <QRScanner
                  active={scannerOpen}
                  onScan={onQRScanText}
                  onScannerError={onScannerError}
                />
              ) : null}
            </div>

            <div className="manual-form">
              <div className="row-label">
                <Link2 size={16} />
                <span>Manual pairing</span>
              </div>

              <label className="field-label">
                <span>Session ID</span>
                <input
                  className="glass-input"
                  type="text"
                  placeholder="95e2a66960d9abc30c276953"
                  value={sessionId}
                  onChange={(event) => onSessionIdChange(event.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>

              <label className="field-label">
                <span>Pairing Code</span>
                <input
                  className="glass-input code-input"
                  type="text"
                  placeholder="904163"
                  maxLength={6}
                  value={pairCode}
                  onChange={(event) =>
                    onPairCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <button
              type="button"
              className="connect-btn"
              disabled={!canSubmit}
              onClick={onConnect}
            >
              {isReconnecting
                ? "Reconnecting..."
                : isConnecting
                  ? "Connecting..."
                  : `Connect Host ${activeHostIndex + 1}`}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
