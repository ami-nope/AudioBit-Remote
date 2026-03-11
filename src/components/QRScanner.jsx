import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

export default function QRScanner({ active, onScan, onScannerError }) {
  const [status, setStatus] = useState("Scanner idle");
  const hasScannedRef = useRef(false);
  const elementId = useMemo(
    () => `audiobit-qr-${Math.random().toString(36).slice(2, 8)}`,
    []
  );

  useEffect(() => {
    if (!active) {
      setStatus("Scanner idle");
      hasScannedRef.current = false;
      return undefined;
    }

    let cancelled = false;
    let scanner = null;

    const start = async () => {
      setStatus("Opening camera...");
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) {
          return;
        }

        scanner = new Html5Qrcode(elementId);
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (hasScannedRef.current) {
              return;
            }
            hasScannedRef.current = true;
            setStatus("Code scanned");
            onScan(decodedText);
            scanner?.stop().catch(() => {});
          },
          () => {}
        );
        if (!cancelled) {
          setStatus("Scanner ready");
        }
      } catch (error) {
        const msg =
          error?.message || "Unable to access camera. Check browser permissions.";
        setStatus("Camera unavailable");
        onScannerError?.(msg);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (!scanner) {
        return;
      }
      scanner
        .stop()
        .catch(() => {})
        .then(() => scanner?.clear().catch(() => {}));
    };
  }, [active, elementId, onScan, onScannerError]);

  return (
    <div className="scanner-wrap">
      <div className="scanner-label">
        {active ? <Camera size={16} /> : <CameraOff size={16} />}
        <span>{status}</span>
      </div>
      <div id={elementId} className="qr-region" />
    </div>
  );
}
