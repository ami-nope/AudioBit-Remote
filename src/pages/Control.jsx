import Header from "../components/Header";
import MasterVolume from "../components/MasterVolume";
import AppMixer from "../components/AppMixer";
import DeviceControls from "../components/DeviceControls";

export default function Control({
  connected,
  status,
  hosts,
  activeHostIndex,
  activeSessionId,
  state,
  pulseKey,
  canAddHost,
  onSelectHost,
  onAddHost,
  onMasterVolumeChange,
  onMasterMuteToggle,
  onMicToggle,
  onPlaySoundboard,
  onAppVolumeChange,
  onAppMuteToggle,
  onAppOutputDeviceChange,
  onAppInputDeviceChange,
  onOutputDeviceChange,
  onInputDeviceChange,
}) {
  return (
    <main className="screen control-screen">
      <div className="control-shell">
        <Header
          connected={connected}
          status={status}
          hosts={hosts}
          activeHostIndex={activeHostIndex}
          activeSessionId={activeSessionId}
          canAddHost={canAddHost}
          onSelectHost={onSelectHost}
          onAddHost={onAddHost}
        />
        <MasterVolume
          volume={state.masterVolume}
          masterMuted={state.masterMuted}
          micMuted={state.micMuted}
          pulseKey={pulseKey}
          onVolumeChange={onMasterVolumeChange}
          onToggleMasterMute={onMasterMuteToggle}
          onToggleMic={onMicToggle}
          onPlaySoundboard={onPlaySoundboard}
        />
        <AppMixer
          apps={state.apps}
          outputDevices={state.outputDevices}
          inputDevices={state.inputDevices}
          pulseKey={pulseKey}
          onAppVolumeChange={onAppVolumeChange}
          onAppMuteToggle={onAppMuteToggle}
          onAppOutputDeviceChange={onAppOutputDeviceChange}
          onAppInputDeviceChange={onAppInputDeviceChange}
        />
        <DeviceControls
          outputDevices={state.outputDevices}
          inputDevices={state.inputDevices}
          outputDeviceId={state.outputDeviceId}
          inputDeviceId={state.inputDeviceId}
          onOutputChange={onOutputDeviceChange}
          onInputChange={onInputDeviceChange}
        />
      </div>
    </main>
  );
}
