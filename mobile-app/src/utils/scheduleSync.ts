import { RTDBSchedule, RTDBScheduleStatus } from '../types/rtdb';

// Whether the Mega has the schedule the app shows (R-43).
//   onDevice: the device's last accepted values match the saved schedule;
//   waiting:  saved in the app, not (yet) accepted by the device with these
//             values (an edit in flight, or the device offline).
export type ScheduleSyncState = 'onDevice' | 'waiting';

export function scheduleSyncState(
  schedule: RTDBSchedule,
  applied: RTDBScheduleStatus | undefined
): ScheduleSyncState {
  if (!applied) return 'waiting';
  const same =
    applied.hour === schedule.hour &&
    applied.minute === schedule.minute &&
    applied.enabled === schedule.enabled &&
    // The ESP32 sends whole grams; the app also saves whole grams.
    applied.targetGrams === Math.round(schedule.targetGrams);
  return same ? 'onDevice' : 'waiting';
}
