import { useEffect, useMemo, useState } from "react";
import { Mic, Headphones, VolumeX, Volume2 } from "lucide-react";

const initialsFromName = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "A";

const clampChannel = (value) => Math.max(0, Math.min(255, Math.round(value)));

const hslToRgb = (h, s, l) => {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(1, s));
  const lightness = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hue < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return [
    clampChannel((rPrime + m) * 255),
    clampChannel((gPrime + m) * 255),
    clampChannel((bPrime + m) * 255),
  ];
};

const seededAccent = (seed = "") => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  return hslToRgb(hue, 0.66, 0.52);
};

const tuneAccent = (source, fallback) => {
  const [r, g, b] = source.map(clampChannel);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 14) {
    return fallback;
  }

  let scale = 1;
  if (max < 96) {
    scale = 96 / max;
  } else if (max > 220) {
    scale = 220 / max;
  }

  return [
    clampChannel(r * scale),
    clampChannel(g * scale),
    clampChannel(b * scale),
  ];
};

const extractLogoAccent = (image, fallback) => {
  const canvas = document.createElement("canvas");
  canvas.width = 28;
  canvas.height = 28;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return fallback;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let data;
  try {
    data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return fallback;
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let index = 0; index < data.length; index += 16) {
    const alpha = data[index + 3];
    if (alpha < 64) {
      continue;
    }

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max < 38 || max - min < 12) {
      continue;
    }

    r += red;
    g += green;
    b += blue;
    count += 1;
  }

  if (count === 0) {
    return fallback;
  }

  return tuneAccent([r / count, g / count, b / count], fallback);
};

export default function AppCard({
  app,
  outputDevices,
  inputDevices,
  pulseKey,
  onVolumeChange,
  onMuteToggle,
  onOutputDeviceChange,
  onInputDeviceChange,
}) {
  const iconSrc = app.icon ? String(app.icon) : "";
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  const fallbackAccent = useMemo(
    () => seededAccent(`${app.name}:${app.id}`),
    [app.id, app.name]
  );
  const [accent, setAccent] = useState(fallbackAccent);

  useEffect(() => {
    setLogoUnavailable(false);
  }, [iconSrc]);

  useEffect(() => {
    setAccent(fallbackAccent);
  }, [fallbackAccent]);

  useEffect(() => {
    if (!iconSrc || logoUnavailable) {
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";

    image.onload = () => {
      if (cancelled) {
        return;
      }
      setAccent(extractLogoAccent(image, fallbackAccent));
    };

    image.onerror = () => {
      if (cancelled) {
        return;
      }
      setAccent(fallbackAccent);
    };

    image.src = iconSrc;

    return () => {
      cancelled = true;
    };
  }, [fallbackAccent, iconSrc, logoUnavailable]);

  const accentRgb = `${accent[0]}, ${accent[1]}, ${accent[2]}`;
  const showLogo = iconSrc && !logoUnavailable;
  const selectedOutput = app.outputDeviceId ?? outputDevices[0]?.id ?? "";
  const selectedInput = app.inputDeviceId ?? inputDevices[0]?.id ?? "";

  return (
    <article className="app-card" style={{ "--app-accent-rgb": accentRgb }}>
      <div className="app-header">
        <div className="app-meta">
          {showLogo ? (
            <img
              className="app-icon"
              src={iconSrc}
              alt={`${app.name} logo`}
              loading="lazy"
              decoding="async"
              onError={() => setLogoUnavailable(true)}
            />
          ) : (
            <div className="app-icon app-icon-fallback">{initialsFromName(app.name)}</div>
          )}

          <div>
            <p className="app-name">{app.name}</p>
            <p className="app-vol-label">{app.volume}% volume</p>
          </div>
        </div>
        <button
          type="button"
          className={`mini-toggle ${app.muted ? "is-muted" : ""} ${
            pulseKey === `mute_app:${app.id}` ? "is-pulsing" : ""
          }`}
          onClick={() => onMuteToggle(app.id, !app.muted)}
          aria-label={app.muted ? `Unmute ${app.name}` : `Mute ${app.name}`}
        >
          {app.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>

      <div className="audio-meter" aria-hidden="true">
        <span className="audio-meter-fill" style={{ width: `${app.level}%` }} />
      </div>

      <input
        className="range-slider app-slider"
        type="range"
        min="0"
        max="100"
        value={app.volume}
        onChange={(event) => onVolumeChange(app.id, Number(event.target.value))}
      />

      <div className="app-route-grid">
        <label className="field-label">
          <span className="row-label">
            <Headphones size={14} />
            <span>App Output</span>
          </span>
          <div className="route-row">
            <select
              className="glass-select compact-select"
              value={selectedOutput}
              onChange={(event) => onOutputDeviceChange(app.id, event.target.value)}
            >
              {outputDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="field-label">
          <span className="row-label">
            <Mic size={14} />
            <span>App Input</span>
          </span>
          <div className="route-row">
            <select
              className="glass-select compact-select"
              value={selectedInput}
              onChange={(event) => onInputDeviceChange(app.id, event.target.value)}
            >
              {inputDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>
    </article>
  );
}
