import { Megaphone, Mic, MicOff, Volume2, VolumeX } from "lucide-react";

export default function MasterVolume({
  volume,
  masterMuted,
  micMuted,
  pulseKey,
  onVolumeChange,
  onToggleMasterMute,
  onToggleMic,
  onPlaySoundboard,
}) {
  return (
    <section className="panel section-card">
      <div className="section-head">
        <h2>Master Control</h2>
      </div>

      <div className="master-grid">
        <div className="slider-row">
          <div className="row-label">
            <Volume2 size={16} />
            <span>Master Volume</span>
          </div>
          <span className="value-chip">{volume}%</span>
        </div>
        <input
          className="range-slider"
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />

        <div className="master-actions">
          <button
            className={`action-btn ${masterMuted ? "is-muted" : ""} ${
              pulseKey === "mute_master" ? "is-pulsing" : ""
            }`}
            type="button"
            onClick={onToggleMasterMute}
          >
            {masterMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            <span>{masterMuted ? "Unmute Master" : "Mute Master"}</span>
          </button>

          <button
            className={`action-btn ${micMuted ? "is-muted" : ""} ${
              pulseKey === "mute_mic" ? "is-pulsing" : ""
            }`}
            type="button"
            onClick={onToggleMic}
          >
            {micMuted ? <MicOff size={16} /> : <Mic size={16} />}
            <span>{micMuted ? "Unmute Mic" : "Mute Mic"}</span>
          </button>

          <button
            className={`action-btn ${pulseKey === "play_soundboard_clip" ? "is-pulsing" : ""}`}
            type="button"
            onClick={onPlaySoundboard}
          >
            <Megaphone size={16} />
            <span>Play Soundboard Clip</span>
          </button>
        </div>
      </div>
    </section>
  );
}
