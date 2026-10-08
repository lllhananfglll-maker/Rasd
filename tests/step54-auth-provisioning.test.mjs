import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

describe('STEP 54 — Auth & first Superadmin provisioning contract', () => {
  it('keeps cloud login visible during first-run local setup', () => {
    const ui = read('js/auth/login-ui.js');
    expect(ui).toContain('cloud Auth must remain available');
    expect(ui).toContain("(!adminNeedsSetup || cloudAvailable)");
  });

  it('prevents Stageadmin from entering through the Superadmin login surface', () => {
    const ui = read('js/auth/login-ui.js');
    expect(ui).toContain("result.profile.role !== 'superadmin'");
    expect(ui).toContain('هذا الحساب ليس حساب رئيس الكنترول');
  });

  it('validates the restored cloud profile before trusting the session', () => {
    const auth = read('js/auth/cloud-auth.js');
    expect(auth).toContain("!['superadmin', 'stageadmin', 'monitor', 'teacher'].includes(profile.role)");
    expect(auth).toContain('استعادة الملف السحابي');
  });

  it('uses the production bootstrap schema required by the Auth profile', () => {
    const sql = read('docs/step53-bootstrap.sql');
    for (const token of ['full_name text', 'email text', 'stage_ids jsonb', 'teacher_id text', 'sections jsonb']) {
      expect(sql).toContain(token);
    }
    expect(sql).toContain("role IN ('superadmin','stageadmin','monitor','teacher')");
  });
});
