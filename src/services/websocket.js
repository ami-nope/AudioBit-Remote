import { getCachedExternalLinks } from "./externalLinks";

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export class AudioBitWebSocket {
  constructor(url = getCachedExternalLinks().relay.wsUrl) {
    this.url = url;
    this.ws = null;
    this.handlers = {};
    this.cid = 1;
    this.ready = false;
  }

  connect({ sid, pairCode, handlers = {} }) {
    this.close();
    this.handlers = handlers;
    this.ready = false;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.send({
        t: "hello_remote",
        sid,
        pair_code: pairCode,
      });
      this.handlers.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      const payload = safeParse(event.data);
      if (!payload || typeof payload !== "object") {
        return;
      }

      const type = payload.t;
      this.handlers.onRaw?.(payload);

      if (type === "state") {
        this.markReady();
        this.handlers.onState?.(payload);
        return;
      }

      if (type === "lvl") {
        this.handlers.onLevel?.(payload);
        return;
      }

      if (type === "cmd_result") {
        this.handlers.onCmdResult?.(payload);
        return;
      }

      if (type === "hello_ok" || type === "paired" || type === "hello_remote_ok") {
        this.markReady();
        return;
      }

      if (type === "err" || type === "error" || type === "hello_error" || type === "pair_error") {
        const msg =
          payload.msg ||
          payload.error ||
          payload.message ||
          payload.reason ||
          "Unable to connect to AudioBit relay.";
        this.handlers.onError?.(msg, payload);
      }
    };

    this.ws.onerror = () => {
      this.handlers.onError?.("WebSocket error while connecting.");
    };

    this.ws.onclose = (event) => {
      this.ready = false;
      this.handlers.onClose?.(event);
    };
  }

  markReady() {
    if (this.ready) {
      return;
    }
    this.ready = true;
    this.handlers.onReady?.();
  }

  isOpen() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  send(payload) {
    if (!this.isOpen()) {
      return false;
    }
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  sendCommand(data) {
    const cid = String(this.cid++);
    this.send({
      t: "cmd",
      cid,
      d: data,
    });
    return cid;
  }

  close() {
    if (!this.ws) {
      return;
    }
    this.ws.onopen = null;
    this.ws.onmessage = null;
    this.ws.onerror = null;
    this.ws.onclose = null;
    if (
      this.ws.readyState === WebSocket.OPEN ||
      this.ws.readyState === WebSocket.CONNECTING
    ) {
      this.ws.close();
    }
    this.ws = null;
    this.ready = false;
  }
}
