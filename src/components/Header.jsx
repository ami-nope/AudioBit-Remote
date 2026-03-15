export default function Header({ connected }) {
  return (
    <header className="top-header panel">
      <div className="brand">
        <img className="brand-mark" src="/audiobit-mark.svg" alt="" width="32" height="32" />
        <div>
          <p className="brand-title">AudioBit</p>
          <p className="brand-subtitle">Remote Controller</p>
        </div>
      </div>
      <span className={`status-pill ${connected ? "ok" : "warn"}`}>
        {connected ? "Online" : "Offline"}
      </span>
    </header>
  );
}
