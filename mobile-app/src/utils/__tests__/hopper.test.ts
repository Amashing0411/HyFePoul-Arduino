import { describe, it, expect } from '@jest/globals';
import { formatHopperLevel, HOPPER_LOW_PERCENT, hopperLevelState, isHopperLow } from '../hopper';

const t = (key: string, params?: Record<string, string | number>) =>
  key === 'hopperLowLevel' ? `LOW · ${params?.percent}%` : key;

describe('hopper level display', () => {
  it('matches the device LOW point', () => {
    expect(HOPPER_LOW_PERCENT).toBe(30);
  });

  it('shows a plain percentage at or above LOW', () => {
    expect(isHopperLow(30)).toBe(false);
    expect(formatHopperLevel(t as never, 30)).toBe('30%');
    expect(formatHopperLevel(t as never, 64.6)).toBe('65%');
  });

  it('shows LOW below the LOW point', () => {
    expect(isHopperLow(29.9)).toBe(true);
    expect(formatHopperLevel(t as never, 25)).toBe('LOW · 25%');
    expect(formatHopperLevel(t as never, 0)).toBe('LOW · 0%');
  });
});

describe('hopper gauge state', () => {
  it('says empty at or below the 5% no-feed point', () => {
    expect(hopperLevelState(0)).toBe('empty');
    expect(hopperLevelState(5)).toBe('empty');
  });

  it('says low between empty and LOW', () => {
    expect(hopperLevelState(5.1)).toBe('low');
    expect(hopperLevelState(29.9)).toBe('low');
  });

  it('says ok from LOW up to plenty, and plenty from 80%', () => {
    expect(hopperLevelState(30)).toBe('ok');
    expect(hopperLevelState(79.9)).toBe('ok');
    expect(hopperLevelState(80)).toBe('plenty');
    expect(hopperLevelState(100)).toBe('plenty');
  });
});
