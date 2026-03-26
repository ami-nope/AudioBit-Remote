import HostSwitcher from "./HostSwitcher";

export default function Header({
  connected,
  hosts,
  activeHostIndex,
  activeSessionId,
  onSelectHost,
  canAddHost,
  onAddHost,
}) {
  return (
    <header className="top-header panel">
      <div className="header-row">
        <div className="brand">
          <img className="brand-mark" src="/audiobit-mark.svg" alt="" width="32" height="32" />
          <div>
            <p className="brand-title">AudioBit</p>
            <p className="brand-subtitle">Remote Controller</p>
          </div>
        </div>

        <div className="header-meta">
          <p className="header-session">
            {activeSessionId
              ? `Host ${activeHostIndex + 1} · ${activeSessionId}`
              : `Host ${activeHostIndex + 1}`}
          </p>
          <span className={`status-pill ${connected ? "ok" : "warn"}`}>
            {connected ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      <HostSwitcher
        hosts={hosts}
        activeHostIndex={activeHostIndex}
        onSelectHost={onSelectHost}
        canAddHost={canAddHost}
        onAddHost={onAddHost}
        compact
      />
    </header>
  );
}
