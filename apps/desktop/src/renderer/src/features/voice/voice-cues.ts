import type { ParticipantView } from '../../media';

export type VoiceCue = 'join' | 'leave' | 'message';

export interface RemoteParticipantChanges {
  current: Set<string>;
  joined: string[];
  left: string[];
}

export function diffRemoteParticipants(previous: ReadonlySet<string> | null, participants: ReadonlyArray<Pick<ParticipantView, 'identity' | 'isLocal'>>): RemoteParticipantChanges {
  const current = new Set(participants.filter((participant) => !participant.isLocal).map((participant) => participant.identity));
  if (previous === null) return { current, joined: [], left: [] };
  return {
    current,
    joined: [...current].filter((identity) => !previous.has(identity)),
    left: [...previous].filter((identity) => !current.has(identity)),
  };
}

type SinkAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

const cueNotes: Record<VoiceCue, ReadonlyArray<{ frequency: number; offset: number }>> = {
  join: [{ frequency: 587.33, offset: 0 }, { frequency: 783.99, offset: 0.075 }],
  leave: [{ frequency: 659.25, offset: 0 }, { frequency: 493.88, offset: 0.075 }],
  message: [{ frequency: 698.46, offset: 0 }, { frequency: 880, offset: 0.055 }],
};

export class VoiceCuePlayer {
  private context: SinkAudioContext | null = null;
  private sinkId: string | null = null;

  play(cue: VoiceCue, outputDeviceId?: string): void {
    if (typeof AudioContext === 'undefined') return;
    if (this.context === null) this.context = new AudioContext({ latencyHint: 'interactive' });
    const context = this.context;
    if (context.state === 'suspended') void context.resume().catch(() => undefined);

    const sinkId = outputDeviceId === undefined || outputDeviceId === 'default' ? '' : outputDeviceId;
    if (context.setSinkId !== undefined && this.sinkId !== sinkId) {
      this.sinkId = sinkId;
      void context.setSinkId(sinkId).catch(() => { this.sinkId = null; });
    }

    const start = context.currentTime + 0.025;
    for (const note of cueNotes[cue]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = start + note.offset;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.038, noteStart + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.145);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.16);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        gain.disconnect();
      }, { once: true });
    }
  }
}
