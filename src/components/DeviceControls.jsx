import { Headphones, Mic } from "lucide-react";

export default function DeviceControls({
  outputDevices,
  inputDevices,
  outputDeviceId,
  inputDeviceId,
  onOutputChange,
  onInputChange,
}) {
  return (
    <section className="panel section-card">
      <div className="section-head">
        <h2>Device Controls</h2>
      </div>

      <div className="device-grid">
        <label className="field-label">
          <span className="row-label">
            <Headphones size={16} />
            <span>Output Device</span>
          </span>
          <select
            className="glass-select"
            value={outputDeviceId}
            onChange={(event) => onOutputChange(event.target.value)}
          >
            {outputDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          <span className="row-label">
            <Mic size={16} />
            <span>Input Device</span>
          </span>
          <select
            className="glass-select"
            value={inputDeviceId}
            onChange={(event) => onInputChange(event.target.value)}
          >
            {inputDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
