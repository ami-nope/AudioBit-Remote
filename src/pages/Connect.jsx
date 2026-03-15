import { useMemo, useState } from "react";
import { CheckCircle2, QrCode, Link2 } from "lucide-react";
import QRScanner from "../components/QRScanner";

export default function Connect({
  sessionId,
  pairCode,
  status,
  error,
  onSessionIdChange,
  onPairCodeChange,
  onConnect,
  onQRScanText,
  onScannerError,
}) {
  const [scannerOpen, setScannerOpen] = useState(false);

  const isConnecting = status === "connecting";
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
        {isConnected ? (
          <div className="connect-success">
            <CheckCircle2 size={54} />
            <h1>Connected to AudioBit</h1>
            <p>Opening remote controls...</p>
          </div>
        ) : (
          <>
            <div className="section-head">
              <h1>Connect to AudioBit</h1>
              <p className="subtext">
                Scan the pairing QR to connect instantly, or enter the session details manually.
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
              {isConnecting ? "Connecting..." : "Connect"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
