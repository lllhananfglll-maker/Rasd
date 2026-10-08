/**
 * @vitest-environment node
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../js/domain/calendar/term-calendar.js'), 'utf8');

describe('term-calendar', () => {
  let cal;
  beforeAll(() => {
    globalThis.GSP = {};
    // eslint-disable-next-line no-eval
    eval(src);
    cal = globalThis.GSP.domain.calendar;
  });

  it('default first term has 16 weeks', () => {
    const c = cal.defaultCalendar('first');
    expect(c.totalWeeks).toBe(16);
    expect(c.startDate).toBe('2026-09-13');
    expect(c.months.length).toBeGreaterThanOrEqual(3);
  });

  it('week starts advance by 7 days', () => {
    const c = cal.defaultCalendar('first');
    const w1 = cal.weekStartISO(c, 1);
    const w2 = cal.weekStartISO(c, 2);
    expect(w1).toBe(c.startDate);
    expect(cal.addDaysISO(w1, 7)).toBe(w2);
  });

  it('normalize clamps and covers full term', () => {
    const c = cal.normalizeCalendar({
      startDate: '2026-09-13',
      totalWeeks: 10,
      months: [
        { name: 'A', startWeek: 1, endWeek: 3 },
        { name: 'B', startWeek: 5, endWeek: 20 }
      ]
    }, 'first');
    expect(c.totalWeeks).toBe(10);
    expect(c.months[0].startWeek).toBe(1);
    expect(c.months[c.months.length - 1].endWeek).toBe(10);
  });

  it('recording periods include week1 dates', () => {
    const c = cal.defaultCalendar('first');
    const periods = cal.getRecordingPeriods(c, 'first');
    expect(periods[0].id).toBe('f1');
    expect(periods[0].week1).toBe(c.startDate);
  });
});
