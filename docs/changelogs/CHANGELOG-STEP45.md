# STEP 45 — Performance Optimization

## Objective
Speed up large-class grade lookup, table rendering, search typing, bulk/save loops, and cloning — without changing Supabase schema, RLS, or backend permissions.

## Implemented
- Added `js/application/services/performance-service.js`.
- O(1) grades index: `gradeKey`, `buildGradesIndex`, `lookupGrade`, `rememberGrade`, `invalidateGradesIndex`.
- Student class index: `buildStudentClassIndex`, `studentsInClass`.
- `cheapClone` prefers `structuredClone`.
- `debounce` / `throttle` with injectable timers.
- LRU `createMemo`.
- Cooperative `mapInChunks` / `forEachInChunks` / `yieldToMain`.
- Lightweight `mark` / `measure` / `time` diagnostics.
- `buildGradesIndex` in grades-support now delegates to the performance service.
- `loadGradesUI` uses the grades index and a DocumentFragment instead of N×M linear `find` + per-row DOM append.
- Grade search input is debounced (80ms) via `onGradeSearchInput`.
- Grades save + bulk fill look up/update via the index and keep it current on inserts.
- Performance panel monthly averages use `lookupGrade`.
- Wired into Application Context as `performance`.
- Version bump to `25.5.28-step45`.

## Safety boundaries
- No Supabase schema changes.
- No RLS changes.
- No backend permission changes.
- Legacy `db.grades.find` paths remain as fallbacks when the service is absent.
- Immediate `loadGradesUI` is unchanged for save/filter actions; only search typing is debounced.

## Verification
- STEP 45 performance tests: expected PASS.
- Existing regression suite: expected PASS.
- JavaScript syntax: expected PASS.
- ZIP integrity: expected PASS.
