import { useCallback, useEffect, useRef, useState } from "react";
import Connect from "./pages/Connect";
import Control from "./pages/Control";
import { AudioBitWebSocket, RELAY_WS_URL } from "./services/websocket";

const INITIAL_AUDIO_STATE = {
  masterVolume: 70,
  masterMuted: false,
  micMuted: false,
  apps: [],
  outputDevices: [{ id: "default_out", name: "Default Output" }],
  inputDevices: [{ id: "default_in", name: "Default Input" }],
  outputDeviceId: "default_out",
  inputDeviceId: "default_in",
};

const clampPercent = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const toMeterPercent = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  if (parsed <= 1) {
    return clampPercent(parsed * 100);
  }
  if (parsed <= 100) {
    return clampPercent(parsed);
  }
  if (parsed <= 1000) {
    return clampPercent(parsed / 10);
  }
  return clampPercent(parsed);
};

const firstDefined = (...values) => values.find((value) => value !== undefined);
const isDefined = (value) => value !== undefined && value !== null;

const normalizeDevices = (list, prefix) => {
  if (!Array.isArray(list) || list.length === 0) {
    return [{ id: `${prefix}_default`, name: "System Default" }];
  }

  return list.map((entry, index) => {
    if (typeof entry === "string") {
      return { id: entry, name: entry };
    }

    const id =
      firstDefined(entry.id, entry.device_id, entry.value, entry.name) ??
      `${prefix}_${index}`;
    const name = firstDefined(entry.name, entry.label, entry.device_name, id);
    return { id: String(id), name: String(name) };
  });
};

const coerceSelectedDeviceId = (candidate, devices) => {
  const normalized = isDefined(candidate) ? String(candidate) : "";
  if (devices.some((device) => device.id === normalized)) {
    return normalized;
  }
  return devices[0]?.id ?? "";
};

const normalizeApps = (rawApps, previousApps = []) => {
  const list = Array.isArray(rawApps)
    ? rawApps
    : rawApps && typeof rawApps === "object"
      ? Object.values(rawApps)
      : [];

  const previousById = new Map(previousApps.map((item) => [item.id, item]));

  return list.map((entry, index) => {
    const id = String(
      firstDefined(entry.id, entry.app, entry.app_id, entry.pid, `app_${index}`)
    );
    const previous = previousById.get(id);
    const volume = clampPercent(
      firstDefined(entry.v, entry.volume, entry.vol, previous?.volume, 0)
    );
    const muted = Boolean(
      firstDefined(entry.mu, entry.muted, entry.is_muted, previous?.muted, false)
    );
    const level = toMeterPercent(
      firstDefined(entry.peak, entry.lvl, entry.level, previous?.level, 0)
    );
    const icon = firstDefined(entry.icon, entry.logo, entry.image, previous?.icon, "");
    const outputCandidate = firstDefined(
      entry.output_device,
      entry.out,
      entry.outputDevice,
      previous?.outputDeviceId,
      ""
    );
    const inputCandidate = firstDefined(
      entry.input_device,
      entry.in,
      entry.inputDevice,
      previous?.inputDeviceId,
      ""
    );
    const hasOutputCandidate = isDefined(outputCandidate);
    const hasInputCandidate = isDefined(inputCandidate);

    return {
      id,
      name: String(firstDefined(entry.name, entry.app_name, entry.title, id)),
      volume,
      muted,
      level,
      icon,
      outputDeviceId: hasOutputCandidate
        ? String(outputCandidate)
        : previous?.outputDeviceId || "",
      inputDeviceId: hasInputCandidate
        ? String(inputCandidate)
        : previous?.inputDeviceId || "",
    };
  });
};

const normalizeState = (message, previousState) => {
  const state = message?.d ?? message?.state ?? message ?? {};

  const outputDevices = normalizeDevices(
    firstDefined(
      state.output_devices,
      state.outputs,
      state.devices?.outputs,
      previousState.outputDevices
    ),
    "out"
  );
  const inputDevices = normalizeDevices(
    firstDefined(
      state.input_devices,
      state.inputs,
      state.devices?.inputs,
      previousState.inputDevices
    ),
    "in"
  );

  const outputDeviceId = coerceSelectedDeviceId(
    firstDefined(
      state.default_output_device,
      state.output_device_id,
      state.output_id,
      state.devices?.output_id,
      previousState.outputDeviceId,
      outputDevices[0]?.id,
      ""
    ),
    outputDevices
  );
  const inputDeviceId = coerceSelectedDeviceId(
    firstDefined(
      state.default_input_device,
      state.input_device_id,
      state.input_id,
      state.devices?.input_id,
      previousState.inputDeviceId,
      inputDevices[0]?.id,
      ""
    ),
    inputDevices
  );

  return {
    masterVolume: clampPercent(
      firstDefined(
        state.master_volume,
        state.masterVolume,
        state.mv,
        state.master?.volume,
        previousState.masterVolume
      )
    ),
    masterMuted: Boolean(
      firstDefined(
        state.master_muted,
        state.masterMuted,
        state.master?.muted,
        previousState.masterMuted
      )
    ),
    micMuted: Boolean(
      firstDefined(
        state.mic_muted,
        state.micMuted,
        state.mm,
        state.mic?.muted,
        previousState.micMuted
      )
    ),
    apps: normalizeApps(
      firstDefined(state.apps, state.mixer, state.applications, previousState.apps),
      previousState.apps
    ),
    outputDevices,
    inputDevices,
    outputDeviceId,
    inputDeviceId,
  };
};

const applyLevels = (message, previousState) => {
  const levels = {};
  const payload = message?.d ?? message ?? {};

  if (Array.isArray(payload.apps)) {
    payload.apps.forEach((entry) => {
      if (Array.isArray(entry) && entry.length >= 2) {
        levels[String(entry[0])] = toMeterPercent(entry[1]);
        return;
      }

      const key = firstDefined(entry.app, entry.id, entry.app_id, entry[0]);
      if (key !== undefined) {
        levels[String(key)] = toMeterPercent(
          firstDefined(entry.peak, entry.lvl, entry.level, entry.vu, entry[1])
        );
      }
    });
  }

  const mapObject = firstDefined(payload.app_levels, payload.levels);
  if (mapObject && typeof mapObject === "object" && !Array.isArray(mapObject)) {
    Object.entries(mapObject).forEach(([key, value]) => {
      levels[String(key)] = toMeterPercent(value);
    });
  }

  const singleKey = firstDefined(payload.app, payload.id, payload.app_id);
  if (
    singleKey !== undefined &&
    firstDefined(payload.lvl, payload.level, payload.peak) !== undefined
  ) {
    levels[String(singleKey)] = toMeterPercent(
      firstDefined(payload.lvl, payload.level, payload.peak)
    );
  }

  if (Object.keys(levels).length === 0) {
    return previousState;
  }

  return {
    ...previousState,
    apps: previousState.apps.map((app) =>
      levels[app.id] === undefined ? app : { ...app, level: levels[app.id] }
    ),
  };
};

const SESSION_KEYS = ["sid", "sessionId", "session_id", "session"];
const CODE_KEYS = ["code", "pairCode", "pair_code", "pairingCode", "pin"];

const buildPairingPayload = (sidValue, codeValue) => {
  const sid = String(sidValue ?? "").trim();
  const code = String(codeValue ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);

  if (!sid || code.length !== 6) {
    return null;
  }

  return { sid, code };
};

const readParams = (params) =>
  buildPairingPayload(
    SESSION_KEYS.map((key) => params.get(key)).find((value) => value?.trim()),
    CODE_KEYS.map((key) => params.get(key)).find(
      (value) => String(value ?? "").replace(/\D/g, "").length >= 6
    )
  );

const readObject = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return buildPairingPayload(
    firstDefined(
      value.sid,
      value.sessionId,
      value.session_id,
      value.session,
      value.id
    ),
    firstDefined(
      value.code,
      value.pairCode,
      value.pair_code,
      value.pairingCode,
      value.pin
    )
  );
};

const parseQRCode = (text) => {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("{")) {
    try {
      const parsed = readObject(JSON.parse(raw));
      if (parsed) {
        return parsed;
      }
    } catch {
      // Ignore malformed JSON payloads and continue with other formats.
    }
  }

  const urlCandidates = [raw];
  if (!raw.includes("://") && (raw.includes("=") || raw.startsWith("?"))) {
    urlCandidates.push(
      `https://pair.audiobit.app/${raw.startsWith("?") ? raw : `?${raw}`}`
    );
  }

  for (const candidate of urlCandidates) {
    try {
      const url = new URL(candidate);
      const fromSearch = readParams(url.searchParams);
      if (fromSearch) {
        return fromSearch;
      }

      if (url.hash.includes("=")) {
        const fromHash = readParams(
          new URLSearchParams(url.hash.replace(/^#/, "").replace(/^\?/, ""))
        );
        if (fromHash) {
          return fromHash;
        }
      }
    } catch {
      // Ignore invalid URL candidates.
    }
  }

  const sessionMatch = raw.match(
    /(?:sid|session(?:_id)?|sessionId)\s*[:=]\s*([a-z0-9_-]+)/i
  );
  const codeMatch = raw.match(
    /(?:pair(?:ing)?_?\s*code|pairCode|code|pin)\s*[:=]\s*(\d{6})/i
  );

  return buildPairingPayload(sessionMatch?.[1], codeMatch?.[1]);
};

export default function App() {
  const [screen, setScreen] = useState("connect");
  const [sessionId, setSessionId] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [connectStatus, setConnectStatus] = useState("idle");
  const [connectError, setConnectError] = useState("");
  const [audioState, setAudioState] = useState(INITIAL_AUDIO_STATE);
  const [relayOnline, setRelayOnline] = useState(false);
  const [toast, setToast] = useState(null);
  const [pulseKey, setPulseKey] = useState("");

  const socketRef = useRef(null);
  const screenRef = useRef("connect");
  const toastTimeoutRef = useRef(null);
  const transitionTimeoutRef = useRef(null);
  const pulseTimeoutRef = useRef(null);
  const autoConnectAttemptedRef = useRef(false);
  const masterVolumeDebounceRef = useRef(null);
  const appVolumeDebounceRef = useRef(new Map());
  const pendingMasterVolumeUntilRef = useRef(0);
  const pendingAppVolumeUntilRef = useRef(new Map());
  const pendingOutputDeviceUntilRef = useRef(0);
  const pendingInputDeviceUntilRef = useRef(0);
  const pendingAppOutputDeviceUntilRef = useRef(new Map());
  const pendingAppInputDeviceUntilRef = useRef(new Map());

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  const showToast = useCallback((message, tone = "ok") => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    const id = Date.now();
    setToast({ id, message, tone });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 2400);
  }, []);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setRelayOnline(false);
    pendingMasterVolumeUntilRef.current = 0;
    pendingAppVolumeUntilRef.current.clear();
    pendingOutputDeviceUntilRef.current = 0;
    pendingInputDeviceUntilRef.current = 0;
    pendingAppOutputDeviceUntilRef.current.clear();
    pendingAppInputDeviceUntilRef.current.clear();
    if (masterVolumeDebounceRef.current) {
      clearTimeout(masterVolumeDebounceRef.current);
      masterVolumeDebounceRef.current = null;
    }
    appVolumeDebounceRef.current.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    appVolumeDebounceRef.current.clear();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("sid") || "";
    const code = (params.get("code") || "").replace(/\D/g, "").slice(0, 6);
    if (sid) {
      setSessionId(sid);
    }
    if (code) {
      setPairCode(code);
    }
  }, []);

  useEffect(
    () => () => {
      closeSocket();
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
      }
      if (masterVolumeDebounceRef.current) {
        clearTimeout(masterVolumeDebounceRef.current);
      }
      appVolumeDebounceRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      appVolumeDebounceRef.current.clear();
    },
    [closeSocket]
  );

  const triggerPulse = useCallback((key) => {
    if (!key) {
      return;
    }
    setPulseKey("");
    requestAnimationFrame(() => setPulseKey(key));
    if (pulseTimeoutRef.current) {
      clearTimeout(pulseTimeoutRef.current);
    }
    pulseTimeoutRef.current = setTimeout(() => setPulseKey(""), 520);
  }, []);

  const resetConnectFeedback = useCallback(() => {
    setConnectError("");
    setConnectStatus((current) => (current === "error" ? "idle" : current));
  }, []);

  const connectWith = useCallback(
    (sid, code) => {
      const normalizedSid = sid.trim();
      const normalizedCode = code.replace(/\D/g, "").slice(0, 6);

      if (!normalizedSid || normalizedCode.length !== 6) {
        setConnectError("Enter a valid Session ID and 6-digit pairing code.");
        setConnectStatus("error");
        return;
      }

      setSessionId(normalizedSid);
      setPairCode(normalizedCode);
      setConnectStatus("connecting");
      setConnectError("");
      setRelayOnline(false);

      closeSocket();
      const socket = new AudioBitWebSocket(RELAY_WS_URL);
      socketRef.current = socket;

      let established = false;
      const timeout = setTimeout(() => {
        if (established) {
          return;
        }
        socket.close();
        setConnectStatus("error");
        setConnectError("Pairing timed out. Confirm session ID and code.");
      }, 10000);

      const onConnected = () => {
        if (established) {
          return;
        }
        established = true;
        clearTimeout(timeout);
        setConnectStatus("connected");
        setConnectError("");
        setRelayOnline(true);
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
        }
        transitionTimeoutRef.current = setTimeout(() => {
          setScreen("control");
        }, 700);
      };

      socket.connect({
        sid: normalizedSid,
        pairCode: normalizedCode,
        handlers: {
          onReady: onConnected,
          onState: (message) => {
            setAudioState((previous) => {
              const now = Date.now();
              const next = normalizeState(message, previous);

              if (pendingMasterVolumeUntilRef.current > now) {
                next.masterVolume = previous.masterVolume;
              } else {
                pendingMasterVolumeUntilRef.current = 0;
              }

              if (pendingOutputDeviceUntilRef.current > now) {
                next.outputDeviceId = previous.outputDeviceId;
              } else {
                pendingOutputDeviceUntilRef.current = 0;
              }

              if (pendingInputDeviceUntilRef.current > now) {
                next.inputDeviceId = previous.inputDeviceId;
              } else {
                pendingInputDeviceUntilRef.current = 0;
              }

              if (
                pendingAppVolumeUntilRef.current.size > 0 ||
                pendingAppOutputDeviceUntilRef.current.size > 0 ||
                pendingAppInputDeviceUntilRef.current.size > 0
              ) {
                const previousById = new Map(previous.apps.map((app) => [app.id, app]));
                next.apps = next.apps.map((app) => {
                  const previousApp = previousById.get(app.id);
                  if (!previousApp) {
                    return app;
                  }

                  let nextApp = app;

                  const volumeUntil = pendingAppVolumeUntilRef.current.get(app.id);
                  if (volumeUntil) {
                    if (volumeUntil <= now) {
                      pendingAppVolumeUntilRef.current.delete(app.id);
                    } else {
                      nextApp = { ...nextApp, volume: previousApp.volume };
                    }
                  }

                  const outputUntil = pendingAppOutputDeviceUntilRef.current.get(app.id);
                  if (outputUntil) {
                    if (outputUntil <= now) {
                      pendingAppOutputDeviceUntilRef.current.delete(app.id);
                    } else {
                      nextApp = {
                        ...nextApp,
                        outputDeviceId: previousApp.outputDeviceId,
                      };
                    }
                  }

                  const inputUntil = pendingAppInputDeviceUntilRef.current.get(app.id);
                  if (inputUntil) {
                    if (inputUntil <= now) {
                      pendingAppInputDeviceUntilRef.current.delete(app.id);
                    } else {
                      nextApp = {
                        ...nextApp,
                        inputDeviceId: previousApp.inputDeviceId,
                      };
                    }
                  }

                  return nextApp;
                });
              }

              return next;
            });
            onConnected();
          },
          onLevel: (message) => {
            setAudioState((previous) => applyLevels(message, previous));
          },
          onCmdResult: (message) => {
            const result = message?.d ?? message;
            const okRaw = firstDefined(result.ok, result.success, true);
            const ok = okRaw === true || okRaw === 1 || okRaw === "1";
            const error = firstDefined(result.err, result.error, result.code);
            const text = ok
              ? "Command applied."
              : error === "not_supported"
                ? "Soundboard clip is not supported on desktop yet."
                : `Command failed${error ? `: ${error}` : "."}`;
            showToast(text, ok ? "ok" : "warn");
          },
          onError: (message) => {
            if (established) {
              showToast(message, "warn");
              return;
            }
            clearTimeout(timeout);
            setConnectStatus("error");
            setConnectError(message);
          },
          onClose: () => {
            clearTimeout(timeout);
            if (!established) {
              setConnectStatus("error");
              setConnectError("Connection closed before pairing completed.");
              setRelayOnline(false);
              return;
            }
            if (screenRef.current === "control") {
              setScreen("connect");
              setConnectStatus("idle");
              setRelayOnline(false);
              showToast("Disconnected from AudioBit relay.", "warn");
            }
          },
        },
      });
    },
    [closeSocket, showToast]
  );

  const sendCommand = useCallback(
    (payload, key) => {
      const socket = socketRef.current;
      if (!socket || !socket.isOpen()) {
        showToast("Not connected to AudioBit.", "warn");
        return false;
      }
      socket.sendCommand(payload);
      triggerPulse(key);
      return true;
    },
    [showToast, triggerPulse]
  );

  const scheduleMasterVolumeCommand = useCallback(
    (volume) => {
      if (masterVolumeDebounceRef.current) {
        clearTimeout(masterVolumeDebounceRef.current);
      }
      masterVolumeDebounceRef.current = setTimeout(() => {
        sendCommand({ op: "set_master_volume", v: volume });
      }, 90);
    },
    [sendCommand]
  );

  const scheduleAppVolumeCommand = useCallback(
    (appId, volume) => {
      const existing = appVolumeDebounceRef.current.get(appId);
      if (existing) {
        clearTimeout(existing);
      }

      const timeoutId = setTimeout(() => {
        sendCommand({ op: "set_app_volume", app: appId, v: volume });
        appVolumeDebounceRef.current.delete(appId);
      }, 90);

      appVolumeDebounceRef.current.set(appId, timeoutId);
    },
    [sendCommand]
  );

  const handleMasterVolumeChange = useCallback(
    (volume) => {
      const next = clampPercent(volume);
      pendingMasterVolumeUntilRef.current = Date.now() + 650;
      setAudioState((previous) => ({ ...previous, masterVolume: next }));
      scheduleMasterVolumeCommand(next);
    },
    [scheduleMasterVolumeCommand]
  );

  const handleMasterMuteToggle = useCallback(() => {
    setAudioState((previous) => {
      const nextMuted = !previous.masterMuted;
      sendCommand({ op: "mute_master", mu: nextMuted }, "mute_master");
      return { ...previous, masterMuted: nextMuted };
    });
  }, [sendCommand]);

  const handleMicToggle = useCallback(() => {
    setAudioState((previous) => {
      const nextMuted = !previous.micMuted;
      sendCommand({ op: "mute_mic", mu: nextMuted }, "mute_mic");
      return { ...previous, micMuted: nextMuted };
    });
  }, [sendCommand]);

  const handleAppVolumeChange = useCallback((appId, volume) => {
    const next = clampPercent(volume);
    pendingAppVolumeUntilRef.current.set(appId, Date.now() + 650);
    setAudioState((previous) => ({
      ...previous,
      apps: previous.apps.map((app) => (app.id === appId ? { ...app, volume: next } : app)),
    }));
    scheduleAppVolumeCommand(appId, next);
  }, [scheduleAppVolumeCommand]);

  const handleAppMuteToggle = useCallback(
    (appId, muted) => {
      setAudioState((previous) => ({
        ...previous,
        apps: previous.apps.map((app) => (app.id === appId ? { ...app, muted } : app)),
      }));
      sendCommand({ op: "mute_app", app: appId, mu: muted }, `mute_app:${appId}`);
    },
    [sendCommand]
  );

  const handleAppOutputDeviceChange = useCallback((appId, deviceId) => {
    if (!isDefined(deviceId)) {
      return;
    }
    const normalizedDeviceId = String(deviceId);
    pendingAppOutputDeviceUntilRef.current.set(appId, Date.now() + 900);
    setAudioState((previous) => ({
      ...previous,
      apps: previous.apps.map((app) =>
        app.id === appId ? { ...app, outputDeviceId: normalizedDeviceId } : app
      ),
    }));
    sendCommand(
      { op: "set_app_output_device", app: appId, out: normalizedDeviceId }
    );
  }, [sendCommand]);

  const handleAppInputDeviceChange = useCallback((appId, deviceId) => {
    if (!isDefined(deviceId)) {
      return;
    }
    const normalizedDeviceId = String(deviceId);
    pendingAppInputDeviceUntilRef.current.set(appId, Date.now() + 900);
    setAudioState((previous) => ({
      ...previous,
      apps: previous.apps.map((app) =>
        app.id === appId ? { ...app, inputDeviceId: normalizedDeviceId } : app
      ),
    }));
    sendCommand(
      { op: "set_app_input_device", app: appId, in: normalizedDeviceId }
    );
  }, [sendCommand]);

  const handleOutputDeviceChange = useCallback((deviceId) => {
    if (!isDefined(deviceId)) {
      return;
    }
    const normalizedDeviceId = String(deviceId);
    pendingOutputDeviceUntilRef.current = Date.now() + 900;
    setAudioState((previous) => ({
      ...previous,
      outputDeviceId: normalizedDeviceId,
    }));
    sendCommand({ op: "set_output_device", out: normalizedDeviceId });
  }, [sendCommand]);

  const handleInputDeviceChange = useCallback((deviceId) => {
    if (!isDefined(deviceId)) {
      return;
    }
    const normalizedDeviceId = String(deviceId);
    pendingInputDeviceUntilRef.current = Date.now() + 900;
    setAudioState((previous) => ({
      ...previous,
      inputDeviceId: normalizedDeviceId,
    }));
    sendCommand({ op: "set_input_device", in: normalizedDeviceId });
  }, [sendCommand]);

  const handlePlaySoundboard = useCallback(() => {
    sendCommand({ op: "play_soundboard_clip" }, "play_soundboard_clip");
  }, [sendCommand]);

  const handleQRScanText = useCallback(
    (text) => {
      const parsed = parseQRCode(text);
      if (!parsed) {
        setConnectError("This QR code is not a valid AudioBit pairing QR.");
        setConnectStatus("idle");
        return false;
      }

      setConnectError("");
      connectWith(parsed.sid, parsed.code);
      return true;
    },
    [connectWith]
  );

  const handleScannerError = useCallback((errorMessage) => {
    setConnectStatus("idle");
    setConnectError(errorMessage);
  }, []);

  const handleSessionIdChange = useCallback(
    (value) => {
      resetConnectFeedback();
      setSessionId(value);
    },
    [resetConnectFeedback]
  );

  const handlePairCodeChange = useCallback(
    (value) => {
      resetConnectFeedback();
      setPairCode(value);
    },
    [resetConnectFeedback]
  );

  useEffect(() => {
    if (autoConnectAttemptedRef.current) {
      return;
    }
    if (screen !== "connect" || connectStatus !== "idle") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const sid = (params.get("sid") || "").trim();
    const code = (params.get("code") || "").replace(/\D/g, "").slice(0, 6);
    if (!sid || code.length !== 6) {
      return;
    }

    autoConnectAttemptedRef.current = true;
    connectWith(sid, code);
  }, [connectStatus, screen, connectWith]);

  return (
    <>
      {screen === "connect" ? (
        <Connect
          sessionId={sessionId}
          pairCode={pairCode}
          status={connectStatus}
          error={connectError}
          onSessionIdChange={handleSessionIdChange}
          onPairCodeChange={handlePairCodeChange}
          onConnect={() => connectWith(sessionId, pairCode)}
          onQRScanText={handleQRScanText}
          onScannerError={handleScannerError}
        />
      ) : (
        <Control
          connected={relayOnline}
          state={audioState}
          pulseKey={pulseKey}
          onMasterVolumeChange={handleMasterVolumeChange}
          onMasterMuteToggle={handleMasterMuteToggle}
          onMicToggle={handleMicToggle}
          onPlaySoundboard={handlePlaySoundboard}
          onAppVolumeChange={handleAppVolumeChange}
          onAppMuteToggle={handleAppMuteToggle}
          onAppOutputDeviceChange={handleAppOutputDeviceChange}
          onAppInputDeviceChange={handleAppInputDeviceChange}
          onOutputDeviceChange={handleOutputDeviceChange}
          onInputDeviceChange={handleInputDeviceChange}
        />
      )}

      {toast ? (
        <aside className={`toast toast-${toast.tone}`} role="status">
          {toast.message}
        </aside>
      ) : null}
    </>
  );
}
