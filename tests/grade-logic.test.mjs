/**
 * اختبارات وحدة لمنطق الدرجات والأقفال
 * تشغَّل عبر: npx vitest run
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadIIFE(relPath) {
  const code = fs.readFileSync(path.join(root, relPath), 'utf8');
  const sandbox = { window: {}, globalThis: {}, console };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  return sandbox;
}

let GL, PIN;

beforeAll(() => {
  const g1 = loadIIFE('js/core/grade-logic.js');
  GL = g1.GSPGradeLogic || g1.window.GSPGradeLogic;
  const g2 = loadIIFE('js/core/pin-logic.js');
  PIN = g2.GSPPinLogic || g2.window.GSPPinLogic;
});

describe('aggregateAbsentAwareValues', () => {
  it('يرجع null لمصفوفة فارغة', () => {
    expect(GL.aggregateAbsentAwareValues([], 'average')).toBeNull();
    expect(GL.aggregateAbsentAwareValues([], 'sum')).toBeNull();
  });

  it('متوسط أرقام عادية', () => {
    expect(GL.aggregateAbsentAwareValues([10, 20], 'average')).toBe(15);
    expect(GL.aggregateAbsentAwareValues([8, 9, 10], 'average')).toBe(9);
  });

  it('مجموع أرقام عادية', () => {
    expect(GL.aggregateAbsentAwareValues([2, 3, 5], 'sum')).toBe(10);
  });

  it('يتجاهل الغياب من المتوسط', () => {
    expect(GL.aggregateAbsentAwareValues([10, GL.ABSENT_MARK, 20], 'average')).toBe(15);
  });

  it('يتجاهل الغياب من المجموع', () => {
    expect(GL.aggregateAbsentAwareValues([3, GL.ABSENT_MARK, 7], 'sum')).toBe(10);
  });

  it('يرجع غ إذا كانت كل القيم غياباً', () => {
    expect(GL.aggregateAbsentAwareValues([GL.ABSENT_MARK, GL.ABSENT_MARK], 'average')).toBe(GL.ABSENT_MARK);
    expect(GL.aggregateAbsentAwareValues([GL.ABSENT_MARK], 'sum')).toBe(GL.ABSENT_MARK);
  });
});

describe('تصنيف المكوّنات', () => {
  it('يكتشف مكوّن امتحان', () => {
    expect(GL.isExamComponent('امتحان الشهر')).toBe(true);
    expect(GL.isExamComponent('اختبار شهري')).toBe(true);
    expect(GL.isExamComponent('تقييم شهري')).toBe(true);
    expect(GL.isExamComponent('واجب منزلي')).toBe(false);
  });

  it('isExamLikeComponent يحترم isMonthlyGrade', () => {
    expect(GL.isExamLikeComponent({ name: 'اختبار', isMonthlyGrade: true })).toBe(true);
    expect(GL.isExamLikeComponent({ name: 'مشاركة', isMonthlyGrade: false })).toBe(false);
  });

  it('يكتشف مكوّنات حضور/غياب', () => {
    expect(GL.isAttendanceComponent('نسبة الحضور')).toBe(true);
    expect(GL.isAttendanceComponent('عدد أيام الغياب')).toBe(true);
    expect(GL.isAttendanceComponent('واجب')).toBe(false);
  });

  it('يكتشف أيام الغياب (بدون نسبة)', () => {
    expect(GL.isAbsenceDaysComponent('عدد أيام الغياب')).toBe(true);
    expect(GL.isAbsenceDaysComponent('نسبة الغياب')).toBe(false);
  });
});

describe('أقفال الدرجات', () => {
  it('lockKey و monthLockKey', () => {
    expect(GL.lockKey('1/أ', 'عربي', 'first', 1)).toBe('1/أ||عربي||first||1');
    expect(GL.monthLockKey('second', 2)).toBe('second||2');
  });

  it('قفل عام يمنع كل شيء', () => {
    const db = { globalLock: true };
    expect(GL.isGradeEntryLocked(db, '1/أ', 'عربي', 'first', 1)).toBe(true);
  });

  it('قفل فصل دراسي', () => {
    const db = { termLocks: { first: true } };
    expect(GL.isGradeEntryLocked(db, '1/أ', 'عربي', 'first', 1)).toBe(true);
    expect(GL.isGradeEntryLocked(db, '1/أ', 'عربي', 'second', 1)).toBe(false);
  });

  it('قفل شهر', () => {
    const db = { monthLocks: { 'first||2': true } };
    expect(GL.isGradeEntryLocked(db, '1/أ', 'عربي', 'first', 2)).toBe(true);
    expect(GL.isGradeEntryLocked(db, '1/أ', 'عربي', 'first', 1)).toBe(false);
  });

  it('قفل فردي (فصل+مادة+شهر)', () => {
    const key = GL.lockKey('1/ب', 'رياضيات', 'first', 1);
    const db = { locks: { [key]: true } };
    expect(GL.isGradeEntryLocked(db, '1/ب', 'رياضيات', 'first', 1)).toBe(true);
    expect(GL.isGradeEntryLocked(db, '1/أ', 'رياضيات', 'first', 1)).toBe(false);
  });

  it('بدون أقفال = مفتوح', () => {
    expect(GL.isGradeEntryLocked({}, '1/أ', 'عربي', 'first', 1)).toBe(false);
    expect(GL.isGradeEntryLocked(null, '1/أ', 'عربي', 'first', 1)).toBe(false);
  });
});

describe('parseStrictGradeInput', () => {
  it('فارغ = null صالح', () => {
    expect(GL.parseStrictGradeInput('')).toEqual({ ok: true, score: null, reason: '' });
  });

  it('يقبل غ', () => {
    expect(GL.parseStrictGradeInput('غ').score).toBe(GL.ABSENT_MARK);
    expect(GL.parseStrictGradeInput('  غ  ').ok).toBe(true);
  });

  it('يقبل أرقاماً صحيحة', () => {
    expect(GL.parseStrictGradeInput('9.5').score).toBe(9.5);
    expect(GL.parseStrictGradeInput('10').score).toBe(10);
  });

  it('يرفض تجاوز الحد الأقصى', () => {
    const r = GL.parseStrictGradeInput('15', 10);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/تتجاوز/);
  });

  it('يرفض حروف لاتينية', () => {
    expect(GL.parseStrictGradeInput('abc').ok).toBe(false);
  });

  it('يرفض نقطتين عشريتين', () => {
    expect(GL.parseStrictGradeInput('9..5').ok).toBe(false);
  });

  it('يحوّل أرقاماً هندية', () => {
    expect(GL.parseStrictGradeInput('٩').score).toBe(9);
  });
});

describe('validatePinStrength', () => {
  it('يرفض فارغ وقصير', () => {
    expect(PIN.validatePinStrength('').valid).toBe(false);
    expect(PIN.validatePinStrength('1234567').valid).toBe(false);
  });

  it('يرفض أنماط ضعيفة', () => {
    expect(PIN.validatePinStrength('11111111').valid).toBe(false);
    expect(PIN.validatePinStrength('abcdefgh').valid).toBe(false);
    expect(PIN.validatePinStrength('12345678').valid).toBe(false);
  });

  it('يقبل PIN قوي بطول كافٍ', () => {
    expect(PIN.validatePinStrength('K7mP2xQ9').valid).toBe(true);
  });

  it('generateRandomPin يحترم الحد الأدنى', () => {
    const p = PIN.generateRandomPin(4);
    expect(p.length).toBeGreaterThanOrEqual(PIN.MIN_PIN_LENGTH);
  });
});
