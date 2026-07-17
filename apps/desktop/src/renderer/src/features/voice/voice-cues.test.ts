import { describe, expect, it } from 'vitest';

import { diffRemoteParticipants } from './voice-cues';

describe('voice participant cues', () => {
  it('uses the first participant snapshot as a silent baseline', () => {
    const changes = diffRemoteParticipants(null, [
      { identity: 'local', isLocal: true },
      { identity: 'anna', isLocal: false },
    ]);
    expect([...changes.current]).toEqual(['anna']);
    expect(changes.joined).toEqual([]);
    expect(changes.left).toEqual([]);
  });

  it('reports only remote joins and leaves', () => {
    const changes = diffRemoteParticipants(new Set(['anna', 'max']), [
      { identity: 'local', isLocal: true },
      { identity: 'max', isLocal: false },
      { identity: 'olga', isLocal: false },
    ]);
    expect(changes.joined).toEqual(['olga']);
    expect(changes.left).toEqual(['anna']);
  });
});
