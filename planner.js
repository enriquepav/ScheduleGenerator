/* Operaciones compartidas por el flujo semanal y sus pruebas. */
globalThis.Planner=(()=>{
 const clone=rows=>rows.map(a=>({...a,segments:(a.segments||[]).map(s=>({...s}))}));
 function copyWeek(rows,from,to){
  const offset=(Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000;
  const shift=t=>Scheduler.iso(Date.parse(t)+offset*86400000);
  return rows.map(a=>({employee_id:a.employee_id,shift_date:Scheduler.add(a.shift_date,offset),starts_at:shift(a.starts_at),ends_at:shift(a.ends_at),area:a.area,shift_name:a.shift_name,segments:(a.segments||[]).map(s=>({area:s.area,starts_at:shift(s.starts_at),ends_at:shift(s.ends_at)}))}));
 }
 function assignment(employee,d,start,hours,area,shifts){
  const st=Date.parse(`${d}T${start}:00-05:00`),en=st+Number(hours)*3600000;
  if(!Number.isFinite(st)||!Number.isFinite(en)||en<=st)throw Error('Indica hora y duración válidas');
  const sh=shifts.find(s=>{const [a,b]=Scheduler.slot(d,s);return a<=st&&st<b});
  if(!sh)throw Error('La hora de inicio no pertenece a un turno activo');
  return {employee_id:employee.id,shift_date:d,starts_at:Scheduler.iso(st),ends_at:Scheduler.iso(en),area,shift_name:sh.name,segments:[{area,starts_at:Scheduler.iso(st),ends_at:Scheduler.iso(en)}]};
 }
 function replace(rows,id,d,value){return [...rows.filter(a=>a.employee_id!==id||a.shift_date!==d),...(value?[value]:[])];}
 function issues(rows,ctx){return rows.map((a,i)=>({assignment:a,reason:Scheduler.hard(a,rows.filter((_,j)=>i!==j),ctx)})).filter(x=>x.reason);}
 function swap(rows,id,other,d,ctx){
  if(id===other)throw Error('Selecciona otra persona');
  const a=rows.find(a=>a.employee_id===id&&a.shift_date===d),b=rows.find(a=>a.employee_id===other&&a.shift_date===d);
  let next=replace(rows,id,d,b?{...b,employee_id:id}:null);
  next=replace(next,other,d,a?{...a,employee_id:other}:null);
  const errors=issues(next,ctx);
  if(errors.length)throw Error(errors[0].reason);
  return next;
 }
 return {clone,copyWeek,assignment,replace,issues,swap};
})();
