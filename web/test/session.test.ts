import { describe, it, expect, beforeEach } from 'vitest';
import { loadHandOff, loadSource, saveHandOff, saveSource } from '../src/lib/session.ts';

describe('session hand-off', () => {
  beforeEach(() => sessionStorage.clear());
  it('round-trips the hand-off and returns null when absent or corrupt', () => {
    expect(loadHandOff()).toBeNull();
    const h = { signupId: 's1', name: 'Meera', join: { url: 'https://wa.me/1?text=join%20x', code: 'x', whatsappNumber: '+1' } };
    saveHandOff(h);
    expect(loadHandOff()).toEqual(h);
    sessionStorage.setItem('ts_handoff', '{nope');
    expect(loadHandOff()).toBeNull();
  });
  it('stores the attribution source', () => {
    expect(loadSource()).toBeUndefined();
    saveSource('grp-a');
    expect(loadSource()).toBe('grp-a');
  });
});
