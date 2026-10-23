// The ESP32 writes devices/{id}/lastHeartbeat every 30 s while it has Wi-Fi
// and a Firebase session. Nothing sets devices/{id}/status to "offline" when
// the device loses power or Wi-Fi, so connectivity is judged from the
// heartbeat age: three missed heartbeats means offline.
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const OFFLINE_AFTER_MS = 3 * HEARTBEAT_INTERVAL_MS;

export function heartbeatAgeMs(lastHeartbeatIso: string | null, nowMs: number): number | null {
  if (!lastHeartbeatIso) return null;
  const heartbeatMs = new Date(lastHeartbeatIso).getTime();
  if (Number.isNaN(heartbeatMs)) return null;
  // A phone clock slightly behind the device's NTP time gives a small
  // negative age; treat it as just now.
  return Math.max(0, nowMs - heartbeatMs);
}

export function isDeviceOnline(
  status: 'online' | 'offline' | null,
  lastHeartbeatIso: string | null,
  nowMs: number
): boolean {
  const age = heartbeatAgeMs(lastHeartbeatIso, nowMs);
  return status === 'online' && age !== null && age <= OFFLINE_AFTER_MS;
}

// The ESP32 can be online while the Mega (the controller that feeds and
// reads the sensors) has stopped. Only an explicit false from the ESP32
// counts; a missing report (older firmware) is not treated as a fault.
export function isControllerResponding(deviceOnline: boolean, megaLinkOk: boolean | null): boolean {
  return deviceOnline && megaLinkOk !== false;
}
