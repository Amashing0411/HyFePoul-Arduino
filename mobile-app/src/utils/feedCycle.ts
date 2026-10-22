import { CycleStep } from '../types';
import { translations } from '../i18n/translations';

type CycleKey =
  | 'cycleIdle' | 'cycleHoming' | 'cycleToTray' | 'cycleTaring'
  | 'cycleDispensing' | 'cycleToEnd' | 'cycleReturning';

const CYCLE_STEP_KEYS: Record<CycleStep, CycleKey> = {
  IDLE: 'cycleIdle',
  HOMING: 'cycleHoming',
  TO_TRAY: 'cycleToTray',
  TARING: 'cycleTaring',
  DISPENSING: 'cycleDispensing',
  TO_END: 'cycleToEnd',
  RETURNING: 'cycleReturning',
};

type Translate = (key: keyof typeof translations.en, params?: Record<string, string | number>) => string;

// Plain-language description of where the moving hopper is in its cycle.
export const describeCycleStep = (t: Translate, step: CycleStep, tray: number): string =>
  t(CYCLE_STEP_KEYS[step] ?? 'cycleIdle', { tray });
