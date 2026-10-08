import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function load(rel) {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox);
  return sandbox;
}
const S = load('js/infrastructure/repositories/stage-data-repository.js');
const G = load('js/infrastructure/repositories/grades-repository.js');
let db = {students:[{id:'s1',name:'A'}],teachers:[{id:'t1'}],grades:[{id:'g1',score:9}],subjects:[{id:'sub1'}],classes:[{id:'c1'}]};
let saved = null;
const stage = S.GSP.createStageDataRepository({loadDB:()=>db, saveDB:(next)=>{saved=next;db=next;}});
if (stage.students()[0].id !== 's1') throw new Error('students boundary failed');
if (stage.getTeacher('t1').id !== 't1') throw new Error('teacher lookup failed');
if (stage.getGrade('missing') !== null) throw new Error('missing grade should be null');
const grades = G.GSP.createGradesRepository({stageData:stage});
if (grades.list()[0].score !== 9) throw new Error('grades list failed');
db.grades.push({id:'g2',score:10});
grades.save(db);
if (!saved || saved.grades.length !== 2) throw new Error('repository save failed');
if (!Object.isFrozen(stage) || !Object.isFrozen(grades)) throw new Error('repository API must be frozen');
console.log('STEP 34 repository tests: 6 passed / 0 failed');
