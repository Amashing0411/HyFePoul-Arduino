import { describe, it, expect } from '@jest/globals';
import { scheduleSyncState } from '../scheduleSync';
import { RTDBSchedule, RTDBScheduleStatus } from '../../types/rtdb';

const schedule: RTDBSchedule = {
  scheduleId: 'sched_0', hour: 7, minute: 0, targetGrams: 50, enabled: true, daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
};
const applied = (extra: Partial<RTDBScheduleStatus> = {}): RTDBScheduleStatus => ({
  hour: 7, minute: 0, targetGrams: 50, enabled: true, appliedAt: 1, ...extra,
});

describe('scheduleSyncState (R-43)', () => {
  it('is onDevice when the device accepted the same values', () => {
    expect(scheduleSyncState(schedule, applied())).toBe('onDevice');
  });

  it('is waiting when the device has not reported this slot', () => {
    expect(scheduleSyncState(schedule, undefined)).toBe('waiting');
  });

  it('is waiting after an edit the device has not accepted yet', () => {
    expect(scheduleSyncState(schedule, applied({ minute: 30 }))).toBe('waiting');
    expect(scheduleSyncState(schedule, applied({ targetGrams: 60 }))).toBe('waiting');
    expect(scheduleSyncState(schedule, applied({ enabled: false }))).toBe('waiting');
  });

  it('compares grams as whole numbers, as the device stores them', () => {
    expect(scheduleSyncState({ ...schedule, targetGrams: 50.4 }, applied())).toBe('onDevice');
  });
});
