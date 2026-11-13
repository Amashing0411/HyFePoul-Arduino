import { translations } from '../i18n/translations';

// The Mega's LOW calibration point (HOPPER_LOW_PERCENT in Config.ino): below
// this the hopper is LOW and the device raises LOW_FEED.
export const HOPPER_LOW_PERCENT = 30;

type Translate = (key: keyof typeof translations.en, params?: Record<string, string | number>) => string;

// At or below this the Mega will not start a feed (HOPPER_EMPTY_PERCENT).
export const HOPPER_EMPTY_PERCENT = 5;
// At or above this the gauge says there is plenty of feed.
export const HOPPER_PLENTY_PERCENT = 80;

export type HopperLevelState = 'plenty' | 'ok' | 'low' | 'empty';

export const isHopperLow = (percent: number): boolean => percent < HOPPER_LOW_PERCENT;

export const hopperLevelState = (percent: number): HopperLevelState => {
  if (percent <= HOPPER_EMPTY_PERCENT) return 'empty';
  if (percent < HOPPER_LOW_PERCENT) return 'low';
  if (percent >= HOPPER_PLENTY_PERCENT) return 'plenty';
  return 'ok';
};

// "65%" at or above LOW, "LOW · 25%" below it.
export const formatHopperLevel = (t: Translate, percent: number): string => {
  const shown = percent.toFixed(0);
  return isHopperLow(percent) ? t('hopperLowLevel', { percent: shown }) : `${shown}%`;
};
