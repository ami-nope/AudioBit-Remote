import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Flashlight,
  FlashlightOff,
  LoaderCircle,
  RefreshCcw,
  ScanLine,
} from "lucide-react";

const INITIAL_STATUS = {
  tone: "idle",
  text: "Scanner idle",
};

const REAR_CAMERA_PATTERN = /back|rear|environment|world|wide|ultra/i;

const pickPreferredCameraId = (cameras, requestedCameraId) => {
  if (!Array.isArray(cameras) || cameras.length === 0) {
    return "";
  }

  if (requestedCameraId && cameras.some((camera) => camera.id === requestedCameraId)) {
    return requestedCameraId;
  }

  return cameras.find((camera) => REAR_CAMERA_PATTERN.test(camera.label))?.id || cameras[0].id;
};

const describeScannerError = (error, cameraCount) => {
  const message = error?.message || "";

  if (error?.name === "NotAllowedError") {
    return "Camera permission was blocked. Allow access or enter the code manually.";
  }
  if (error?.name === "NotFoundError" || cameraCount === 0) {
    return "No camera was found on this device.";
  }
  if (error?.name === "NotReadableError") {
    return "The camera is busy in another app. Close it and try again.";
  }
  if (message) {
    return message;
  }
  return "Unable to access the camera. Check browser permissions and try again.";
};

export default function QRScanner({ active, onScan, onScannerError }) {
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [cameras, setCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoomConfig, setZoomConfig] = useState(null);
  const [zoomValue, setZoomValue] = useState(1);

  const scannerRef = useRef(null);
  const activeRef = useRef(active);
  const mountedRef = useRef(true);
  const startSequenceRef = useRef(0);
  const currentCameraIdRef = useRef("");
  const scanBusyRef = useRef(false);
  const acceptedScanRef = useRef(false);
  const capabilitiesRef = useRef({
    torch: null,
    zoom: null,
  });
  const elementId = useMemo(
    () => `audiobit-qr-${Math.random().toString(36).slice(2, 8)}`,
    []
  );

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const resetCapabilities = useCallback(() => {
    capabilitiesRef.current = { torch: null, zoom: null };
    if (!mountedRef.current) {
      return;
    }
    setTorchSupported(false);
    setTorchEnabled(false);
    setZoomConfig(null);
    setZoomValue(1);
  }, []);

  const stopScanner = useCallback(async (instance = scannerRef.current) => {
    if (!instance) {
      return;
    }

    if (scannerRef.current === instance) {
      scannerRef.current = null;
    }

    try {
      await instance.stop();
    } catch {
      // Ignore stop errors because the scanner may already be torn down.
    }

    try {
      instance.clear();
    } catch {
      // Ignore clear errors because the scanner container may already be gone.
    }
  }, []);

  const syncCapabilities = useCallback(
    (scanner) => {
      resetCapabilities();

      try {
        const cameraCapabilities = scanner.getRunningTrackCameraCapabilities?.();
        const torchFeature = cameraCapabilities?.torchFeature?.();
        const zoomFeature = cameraCapabilities?.zoomFeature?.();
        const supportsTorch = Boolean(torchFeature?.isSupported?.());
        const supportsZoom = Boolean(zoomFeature?.isSupported?.());

        capabilitiesRef.current = {
          torch: supportsTorch ? torchFeature : null,
          zoom: supportsZoom ? zoomFeature : null,
        };

        if (supportsTorch) {
          setTorchSupported(true);
          setTorchEnabled(Boolean(torchFeature.value()));
        }

        if (supportsZoom) {
          const min = Number(zoomFeature.min());
          const max = Number(zoomFeature.max());
          const step = Number(zoomFeature.step()) || 0.1;

          if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
            const nextValue = Number(zoomFeature.value() ?? min);
            setZoomConfig({ min, max, step });
            setZoomValue(nextValue);
          }
        }
      } catch {
        // Capability probing is optional and browser-dependent.
      }
    },
    [resetCapabilities]
  );

  const handleDecoded = useCallback(
    async (decodedText, scanner) => {
      if (acceptedScanRef.current || scanBusyRef.current) {
        return;
      }

      scanBusyRef.current = true;
      if (mountedRef.current) {
        setStatus({
          tone: "pending",
          text: "QR detected. Checking pairing data...",
        });
      }

      try {
        const accepted = await Promise.resolve(onScan?.(decodedText));
        if (!mountedRef.current || scannerRef.current !== scanner) {
          return;
        }

        if (!accepted) {
          scanBusyRef.current = false;
          setStatus({
            tone: "warn",
            text: "This QR is not an AudioBit pairing code. Keep scanning.",
          });
          return;
        }

        acceptedScanRef.current = true;
        setStatus({
          tone: "success",
          text: "Pairing QR accepted. Connecting...",
        });
        await stopScanner(scanner);
      } catch (error) {
        scanBusyRef.current = false;
        if (!mountedRef.current || scannerRef.current !== scanner) {
          return;
        }

        const message = error?.message || "Unable to use the scanned QR.";
        setStatus({ tone: "warn", text: message });
        onScannerError?.(message);
      }
    },
    [onScan, onScannerError, stopScanner]
  );

  const startScanner = useCallback(
    async (requestedCameraId = currentCameraIdRef.current) => {
      if (!activeRef.current) {
        return;
      }

      const sequence = ++startSequenceRef.current;
      let discoveredCameras = [];

      acceptedScanRef.current = false;
      scanBusyRef.current = false;
      if (mountedRef.current) {
        setIsStarting(true);
        setScannerReady(false);
        setStatus({
          tone: "pending",
          text: "Opening camera...",
        });
      }

      resetCapabilities();
      await stopScanner();

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (!mountedRef.current || !activeRef.current || startSequenceRef.current !== sequence) {
          return;
        }

        try {
          discoveredCameras = await Html5Qrcode.getCameras();
        } catch {
          discoveredCameras = [];
        }

        if (!mountedRef.current || !activeRef.current || startSequenceRef.current !== sequence) {
          return;
        }

        const resolvedCameraId = pickPreferredCameraId(
          discoveredCameras,
          requestedCameraId
        );
        currentCameraIdRef.current = resolvedCameraId;
        setCameras(discoveredCameras);
        setActiveCameraId(resolvedCameraId);

        const scanner = new Html5Qrcode(elementId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          resolvedCameraId || { facingMode: "environment" },
          {
            fps: 12,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.max(
                180,
                Math.min(
                  280,
                  Math.round(Math.min(viewfinderWidth, viewfinderHeight) * 0.72)
                )
              );

              return { width: edge, height: edge };
            },
            aspectRatio: 1,
            videoConstraints: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          (decodedText) => {
            void handleDecoded(decodedText, scanner);
          },
          () => {}
        );

        if (!mountedRef.current || !activeRef.current || startSequenceRef.current !== sequence) {
          await stopScanner(scanner);
          return;
        }

        syncCapabilities(scanner);
        setScannerReady(true);
        setStatus({
          tone: "ready",
          text: "Align the pairing QR inside the frame",
        });
      } catch (error) {
        if (!mountedRef.current || startSequenceRef.current !== sequence) {
          return;
        }

        const message = describeScannerError(error, discoveredCameras.length);
        setScannerReady(false);
        setStatus({ tone: "error", text: message });
        onScannerError?.(message);
      } finally {
        if (
          mountedRef.current &&
          activeRef.current &&
          startSequenceRef.current === sequence
        ) {
          setIsStarting(false);
        }
      }
    },
    [elementId, handleDecoded, onScannerError, resetCapabilities, stopScanner, syncCapabilities]
  );

  useEffect(() => {
    if (!active) {
      startSequenceRef.current += 1;
      acceptedScanRef.current = false;
      scanBusyRef.current = false;
      setIsStarting(false);
      setScannerReady(false);
      setStatus(INITIAL_STATUS);
      resetCapabilities();
      void stopScanner();
      return undefined;
    }

    void startScanner();

    return () => {
      startSequenceRef.current += 1;
      acceptedScanRef.current = false;
      scanBusyRef.current = false;
      setIsStarting(false);
      setScannerReady(false);
      resetCapabilities();
      void stopScanner();
    };
  }, [active, resetCapabilities, startScanner, stopScanner]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      activeRef.current = false;
      startSequenceRef.current += 1;
      void stopScanner();
    },
    [stopScanner]
  );

  const handleCameraChange = useCallback(
    (event) => {
      const nextCameraId = event.target.value;
      currentCameraIdRef.current = nextCameraId;
      setActiveCameraId(nextCameraId);
      void startScanner(nextCameraId);
    },
    [startScanner]
  );

  const handleTorchToggle = useCallback(async () => {
    const torchFeature = capabilitiesRef.current.torch;
    if (!torchFeature?.isSupported?.()) {
      return;
    }

    const nextState = !torchEnabled;
    try {
      await torchFeature.apply(nextState);
      if (mountedRef.current) {
        setTorchEnabled(nextState);
      }
    } catch {
      if (mountedRef.current) {
        setStatus({
          tone: "warn",
          text: "Torch control is not available for this camera.",
        });
      }
    }
  }, [torchEnabled]);

  const handleZoomChange = useCallback(async (event) => {
    const zoomFeature = capabilitiesRef.current.zoom;
    if (!zoomFeature?.isSupported?.()) {
      return;
    }

    const nextValue = Number(event.target.value);
    if (!Number.isFinite(nextValue)) {
      return;
    }

    setZoomValue(nextValue);

    try {
      await zoomFeature.apply(nextValue);
    } catch {
      if (mountedRef.current) {
        setStatus({
          tone: "warn",
          text: "Zoom control is not available for this camera.",
        });
      }
    }
  }, []);

  const handleRestart = useCallback(() => {
    void startScanner(currentCameraIdRef.current);
  }, [startScanner]);

  const statusIcon = !active ? (
    <CameraOff size={16} />
  ) : isStarting ? (
    <LoaderCircle size={16} className="is-spinning" />
  ) : scannerReady ? (
    <ScanLine size={16} />
  ) : (
    <Camera size={16} />
  );

  return (
    <div className="scanner-wrap">
      <div className={`scanner-label scanner-label-${status.tone}`} aria-live="polite">
        {statusIcon}
        <span>{status.text}</span>
      </div>

      <div className={`scanner-shell ${scannerReady ? "is-live" : ""}`}>
        <div id={elementId} className="qr-region" />
        <div className="scanner-overlay" aria-hidden="true">
          <div className="scan-window">
            <span className="scan-corner scan-corner-tl" />
            <span className="scan-corner scan-corner-tr" />
            <span className="scan-corner scan-corner-bl" />
            <span className="scan-corner scan-corner-br" />
            <span className="scan-beam" />
          </div>
        </div>
      </div>

      <div className="scanner-footer">
        <p className="scanner-hint">
          Hold the AudioBit pairing QR inside the frame. The app connects
          automatically as soon as the QR is valid.
        </p>

        <div className="scanner-controls">
          <button
            type="button"
            className="scanner-action"
            onClick={handleRestart}
            disabled={!active || isStarting}
          >
            <RefreshCcw size={15} />
            <span>Restart</span>
          </button>

          {torchSupported ? (
            <button
              type="button"
              className={`scanner-action ${torchEnabled ? "is-active" : ""}`}
              onClick={handleTorchToggle}
              disabled={!scannerReady}
            >
              {torchEnabled ? <FlashlightOff size={15} /> : <Flashlight size={15} />}
              <span>{torchEnabled ? "Torch Off" : "Torch On"}</span>
            </button>
          ) : null}

          {cameras.length > 1 ? (
            <label className="scanner-select-wrap">
              <span>Camera</span>
              <select
                className="glass-select scanner-select"
                value={activeCameraId}
                onChange={handleCameraChange}
                disabled={isStarting}
              >
                {cameras.map((camera, index) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {zoomConfig ? (
          <label className="scanner-zoom">
            <span>Zoom</span>
            <input
              type="range"
              min={zoomConfig.min}
              max={zoomConfig.max}
              step={zoomConfig.step}
              value={zoomValue}
              onChange={handleZoomChange}
              disabled={!scannerReady}
            />
            <strong>{zoomValue.toFixed(1)}x</strong>
          </label>
        ) : null}
      </div>
    </div>
  );
}
