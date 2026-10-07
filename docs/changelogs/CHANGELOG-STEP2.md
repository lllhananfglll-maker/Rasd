# STEP 2 — Decompose oversized script modules

- Split the statement-oriented oversized modules `print-sheets`, `grades-ui`, `import-export`, `auth-audit`, and `student-roster` into ordered parts.
- Preserved classic-script execution order and the existing global compatibility contract.
- Left closure-heavy monoliths (`monitor-shell.js`, `attendance-system.js`) intact rather than performing an unsafe textual split.
- No Supabase/RLS policy changes.
