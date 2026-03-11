import AppCard from "./AppCard";

export default function AppMixer({
  apps,
  outputDevices,
  inputDevices,
  pulseKey,
  onAppVolumeChange,
  onAppMuteToggle,
  onAppOutputDeviceChange,
  onAppInputDeviceChange,
}) {
  return (
    <section className="panel section-card">
      <div className="section-head">
        <h2>App Mixer</h2>
      </div>

      {apps.length === 0 ? (
        <p className="empty-state">No active applications in the mixer yet.</p>
      ) : (
        <div className="app-list">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              outputDevices={outputDevices}
              inputDevices={inputDevices}
              pulseKey={pulseKey}
              onVolumeChange={onAppVolumeChange}
              onMuteToggle={onAppMuteToggle}
              onOutputDeviceChange={onAppOutputDeviceChange}
              onInputDeviceChange={onAppInputDeviceChange}
            />
          ))}
        </div>
      )}
    </section>
  );
}
