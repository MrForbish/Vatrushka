import type { AudioProcessorOptions, TrackProcessor } from "livekit-client";
import type { Track } from "livekit-client";

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

export class MicrophoneGainProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  readonly name = "vatrushka-microphone-gain";
  processedTrack?: MediaStreamTrack;
  private source: MediaStreamAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private volume: number;

  constructor(volume: number) {
    this.volume = clampVolume(volume);
  }

  init(options: AudioProcessorOptions): Promise<void> {
    this.destroyGraph();
    // LiveKit's processor contract types this as required, but a local track
    // can be created before Room finishes assigning its WebAudio context.
    // Treat that short-lived state as an optional-gain fallback rather than
    // dereferencing undefined and breaking microphone activation.
    const audioContext = (options as { audioContext?: AudioContext }).audioContext;
    if (!audioContext || audioContext.state === "closed") return Promise.resolve();

    const source = audioContext.createMediaStreamSource(new MediaStream([options.track]));
    const gain = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();
    gain.gain.setValueAtTime(this.volume, audioContext.currentTime);
    source.connect(gain);
    gain.connect(destination);
    this.source = source;
    this.gain = gain;
    this.destination = destination;
    const processedTrack = destination.stream.getAudioTracks()[0];
    if (processedTrack === undefined) throw new Error("Не удалось подготовить обработку громкости микрофона");
    this.processedTrack = processedTrack;
    return Promise.resolve();
  }

  async restart(options: AudioProcessorOptions): Promise<void> {
    await this.init(options);
  }

  destroy(): Promise<void> {
    this.destroyGraph();
    return Promise.resolve();
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
    if (this.gain === null) return;
    const context = this.gain.context;
    this.gain.gain.cancelScheduledValues(context.currentTime);
    this.gain.gain.setTargetAtTime(this.volume, context.currentTime, 0.015);
  }

  private destroyGraph(): void {
    this.source?.disconnect();
    this.gain?.disconnect();
    this.destination?.disconnect();
    this.source = null;
    this.gain = null;
    this.destination = null;
    delete this.processedTrack;
  }
}
