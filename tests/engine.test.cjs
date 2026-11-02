const assert=require('node:assert/strict');
require('../engine.js');
const S=globalThis.Scheduler,week='2026-11-02';
const employees=[{id:'manager',role:'gerente',full_name:'Gerente',weekly_hours:48,work_days:6},...['a','b'].map(id=>({id,full_name:id,role:'full_time',area:'produccion',weekly_hours:48,work_days:6}))];
const shifts=[{id:'n',name:'Amanecida',starts_at:'00:00',ends_at:'08:00'},{id:'o',name:'Apertura',starts_at:'08:00',ends_at:'16:00'},{id:'c',name:'Cierre',starts_at:'16:00',ends_at:'00:00'}];
const ctx={employees,shifts,studies:[],restrictions:[],meetings:[],requirements:[],rules:{},replacements:[]};
function row(id,d,sh){const [a,b]=S.slot(d,sh);return {employee_id:id,shift_date:d,shift_name:sh.name,starts_at:S.iso(a),ends_at:S.iso(b),area:id==='manager'?'gerencial':'produccion',segments:[]};}
assert.equal(S.hard(row('manager',week,shifts[1]),[],ctx),null);
assert.match(S.hard(row('manager',week,shifts[2]),[],ctx),/lunes/);
assert(S.diagnostics([],ctx,week).hardIssues.some(x=>x.includes('lunes')));
const uneven=[row('a',week,shifts[0]),row('a',S.add(week,1),shifts[0])];
const even=[uneven[0],row('b',S.add(week,1),shifts[0])];
assert(S.score(even,ctx,week)>S.score(uneven,ctx,week));
const result=S.generate(ctx,week)[0];
assert.equal(result.diagnostics.hardIssues.length,0);
assert(result.assignments.some(a=>a.employee_id==='manager'&&a.shift_date===week&&a.shift_name==='Apertura'));
for(const e of employees)assert.equal(result.assignments.filter(a=>a.employee_id===e.id).reduce((n,a)=>n+S.h(a),0),48);
console.log('OK: apertura lunes, edición sin segmentos, equilibrio y generación de 48 horas');
