// Clearly fake sample data for the pipeline and "Today" boards.
// main.js uses it when /api/board is not available (for example on a fresh local clone, or a
// deployment with no Blob store yet). Real data from POST /api/board always wins.
import { localDay } from './boards.js';

function mondayOf(day) { // day = YYYY-MM-DD
  const [y, m, d] = day.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10);
}
export function sampleBoard(now = new Date()) {
  const today = localDay(now);
  const iso = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    updated: iso,
    pipeline: {
      sample: true,
      generated: iso,
      weekStart: mondayOf(today),
      source: 'columns',
      totals: { drafted: 6, sent: 24, replies: 7, demos: 3, calls: 2 },
      week: { drafted: 2, sent: 9, replies: 3, demos: 1, calls: 1 },
      replyRate: 7 / 24,
      byOffer: [
        { label: 'Offer A', total: 14, sent: 11, replies: 4, demos: 2, calls: 1 },
        { label: 'Offer B', total: 10, sent: 8, replies: 2, demos: 1, calls: 1 },
        { label: 'Offer C', total: 6, sent: 5, replies: 1, demos: 0, calls: 0 },
      ],
      byChannel: [
        { label: 'Email', total: 20, sent: 16, replies: 5, demos: 2, calls: 1 },
        { label: 'Chat', total: 10, sent: 8, replies: 2, demos: 1, calls: 1 },
      ],
    },
    calendar: {
      sample: true,
      generated: iso,
      days: { [today]: [['09:00', '09:30'], ['11:00', '12:00'], ['14:00', '15:30']] },
    },
  };
}
