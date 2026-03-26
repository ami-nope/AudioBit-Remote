import { useCallback, useEffect, useRef, useState } from "react";
import Connect from "./pages/Connect";
import Control from "./pages/Control";
import { AudioBitWebSocket, RELAY_WS_URL } from "./services/websocket";

const HOST_CONNECTION_LIMIT = 2;

const createInitialAudioState = () => ({
  masterVolume: 70,
  masterMuted: false,
  micMuted: false,
  apps: [],
  outputDevices: [{ id: "default_out", name: "Default Output" }],
  inputDevices: [{ id: "default_in", name: "Default Input" }],
  outputDeviceId: "default_out",
  inputDeviceId: "default_in",
});

const createHostSlot = () => ({
  sessionId: "",
  pairCode: "",
  connectStatus: "idle",
  connectError: "",
  audioState: createInitialAudioState(),
  relayOnline: false,
  pulseKey: "",
});

const createInitialHostSlots = () =>
  Array.from({ length: HOST_CONNECTION_LIMIT }, () => createHostSlot());

const getHostLabel = (slotIndex) => `Host ${slotIndex + 1}`;

const findOtherConnectedHostIndex = (hostSlots, excludedIndex) =>
  hostSlots.findIndex((slot, index) => index !== excludedIndex && slot.relayOnline);

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
  const [hostSlots, setHostSlots] = useState(() => createInitialHostSlots());
  const [activeHostIndex, setActiveHostIndex] = useState(0);
  const [toast, setToast] = useState(null);

  const screenRef = useRef("connect");
  const hostSlotsRef = useRef(hostSlots);
  const activeHostIndexRef = useRef(0);
  const toastTimeoutRef = useRef(null);
  const socketsRef = useRef(Array.from({ length: HOST_CONNECTION_LIMIT }, () => null));
  const pairingTimeoutRef = useRef(Array.from({ length: HOST_CONNECTION_LIMIT }, () => null));
  const transitionTimeoutRef = useRef(
    Array.from({ length: HOST_CONNECTION_LIMIT }, () => null)
  );
  const pulseTimeoutRef = useRef(Array.from({ length: HOST_CONNECTION_LIMIT }, () => null));
  const autoConnectAttemptedRef = useRef(false);
  const masterVolumeDebounceRef = useRef(
    Array.from({ length: HOST_CONNECTION_LIMIT }, () => null)
  );
  const appVolumeDebounceRef = useRef(
    Array.from({ length: HOST_CONNECTION_LIMIT }, () => new Map())
  );
  const pendingMasterVolumeUntilRef = useRef(
    Array.from({ length: HOST_CONNECTION_LIMIT }, () => 0)
  );
  const pendingAppVolumeUntilRef = useRef(
    Array.from({ length: HOST_CONNECTION_LIMIT }, () => new Map())
  );
  const pendingOutputDeviceUntilRef = useRef(
    Array.from({ length: HOST_CONNECTION_LIMIT }, () => 0)
  );
  const pendingInputDeviceUntilRef = useRef(
    Array.from({ length: HOST_CONNECTION_LIMIT }, () => 0)
  );
  const pendingAppOutputDeviceUntilRef = useRef(
    Array.from({ length: HOST_CONNECTION_LIMIT }, () => new Map())
  );
  const pendingAppInputDeviceUntilRef = useRef(
    Array.from({ length: HOST_CONNECTION_LIMIT }, () => new Map())
  );

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    hostSlotsRef.current = hostSlots;
  }, [hostSlots]);

  useEffect(() => {
    activeHostIndexRef.current = activeHostIndex;
  }, [activeHostIndex]);

  const clearSlotTimeout = useCallback((timeoutsRef, slotIndex) => {
    const timeoutId = timeoutsRef.current[slotIndex];
    if (!timeoutId) {
      return;
    }
    clearTimeout(timeoutId);
    timeoutsRef.current[slotIndex] = null;
  }, []);

  const setHostSlot = useCallback((slotIndex, updater) => {
    setHostSlots((previous) =>
      previous.map((slot, index) => {
        if (index !== slotIndex) {
          return slot;
        }
        return typeof updater === "function" ? updater(slot) : { ...slot, ...updater };
      })
    );
  }, []);

  const showToast = useCallback((message, tone = "ok") => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    const id = Date.now();
    setToast({ id, message, tone });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
      toastTimeoutRef.current = null;
    }, 2400);
  }, []);

  const clearHostCommandState = useCallback(
    (slotIndex) => {
      pendingMasterVolumeUntilRef.current[slotIndex] = 0;
      pendingAppVolumeUntilRef.current[slotIndex].clear();
      pendingOutputDeviceUntilRef.current[slotIndex] = 0;
      pendingInputDeviceUntilRef.current[slotIndex] = 0;
      pendingAppOutputDeviceUntilRef.current[slotIndex].clear();
      pendingAppInputDeviceUntilRef.current[slotIndex].clear();

      clearSlotTimeout(masterVolumeDebounceRef, slotIndex);

      appVolumeDebounceRef.current[slotIndex].forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      appVolumeDebounceRef.current[slotIndex].clear();

      clearSlotTimeout(pulseTimeoutRef, slotIndex);
    },
    [clearSlotTimeout]
  );

  const disposeHostConnection = useCallback(
    (slotIndex) => {
      clearSlotTimeout(pairingTimeoutRef, slotIndex);
      clearSlotTimeout(transitionTimeoutRef, slotIndex);
      clearHostCommandState(slotIndex);

      const socket = socketsRef.current[slotIndex];
      if (!socket) {
        return;
      }

      socket.close();
      socketsRef.current[slotIndex] = null;
    },
    [clearHostCommandState, clearSlotTimeout]
  );

  useEffect(
    () => () => {
      for (let slotIndex = 0; slotIndex < HOST_CONNECTION_LIMIT; slotIndex += 1) {
        disposeHostConnection(slotIndex);
      }

      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    },
    [disposeHostConnection]
  );

  const triggerPulse = useCallback(
    (slotIndex, key) => {
      if (!key) {
        return;
      }

      setHostSlot(slotIndex, (slot) => ({ ...slot, pulseKey: "" }));
      requestAnimationFrame(() => {
        setHostSlot(slotIndex, (slot) => ({ ...slot, pulseKey: key }));
      });

      clearSlotTimeout(pulseTimeoutRef, slotIndex);
      pulseTimeoutRef.current[slotIndex] = setTimeout(() => {
        setHostSlot(slotIndex, (slot) => ({ ...slot, pulseKey: "" }));
        pulseTimeoutRef.current[slotIndex] = null;
      }, 520);
    },
    [clearSlotTimeout, setHostSlot]
  );

  const resetConnectFeedback = useCallback(
    (slotIndex) => {
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        connectError: "",
        connectStatus: slot.connectStatus === "error" ? "idle" : slot.connectStatus,
      }));
    },
    [setHostSlot]
  );

  const selectHostSlot = useCallback((slotIndex) => {
    setActiveHostIndex(slotIndex);

    const slot = hostSlotsRef.current[slotIndex];
    if (!slot) {
      return;
    }

    setScreen(slot.relayOnline || slot.connectStatus === "connected" ? "control" : "connect");
  }, []);

  const connectWith = useCallback(
    (slotIndex, sid, code) => {
      const normalizedSid = sid.trim();
      const normalizedCode = code.replace(/\D/g, "").slice(0, 6);

      setActiveHostIndex(slotIndex);
      setScreen("connect");

      if (!normalizedSid || normalizedCode.length !== 6) {
        setHostSlot(slotIndex, (slot) => ({
          ...slot,
          connectError: "Enter a valid Session ID and 6-digit pairing code.",
          connectStatus: "error",
        }));
        return;
      }

      disposeHostConnection(slotIndex);
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        sessionId: normalizedSid,
        pairCode: normalizedCode,
        connectStatus: "connecting",
        connectError: "",
        relayOnline: false,
        pulseKey: "",
      }));

      const socket = new AudioBitWebSocket(RELAY_WS_URL);
      socketsRef.current[slotIndex] = socket;

      let established = false;
      let connectFailureMessage = "";
      let failureToastShown = false;

      const onConnected = () => {
        if (established || socketsRef.current[slotIndex] !== socket) {
          return;
        }

        established = true;
        clearSlotTimeout(pairingTimeoutRef, slotIndex);
        setHostSlot(slotIndex, (slot) => ({
          ...slot,
          connectStatus: "connected",
          connectError: "",
          relayOnline: true,
        }));

        const isForegroundConnect =
          activeHostIndexRef.current === slotIndex && screenRef.current === "connect";

        if (isForegroundConnect) {
          clearSlotTimeout(transitionTimeoutRef, slotIndex);
          transitionTimeoutRef.current[slotIndex] = setTimeout(() => {
            transitionTimeoutRef.current[slotIndex] = null;
            if (activeHostIndexRef.current === slotIndex) {
              setScreen("control");
            }
          }, 700);
          return;
        }

        showToast(`${getHostLabel(slotIndex)} connected.`, "ok");
      };

      pairingTimeoutRef.current[slotIndex] = setTimeout(() => {
        if (established || socketsRef.current[slotIndex] !== socket) {
          return;
        }

        connectFailureMessage = "Pairing timed out. Confirm session ID and code.";
        socket.close();
        pairingTimeoutRef.current[slotIndex] = null;
        setHostSlot(slotIndex, (slot) => ({
          ...slot,
          relayOnline: false,
          connectStatus: "error",
          connectError: connectFailureMessage,
        }));

        if (activeHostIndexRef.current !== slotIndex || screenRef.current !== "connect") {
          showToast(`${getHostLabel(slotIndex)} pairing timed out.`, "warn");
          failureToastShown = true;
        }
      }, 10000);

      socket.connect({
        sid: normalizedSid,
        pairCode: normalizedCode,
        handlers: {
          onReady: onConnected,
          onState: (message) => {
            if (socketsRef.current[slotIndex] !== socket) {
              return;
            }

            setHostSlot(slotIndex, (slot) => {
              const now = Date.now();
              const nextAudioState = normalizeState(message, slot.audioState);

              if (pendingMasterVolumeUntilRef.current[slotIndex] > now) {
                nextAudioState.masterVolume = slot.audioState.masterVolume;
              } else {
                pendingMasterVolumeUntilRef.current[slotIndex] = 0;
              }

              if (pendingOutputDeviceUntilRef.current[slotIndex] > now) {
                nextAudioState.outputDeviceId = slot.audioState.outputDeviceId;
              } else {
                pendingOutputDeviceUntilRef.current[slotIndex] = 0;
              }

              if (pendingInputDeviceUntilRef.current[slotIndex] > now) {
                nextAudioState.inputDeviceId = slot.audioState.inputDeviceId;
              } else {
                pendingInputDeviceUntilRef.current[slotIndex] = 0;
              }

              if (
                pendingAppVolumeUntilRef.current[slotIndex].size > 0 ||
                pendingAppOutputDeviceUntilRef.current[slotIndex].size > 0 ||
                pendingAppInputDeviceUntilRef.current[slotIndex].size > 0
              ) {
                const previousById = new Map(
                  slot.audioState.apps.map((app) => [app.id, app])
                );

                nextAudioState.apps = nextAudioState.apps.map((app) => {
                  const previousApp = previousById.get(app.id);
                  if (!previousApp) {
                    return app;
                  }

                  let nextApp = app;

                  const volumeUntil = pendingAppVolumeUntilRef.current[slotIndex].get(app.id);
                  if (volumeUntil) {
                    if (volumeUntil <= now) {
                      pendingAppVolumeUntilRef.current[slotIndex].delete(app.id);
                    } else {
                      nextApp = { ...nextApp, volume: previousApp.volume };
                    }
                  }

                  const outputUntil =
                    pendingAppOutputDeviceUntilRef.current[slotIndex].get(app.id);
                  if (outputUntil) {
                    if (outputUntil <= now) {
                      pendingAppOutputDeviceUntilRef.current[slotIndex].delete(app.id);
                    } else {
                      nextApp = {
                        ...nextApp,
                        outputDeviceId: previousApp.outputDeviceId,
                      };
                    }
                  }

                  const inputUntil =
                    pendingAppInputDeviceUntilRef.current[slotIndex].get(app.id);
                  if (inputUntil) {
                    if (inputUntil <= now) {
                      pendingAppInputDeviceUntilRef.current[slotIndex].delete(app.id);
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

              return {
                ...slot,
                audioState: nextAudioState,
              };
            });

            onConnected();
          },
          onLevel: (message) => {
            if (socketsRef.current[slotIndex] !== socket) {
              return;
            }

            setHostSlot(slotIndex, (slot) => ({
              ...slot,
              audioState: applyLevels(message, slot.audioState),
            }));
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

            showToast(`${getHostLabel(slotIndex)}: ${text}`, ok ? "ok" : "warn");
          },
          onError: (message) => {
            if (socketsRef.current[slotIndex] !== socket) {
              return;
            }

            if (established) {
              showToast(`${getHostLabel(slotIndex)}: ${message}`, "warn");
              return;
            }

            connectFailureMessage = message;
            clearSlotTimeout(pairingTimeoutRef, slotIndex);
            setHostSlot(slotIndex, (slot) => ({
              ...slot,
              connectStatus: "error",
              connectError: message,
              relayOnline: false,
            }));

            if (activeHostIndexRef.current !== slotIndex || screenRef.current !== "connect") {
              showToast(`${getHostLabel(slotIndex)}: ${message}`, "warn");
              failureToastShown = true;
            }
          },
          onClose: () => {
            if (socketsRef.current[slotIndex] !== socket) {
              return;
            }

            socketsRef.current[slotIndex] = null;
            clearSlotTimeout(pairingTimeoutRef, slotIndex);
            clearSlotTimeout(transitionTimeoutRef, slotIndex);
            clearHostCommandState(slotIndex);

            if (!established) {
              const message =
                connectFailureMessage || "Connection closed before pairing completed.";

              setHostSlot(slotIndex, (slot) => ({
                ...slot,
                connectStatus: "error",
                connectError: message,
                relayOnline: false,
                pulseKey: "",
              }));

              if (activeHostIndexRef.current === slotIndex) {
                setScreen("connect");
              }

              if (
                (activeHostIndexRef.current !== slotIndex ||
                  screenRef.current !== "connect") &&
                !failureToastShown
              ) {
                showToast(`${getHostLabel(slotIndex)}: ${message}`, "warn");
              }

              return;
            }

            const fallbackHostIndex = findOtherConnectedHostIndex(
              hostSlotsRef.current,
              slotIndex
            );

            setHostSlot(slotIndex, (slot) => ({
              ...slot,
              connectStatus: "idle",
              relayOnline: false,
              pulseKey: "",
            }));

            if (activeHostIndexRef.current === slotIndex && screenRef.current === "control") {
              if (fallbackHostIndex >= 0) {
                setActiveHostIndex(fallbackHostIndex);
              } else {
                setScreen("connect");
              }
            }

            showToast(`${getHostLabel(slotIndex)} disconnected from AudioBit relay.`, "warn");
          },
        },
      });
    },
    [
      clearHostCommandState,
      clearSlotTimeout,
      disposeHostConnection,
      setHostSlot,
      showToast,
    ]
  );

  const sendCommand = useCallback(
    (slotIndex, payload, key) => {
      const socket = socketsRef.current[slotIndex];
      if (!socket || !socket.isOpen()) {
        showToast(`${getHostLabel(slotIndex)} is not connected.`, "warn");
        return false;
      }

      socket.sendCommand(payload);
      triggerPulse(slotIndex, key);
      return true;
    },
    [showToast, triggerPulse]
  );

  const scheduleMasterVolumeCommand = useCallback(
    (slotIndex, volume) => {
      clearSlotTimeout(masterVolumeDebounceRef, slotIndex);
      masterVolumeDebounceRef.current[slotIndex] = setTimeout(() => {
        masterVolumeDebounceRef.current[slotIndex] = null;
        sendCommand(slotIndex, { op: "set_master_volume", v: volume });
      }, 90);
    },
    [clearSlotTimeout, sendCommand]
  );

  const scheduleAppVolumeCommand = useCallback(
    (slotIndex, appId, volume) => {
      const existing = appVolumeDebounceRef.current[slotIndex].get(appId);
      if (existing) {
        clearTimeout(existing);
      }

      const timeoutId = setTimeout(() => {
        sendCommand(slotIndex, { op: "set_app_volume", app: appId, v: volume });
        appVolumeDebounceRef.current[slotIndex].delete(appId);
      }, 90);

      appVolumeDebounceRef.current[slotIndex].set(appId, timeoutId);
    },
    [sendCommand]
  );

  const handleMasterVolumeChange = useCallback(
    (volume) => {
      const slotIndex = activeHostIndexRef.current;
      const next = clampPercent(volume);

      pendingMasterVolumeUntilRef.current[slotIndex] = Date.now() + 650;
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        audioState: {
          ...slot.audioState,
          masterVolume: next,
        },
      }));
      scheduleMasterVolumeCommand(slotIndex, next);
    },
    [scheduleMasterVolumeCommand, setHostSlot]
  );

  const handleMasterMuteToggle = useCallback(() => {
    const slotIndex = activeHostIndexRef.current;
    const slot = hostSlotsRef.current[slotIndex];
    if (!slot) {
      return;
    }

    const nextMuted = !slot.audioState.masterMuted;
    setHostSlot(slotIndex, (current) => ({
      ...current,
      audioState: {
        ...current.audioState,
        masterMuted: nextMuted,
      },
    }));
    sendCommand(slotIndex, { op: "mute_master", mu: nextMuted }, "mute_master");
  }, [sendCommand, setHostSlot]);

  const handleMicToggle = useCallback(() => {
    const slotIndex = activeHostIndexRef.current;
    const slot = hostSlotsRef.current[slotIndex];
    if (!slot) {
      return;
    }

    const nextMuted = !slot.audioState.micMuted;
    setHostSlot(slotIndex, (current) => ({
      ...current,
      audioState: {
        ...current.audioState,
        micMuted: nextMuted,
      },
    }));
    sendCommand(slotIndex, { op: "mute_mic", mu: nextMuted }, "mute_mic");
  }, [sendCommand, setHostSlot]);

  const handleAppVolumeChange = useCallback(
    (appId, volume) => {
      const slotIndex = activeHostIndexRef.current;
      const next = clampPercent(volume);

      pendingAppVolumeUntilRef.current[slotIndex].set(appId, Date.now() + 650);
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        audioState: {
          ...slot.audioState,
          apps: slot.audioState.apps.map((app) =>
            app.id === appId ? { ...app, volume: next } : app
          ),
        },
      }));
      scheduleAppVolumeCommand(slotIndex, appId, next);
    },
    [scheduleAppVolumeCommand, setHostSlot]
  );

  const handleAppMuteToggle = useCallback(
    (appId, muted) => {
      const slotIndex = activeHostIndexRef.current;

      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        audioState: {
          ...slot.audioState,
          apps: slot.audioState.apps.map((app) =>
            app.id === appId ? { ...app, muted } : app
          ),
        },
      }));
      sendCommand(slotIndex, { op: "mute_app", app: appId, mu: muted }, `mute_app:${appId}`);
    },
    [sendCommand, setHostSlot]
  );

  const handleAppOutputDeviceChange = useCallback(
    (appId, deviceId) => {
      const slotIndex = activeHostIndexRef.current;
      if (!isDefined(deviceId)) {
        return;
      }

      const normalizedDeviceId = String(deviceId);
      pendingAppOutputDeviceUntilRef.current[slotIndex].set(appId, Date.now() + 900);
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        audioState: {
          ...slot.audioState,
          apps: slot.audioState.apps.map((app) =>
            app.id === appId ? { ...app, outputDeviceId: normalizedDeviceId } : app
          ),
        },
      }));
      sendCommand(slotIndex, {
        op: "set_app_output_device",
        app: appId,
        out: normalizedDeviceId,
      });
    },
    [sendCommand, setHostSlot]
  );

  const handleAppInputDeviceChange = useCallback(
    (appId, deviceId) => {
      const slotIndex = activeHostIndexRef.current;
      if (!isDefined(deviceId)) {
        return;
      }

      const normalizedDeviceId = String(deviceId);
      pendingAppInputDeviceUntilRef.current[slotIndex].set(appId, Date.now() + 900);
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        audioState: {
          ...slot.audioState,
          apps: slot.audioState.apps.map((app) =>
            app.id === appId ? { ...app, inputDeviceId: normalizedDeviceId } : app
          ),
        },
      }));
      sendCommand(slotIndex, {
        op: "set_app_input_device",
        app: appId,
        in: normalizedDeviceId,
      });
    },
    [sendCommand, setHostSlot]
  );

  const handleOutputDeviceChange = useCallback(
    (deviceId) => {
      const slotIndex = activeHostIndexRef.current;
      if (!isDefined(deviceId)) {
        return;
      }

      const normalizedDeviceId = String(deviceId);
      pendingOutputDeviceUntilRef.current[slotIndex] = Date.now() + 900;
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        audioState: {
          ...slot.audioState,
          outputDeviceId: normalizedDeviceId,
        },
      }));
      sendCommand(slotIndex, { op: "set_output_device", out: normalizedDeviceId });
    },
    [sendCommand, setHostSlot]
  );

  const handleInputDeviceChange = useCallback(
    (deviceId) => {
      const slotIndex = activeHostIndexRef.current;
      if (!isDefined(deviceId)) {
        return;
      }

      const normalizedDeviceId = String(deviceId);
      pendingInputDeviceUntilRef.current[slotIndex] = Date.now() + 900;
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        audioState: {
          ...slot.audioState,
          inputDeviceId: normalizedDeviceId,
        },
      }));
      sendCommand(slotIndex, { op: "set_input_device", in: normalizedDeviceId });
    },
    [sendCommand, setHostSlot]
  );

  const handlePlaySoundboard = useCallback(() => {
    const slotIndex = activeHostIndexRef.current;
    sendCommand(slotIndex, { op: "play_soundboard_clip" }, "play_soundboard_clip");
  }, [sendCommand]);

  const handleQRScanText = useCallback(
    (text) => {
      const slotIndex = activeHostIndexRef.current;
      const parsed = parseQRCode(text);

      if (!parsed) {
        setHostSlot(slotIndex, (slot) => ({
          ...slot,
          connectError: "This QR code is not a valid AudioBit pairing QR.",
          connectStatus: "idle",
        }));
        return false;
      }

      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        connectError: "",
      }));
      connectWith(slotIndex, parsed.sid, parsed.code);
      return true;
    },
    [connectWith, setHostSlot]
  );

  const handleScannerError = useCallback(
    (errorMessage) => {
      const slotIndex = activeHostIndexRef.current;
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        connectStatus: "idle",
        connectError: errorMessage,
      }));
    },
    [setHostSlot]
  );

  const handleSessionIdChange = useCallback(
    (value) => {
      const slotIndex = activeHostIndexRef.current;
      resetConnectFeedback(slotIndex);
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        sessionId: value,
      }));
    },
    [resetConnectFeedback, setHostSlot]
  );

  const handlePairCodeChange = useCallback(
    (value) => {
      const slotIndex = activeHostIndexRef.current;
      resetConnectFeedback(slotIndex);
      setHostSlot(slotIndex, (slot) => ({
        ...slot,
        pairCode: value,
      }));
    },
    [resetConnectFeedback, setHostSlot]
  );

  const handleAddHost = useCallback(() => {
    const nextSlotIndex = hostSlotsRef.current.findIndex(
      (slot) => !slot.relayOnline && slot.connectStatus !== "connecting"
    );

    if (nextSlotIndex < 0) {
      showToast("Two host connections are already active.", "warn");
      return;
    }

    setActiveHostIndex(nextSlotIndex);
    setScreen("connect");
  }, [showToast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = (params.get("sid") || "").trim();
    const code = (params.get("code") || "").replace(/\D/g, "").slice(0, 6);

    if (!sid && !code) {
      return;
    }

    setHostSlot(0, (slot) => ({
      ...slot,
      sessionId: sid || slot.sessionId,
      pairCode: code || slot.pairCode,
    }));
  }, [setHostSlot]);

  useEffect(() => {
    if (autoConnectAttemptedRef.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const sid = (params.get("sid") || "").trim();
    const code = (params.get("code") || "").replace(/\D/g, "").slice(0, 6);

    if (!sid || code.length !== 6) {
      return;
    }

    autoConnectAttemptedRef.current = true;
    connectWith(0, sid, code);
  }, [connectWith]);

  const activeHost = hostSlots[activeHostIndex] ?? hostSlots[0];
  const canAddHost = hostSlots.some(
    (slot) => !slot.relayOnline && slot.connectStatus !== "connecting"
  );

  return (
    <>
      {screen === "connect" ? (
        <Connect
          hosts={hostSlots}
          activeHostIndex={activeHostIndex}
          sessionId={activeHost.sessionId}
          pairCode={activeHost.pairCode}
          status={activeHost.connectStatus}
          error={activeHost.connectError}
          onSelectHost={selectHostSlot}
          onSessionIdChange={handleSessionIdChange}
          onPairCodeChange={handlePairCodeChange}
          onConnect={() =>
            connectWith(activeHostIndex, activeHost.sessionId, activeHost.pairCode)
          }
          onQRScanText={handleQRScanText}
          onScannerError={handleScannerError}
        />
      ) : (
        <Control
          connected={activeHost.relayOnline}
          hosts={hostSlots}
          activeHostIndex={activeHostIndex}
          activeSessionId={activeHost.sessionId}
          state={activeHost.audioState}
          pulseKey={activeHost.pulseKey}
          canAddHost={canAddHost}
          onSelectHost={selectHostSlot}
          onAddHost={handleAddHost}
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
