import { describe, it, expect } from '@jest/globals';
import { describeCycleStep } from '../feedCycle';
import { translations } from '../../i18n/translations';

// Same interpolation as LanguageContext's t().
const t = (key: keyof typeof translations.en, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce(
    (text, [k, v]) => text.replace(`{${k}}`, String(v)),
    translations.en[key] as string
  );

describe('describeCycleStep', () => {
  it('names the tray while the hopper works on it', () => {
    expect(describeCycleStep(t, 'DISPENSING', 3)).toBe('Filling tray 3 of 5');
    expect(describeCycleStep(t, 'TO_TRAY', 1)).toBe('Moving to tray 1 of 5');
  });

  it('describes the moves without a tray', () => {
    expect(describeCycleStep(t, 'IDLE', 0)).toBe('Idle, hopper at start');
    expect(describeCycleStep(t, 'RETURNING', 0)).toBe('Returning to start');
  });

  it('has a Tagalog text for every step', () => {
    for (const key of ['cycleIdle', 'cycleHoming', 'cycleToTray', 'cycleTaring', 'cycleDispensing', 'cycleToEnd', 'cycleReturning'] as const) {
      expect(translations.tl[key]).toBeTruthy();
    }
  });
});
