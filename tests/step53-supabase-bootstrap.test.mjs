import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

describe('STEP 53 — Supabase bootstrap contract', () => {
  it('defines the new project and workbook bucket consistently', () => {
    const cfg = read('js/application/services/configuration-service.js');
    const adapter = read('js/application/composition/cloud-sync-composition.js');
    expect(cfg).toContain('https://gxeqnmrakbrtychnfmvg.supabase.co');
    expect(cfg).toContain("workbookStorageBucket: 'workbook-originals'");
    expect(adapter).not.toContain("'grade-system-workbooks'");
  });

  it('bootstrap SQL contains the required tables, RLS and storage bucket', () => {
    const sql = read('docs/step53-bootstrap.sql');
    for (const token of [
      'CREATE TABLE IF NOT EXISTS public.grade_system_state',
      'CREATE TABLE IF NOT EXISTS public.profiles',
      'CREATE TABLE IF NOT EXISTS public.audit_events',
      'ENABLE ROW LEVEL SECURITY',
      "VALUES ('workbook-originals', 'workbook-originals', false)",
      'can_access_stage_row',
      'can_access_storage_object'
    ]) expect(sql).toContain(token);
  });

  it('verification SQL covers the production-critical objects', () => {
    const sql = read('docs/step53-verification.sql');
    expect(sql).toContain('pg_policies');
    expect(sql).toContain("storage.buckets");
    expect(sql).toContain("audit_events");
  });
});
