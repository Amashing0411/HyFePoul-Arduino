import { describe, it, expect } from '@jest/globals';
import { sortAlerts } from '../alerts';
import { Alert } from '../../types';

const alert = (id: string, minutesAgo: number, resolved: boolean): Alert => ({
  id,
  type: 'LOW_FEED',
  timestamp: new Date(Date.UTC(2026, 9, 23, 12, 0) - minutesAgo * 60000).toISOString(),
  resolved,
});

describe('sortAlerts', () => {
  it('lists active alerts before resolved ones, newest first in each group', () => {
    const sorted = sortAlerts([
      alert('old-resolved', 300, true),
      alert('old-active', 120, false),
      alert('new-resolved', 5, true),
      alert('new-active', 10, false),
    ]);
    expect(sorted.map(a => a.id)).toEqual(['new-active', 'old-active', 'new-resolved', 'old-resolved']);
  });

  it('does not mutate its input', () => {
    const input = [alert('a', 1, true), alert('b', 2, false)];
    sortAlerts(input);
    expect(input.map(a => a.id)).toEqual(['a', 'b']);
  });
});
