/** Application service boundaries. */
export function createGradeService(api){return {parse:(v,m)=>api.parseStrictGradeInput(v,m),aggregate:(v,m)=>api.aggregateAbsentAwareValues(v,m),isLocked:(db,c,s,t,m)=>api.isGradeEntryLocked(db,c,s,t,m)};}
export function createStudentService(repository){return {list:()=>repository.list(),save:s=>repository.save(s),remove:id=>repository.remove(id)};}
export function createAttendanceService(repository){return {list:()=>repository.list(),save:r=>repository.save(r)};}
