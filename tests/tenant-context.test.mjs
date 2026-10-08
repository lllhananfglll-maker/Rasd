/**
 * @vitest-environment node
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../js/domain/school/tenant-context.js'), 'utf8');

describe('tenant-context', () => {
  let school;
  beforeAll(() => {
    const root = globalThis;
    root.GSP = {};
    // eslint-disable-next-line no-eval
    eval(src);
    school = root.GSP.domain.school;
  });

  it('creates default tenant', () => {
    const t = school.createTenantContext({});
    expect(t.schoolId).toBe('default');
    expect(t.multiTenant).toBe(false);
    expect(t.storagePrefix).toBe('gradeSystemPro');
  });

  it('scopes storage when multiTenant', () => {
    const t = school.createTenantContext({ schoolId: 'school-a', multiTenant: true });
    expect(t.schoolId).toBe('school-a');
    expect(school.scopedStorageKey('db', t)).toBe('gradeSystemPro:school-a:db');
  });

  it('sanitizes schoolId', () => {
    const t = school.createTenantContext({ schoolId: '../evil id!!', multiTenant: true });
    expect(t.schoolId).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('attaches school_id', () => {
    const row = { id: 1 };
    school.attachSchoolId(row, 's1');
    expect(row.school_id).toBe('s1');
  });

  it('filters by school', () => {
    const rows = [{ id: 1, school_id: 'a' }, { id: 2, school_id: 'b' }, { id: 3 }];
    expect(school.filterBySchool(rows, 'a')).toHaveLength(2); // a + null-ish
  });
});
