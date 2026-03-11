import { Radio } from "lucide-react";

export default function Header({ connected }) {
  return (
    <header className="top-header panel">
      <div className="brand">
        <div className="brand-mark">
          <Radio size={18} strokeWidth={2.25} />
        </div>
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
