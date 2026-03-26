import { LoaderCircle, Plus } from "lucide-react";

const getHostStatus = (host) => {
  if (host.relayOnline || host.connectStatus === "connected") {
    return { label: "Online", tone: "ok" };
  }
  if (host.connectStatus === "reconnecting") {
    return { label: "Reconnecting", tone: "warn" };
  }
  if (host.connectStatus === "connecting") {
    return { label: "Connecting", tone: "warn" };
  }
  if (host.connectError) {
    return { label: "Error", tone: "danger" };
  }
  if (host.sessionId || host.pairCode) {
    return { label: "Ready", tone: "idle" };
  }
  return { label: "Empty", tone: "idle" };
};

const getHostMeta = (host) => {
  if (host.sessionId) {
    return host.sessionId;
  }
  if (host.connectStatus === "reconnecting") {
    return "Retrying relay connection";
  }
  if (host.connectStatus === "connecting") {
    return "Pairing in progress";
  }
  if (host.connectError) {
    return host.connectError;
  }
  return "Not connected";
};

export default function HostSwitcher({
  hosts,
  activeHostIndex,
  onSelectHost,
  canAddHost = false,
  onAddHost,
  compact = false,
}) {
  return (
    <div className={`host-switcher ${compact ? "is-compact" : ""}`}>
      <div className="host-switcher-list">
        {hosts.map((host, index) => {
          const status = getHostStatus(host);
          const isConnecting =
            host.connectStatus === "connecting" || host.connectStatus === "reconnecting";

          return (
            <button
              key={`host-slot-${index + 1}`}
              type="button"
              className={`host-chip ${activeHostIndex === index ? "is-active" : ""}`}
              onClick={() => onSelectHost(index)}
            >
              <span className="host-chip-top">
                <span className="host-chip-title">{`Host ${index + 1}`}</span>
                <span className={`host-chip-status host-chip-status-${status.tone}`}>
                  {isConnecting ? <LoaderCircle size={12} className="is-spinning" /> : null}
                  <span>{status.label}</span>
                </span>
              </span>
              <span className="host-chip-meta" title={getHostMeta(host)}>
                {getHostMeta(host)}
              </span>
            </button>
          );
        })}
      </div>

      {canAddHost && onAddHost ? (
        <button type="button" className="host-add-btn" onClick={onAddHost}>
          <Plus size={16} />
          <span>Add Host</span>
        </button>
      ) : null}
    </div>
  );
}
