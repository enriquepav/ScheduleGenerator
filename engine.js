/* TurnoPro V5: planificador heurístico de mejor esfuerzo, intervalos de 30 minutos.
   NO certifica óptimo global ni conformidad legal. Nunca sacrifica indisponibilidades. */
globalThis.Scheduler=(()=>{
 const STEP=30, H=1800000, TZ='-05:00';
 const add=(s,n)=>{let d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const day=s=>{let x=new Date(s+'T12:00:00Z').getUTCDay();return x||7};
 const min=t=>{let [h,m]=String(t).slice(0,5).split(':').map(Number);return h*60+m};
 const stamp=(d,m)=>Date.parse(d+'T00:00:00'+TZ)+m*60000;
 const iso=t=>{let d=new Date(t-5*3600000);return d.toISOString().slice(0,19)+'-05:00'};
 const dateOf=t=>new Date(t-5*3600000).toISOString().slice(0,10);
 const tm=t=>new Date(t-5*3600000).toISOString().slice(11,16);
 const slot=(d,s)=>{let a=stamp(d,min(s.starts_at)),b=stamp(d,min(s.ends_at));if(b<=a)b+=86400000;return [a,b]};
 const intersects=(a,b,c,d)=>a<d&&c<b;
 const h=a=>(Date.parse(a.ends_at)-Date.parse(a.starts_at))/3600000;
 const managerial=e=>['gerente','asistente'].includes(e.role);
 const areas=e=>managerial(e)?['gerencial']:[...(e.can_production?['produccion']:[]),...(e.can_service?['servicio']:[])].length?[...(e.can_production?['produccion']:[]),...(e.can_service?['servicio']:[])]:[e.area];
 const active=(e,d,restrictions)=>e.active!==false&&!restrictions.some(r=>r.employee_id===e.id&&r.kind==='vacation'&&r.date_from<=d&&(!r.date_to||r.date_to>=d));
 function blocked(e,start,end,ctx){
  let {studies=[],restrictions=[],meetings=[],rules={}}=ctx;
  const travel=Number(rules.study_travel_minutes??120)*60000;
  for(let k=-1;k<=8;k++){let d=add(dateOf(start),k),wd=day(d);
   for(let b of studies){if(b.employee_id!==e.id||Number(b.weekday)!==wd||(b.valid_from&&d<b.valid_from)||(b.valid_until&&d>b.valid_until))continue;
    let a=stamp(d,min(b.starts_at))-travel,z=stamp(d,min(b.ends_at));if(intersects(start,end,a,z))return 'Estudios / traslado';}
   for(let r of restrictions){if(r.employee_id!==e.id||r.kind==='vacation')continue;
    if(r.weekday&&Number(r.weekday)!==wd)continue;
    if(r.date_from&&(d<r.date_from||(!r.weekday&&d>(r.date_to||r.date_from)))||(r.date_to&&d>r.date_to))continue;
    if(!r.weekday&&!r.date_from)continue;
    let a=stamp(d,r.starts_at?min(r.starts_at):0),z=stamp(d,r.ends_at?min(r.ends_at):1440);
    if(r.kind==='study')a-=travel;
    if(z<=a&&r.ends_at)z+=86400000;
    if(intersects(start,end,a,z))return r.kind==='study'?'Estudios / traslado':'Restricción personal';
   }
   if(e.role==='gerente')for(let m of meetings){if(m.meeting_date!==d)continue;let a=stamp(d,min(m.meeting_start)),z=stamp(d,min(m.meeting_end));for(let shift of (ctx.shifts||[])){let [sa,sb]=slot(d,shift);if(intersects(a,z,sa,sb)&&intersects(start,end,sa,sb))return 'Turno reservado por reunión gerencial';}}
  }
  return null;
 }
 function hard(a,others,ctx){
  const e=ctx.employees.find(x=>x.id===a.employee_id);if(!e)return 'Trabajador inexistente';
  const st=Date.parse(a.starts_at),en=Date.parse(a.ends_at),dur=(en-st)/3600000;
  if(!Number.isFinite(st)||!(en>st))return 'Fechas inválidas';
  if(e.role==='gerente'&&day(a.shift_date)===1&&(tm(st)!=='08:00'||dur!==8))return 'El gerente apertura los lunes de 08:00 a 16:00';
  if(!active(e,a.shift_date,ctx.restrictions))return 'Vacaciones / inactivo';
  if(dur>(e.role==='part_time'?8:12)+.001)return 'Máximo diario';
  if(e.role==='part_time'&&dur<3.5-.001)return 'Mínimo Part Time 3.5 h';
  if(e.role==='part_time'&&a.shift_name==='Amanecida'&&Math.abs(dur-8)>.001)return 'Amanecida PT de 8 h';
  if(blocked(e,st,en,ctx))return blocked(e,st,en,ctx);
  const same=others.filter(x=>x.employee_id===e.id),rest=Number(ctx.rules.min_rest_minutes??720)*60000;
  for(let x of [...same,...(ctx.boundaryAssignments||[]).filter(x=>x.employee_id===e.id&&!same.some(a=>a.starts_at===x.starts_at))]){let xs=Date.parse(x.starts_at),xe=Date.parse(x.ends_at);
   if(intersects(st,en,xs,xe))return 'Solapamiento';
   if(st>=xe&&st-xe<rest||xs>=en&&xs-en<rest)return 'Descanso inferior a 12 h';
  }
  const total=same.reduce((z,x)=>z+h(x),0)+dur;
  if(total>Number(e.weekly_hours)+.01)return 'Exceso de horas semanales';
  if(new Set([...same,a].map(x=>x.shift_date)).size>Number(e.work_days||6))return 'Exceso de días';
  if(a.segments?.length){let prev=st,changes=0,last='';for(let s of a.segments){let ss=Date.parse(s.starts_at),ee=Date.parse(s.ends_at);
   if(ss!==prev||ee>en||ee<=ss||!areas(e).includes(s.area))return 'Segmentos inválidos';
   if(last&&last!==s.area)changes++;last=s.area;prev=ee;}
   if(prev!==en||changes>1)return 'Más de un cambio de área / tramo sin cubrir';
  }else if(!areas(e).includes(a.area))return 'Área no habilitada';
  return null;
 }
 function demand(ctx,week){let cells=[];for(let i=0;i<7;i++){let d=add(week,i),wd=day(d);for(let s of ctx.shifts){let [a,b]=slot(d,s);for(let t=a;t<b;t+=H){for(let area of ['gerencial','produccion','servicio']){
  let req=area==='gerencial'?1:Number(ctx.requirements.find(r=>Number(r.weekday)===wd&&r.shift_id===s.id&&r.area===area)?.minimum_staff||0);
  if(req>0)cells.push({d,shift:s.name,area,t,need:req});
 }}}}return cells}
 function coverage(assignments,ctx,week){let cells=demand(ctx,week),reps=ctx.replacements||[];for(let c of cells){c.have=0;for(let a of assignments){let ss=a.segments?.length?a.segments:[{area:a.area,starts_at:a.starts_at,ends_at:a.ends_at}];if(ss.some(s=>s.area===c.area&&Date.parse(s.starts_at)<=c.t&&Date.parse(s.ends_at)>=c.t+H))c.have++;}
  if(c.area==='gerencial')for(let r of reps){if(r.replacement_date!==c.d)continue;let x=stamp(c.d,min(r.starts_at)),y=stamp(c.d,min(r.ends_at));if(y<=x)y+=86400000;if(x<=c.t&&y>=c.t+H)c.have++;}
  c.missing=Math.max(0,c.need-c.have);
 }return cells}
 function diagnostics(assignments,ctx,week){let hardIssues=[];for(let i=0;i<assignments.length;i++){let why=hard(assignments[i],assignments.filter((_,j)=>i!==j),ctx);if(why)hardIssues.push(`${assignments[i].shift_date} ${ctx.employees.find(e=>e.id===assignments[i].employee_id)?.full_name}: ${why}`)}
  for(const e of ctx.employees.filter(e=>e.role==='gerente'&&active(e,week,ctx.restrictions)))if(!assignments.some(a=>a.employee_id===e.id&&a.shift_date===week&&tm(Date.parse(a.starts_at))==='08:00'&&h(a)===8))hardIssues.push(`${e.full_name}: falta apertura del lunes de 08:00 a 16:00`);
  let cells=coverage(assignments,ctx,week),missing=cells.reduce((n,c)=>n+c.missing*.5,0),gaps=[];
  for(let c of cells.filter(x=>x.missing).sort((a,b)=>a.d.localeCompare(b.d)||a.shift.localeCompare(b.shift)||a.area.localeCompare(b.area)||a.t-b.t)){let last=gaps[gaps.length-1];if(last&&last.d===c.d&&last.area===c.area&&last.shift===c.shift&&last.missing===c.missing&&last.end===c.t)last.end+=H;else gaps.push({d:c.d,area:c.area,shift:c.shift,missing:c.missing,start:c.t,end:c.t+H});}
  let hours=[];for(let e of ctx.employees){let vacation=Array.from({length:7},(_,i)=>add(week,i)).filter(d=>active(e,d,ctx.restrictions));if(!vacation.length||e.active===false)continue;
   let worked=assignments.filter(a=>a.employee_id===e.id).reduce((n,a)=>n+h(a),0);
   let target=Number(e.weekly_hours)*vacation.length/7; // Ausencia parcial: objetivo proporcional orientativo, no cómputo de nómina.
   if(target-worked>.01)hours.push({name:e.full_name,missing:Math.round((target-worked)*2)/2,worked,target:Math.round(target*10)/10});
  }
  return {hardIssues,gaps,missingPersonHours:missing,hours,missingContractHours:hours.reduce((n,x)=>n+x.missing,0),status:hardIssues.length?'inviable':missing||hours.length?'condicionado':'valido'};
 }
 const rotating=e=>['full_time','entrenador'].includes(e.role);
 const shiftNames=['Amanecida','Apertura','Cierre'];
 function rotationPenalty(own,history=[]){
  const counts=shiftNames.map(sh=>own.filter(a=>a.shift_name===sh).length);
  const avg=own.length/3;
  let cost=counts.reduce((n,v)=>n+(v-avg)**2,0)*5;
  const ordered=[...history.filter(a=>a.shift_date<own[0]?.shift_date).slice(-1),...own].sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
  for(let i=1;i<ordered.length;i++){
   const a=ordered[i-1],b=ordered[i];
   if(b.shift_date!==add(a.shift_date,1))continue;
   if(a.shift_name==='Amanecida'&&b.shift_name==='Amanecida')cost+=80;
   else if(a.shift_name===b.shift_name)cost+=5;
  }
  return cost;
 }
 function balance(assignments,ctx,week){
  return ctx.employees.filter(e=>rotating(e)&&e.active!==false).map(e=>{
   const own=assignments.filter(a=>a.employee_id===e.id).sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
   const history=(ctx.historyAssignments||[]).filter(a=>a.employee_id===e.id&&a.shift_date<week).sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
   const all=[...history.slice(-1),...own];
   const consecutive=own.filter(a=>a.shift_name==='Amanecida'&&all.some(b=>b.shift_name==='Amanecida'&&b.shift_date===add(a.shift_date,-1))).length;
   return {employee_id:e.id,name:e.full_name,area:e.primary_area||e.area,counts:shiftNames.map(sh=>own.filter(a=>a.shift_name===sh).length),historyCounts:shiftNames.map(sh=>history.filter(a=>a.shift_name===sh).length),consecutive};
  });
 }
 function score(assignments,ctx,week,raw=false){
  let penalty=0;
  for(const e of ctx.employees.filter(rotating)){
   const own=assignments.filter(a=>a.employee_id===e.id).sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
   const history=(ctx.historyAssignments||[]).filter(a=>a.employee_id===e.id&&a.shift_date<week).sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
   penalty+=rotationPenalty(own,history);
  }
  // FT y entrenadores comparten el reparto. PT y gerenciales no distorsionan ese objetivo.
  for(const area of ['produccion','servicio']){
   const rows=balance(assignments,ctx,week).filter(e=>e.area===area&&e.counts.some(Boolean));
   for(let k=0;k<3;k++){
    const values=rows.map(e=>e.counts[k]);
    const cumulative=rows.map(e=>{const total=[...e.counts,...e.historyCounts].reduce((n,v)=>n+v,0);return total?(e.counts[k]+e.historyCounts[k])/total:0});
    for(const [vs,weight] of [[values,8],[cumulative,100]])if(vs.length>1){const avg=vs.reduce((n,v)=>n+v,0)/vs.length;penalty+=vs.reduce((n,v)=>n+(v-avg)**2,0)*weight;}
   }
  }
  const manager=ctx.employees.find(e=>e.role==='gerente');
  if(manager&&ctx.preference&&ctx.preference!=='ninguna')penalty+=assignments.filter(a=>a.employee_id===manager.id&&a.shift_name!==ctx.preference).length*2;
  if(raw&&ctx.strategy==='stable')penalty+=changes(assignments,ctx.baselineAssignments||[],week).length*20;
  return raw?-penalty:Math.round(100/(1+penalty/100)*10)/10;
 }
 function changes(assignments,baseline,week){
  if(!baseline.length)return [];
  const ids=new Set([...assignments,...baseline].map(a=>a.employee_id)),out=[];
  const signature=a=>a?`${Date.parse(a.starts_at)}|${Date.parse(a.ends_at)}|${a.area}|${JSON.stringify((a.segments?.length?a.segments:[a]).map(s=>[s.area,Date.parse(s.starts_at),Date.parse(s.ends_at)]))}`:'DESC';
  for(const id of ids)for(let di=0;di<7;di++){const d=add(week,di),before=baseline.find(a=>a.employee_id===id&&a.shift_date===d),after=assignments.find(a=>a.employee_id===id&&a.shift_date===d);if(signature(before)!==signature(after))out.push({employee_id:id,shift_date:d,before,after});}
  return out;
 }
 function improve(assignments,ctx,week,locked=(id,d)=>(ctx.lockedCells||[]).some(c=>c.employee_id===id&&c.shift_date===d)){
  let aa=[...assignments];
  const missing=rows=>coverage(rows,ctx,week).reduce((n,c)=>n+c.missing,0);
  let currentMissing=missing(aa),currentScore=score(aa,ctx,week,true);
  for(let pass=0;pass<40;pass++){
   let best=null,bestScore=currentScore,bestMissing=currentMissing;
   const consider=(candidate,indices,preserveCoverage=false)=>{
    for(const i of indices)if(hard(candidate[i],candidate.filter((_,j)=>i!==j),ctx))return;
    const value=score(candidate,ctx,week,true);
    if(preserveCoverage&&value<=bestScore+.000001)return;
    const gap=preserveCoverage?currentMissing:missing(candidate);
    if(gap>currentMissing)return;
    if(gap<bestMissing||(gap===bestMissing&&value>bestScore+.000001)){best=candidate;bestScore=value;bestMissing=gap;}
   };
   for(let i=0;i<aa.length;i++){
    const a=aa[i],emp=ctx.employees.find(e=>e.id===a.employee_id);
    if(locked(a.employee_id,a.shift_date)||!rotating(emp)||a.segments?.length>1)continue;
    // Mover una jornada permite salir de mesetas donde ningún intercambio es válido.
    if(Math.abs(h(a)-8)<.001)for(const sh of ctx.shifts){
     const [st,en]=slot(a.shift_date,sh);if(en-st!==8*3600000||sh.name===a.shift_name)continue;
     const b={...a,starts_at:iso(st),ends_at:iso(en),shift_name:sh.name,segments:[{area:a.area,starts_at:iso(st),ends_at:iso(en)}]};
     consider(aa.map((x,k)=>k===i?b:x),[i]);
    }
    for(let j=i+1;j<aa.length;j++){
     const b=aa[j],other=ctx.employees.find(e=>e.id===b.employee_id);
     if(!rotating(other)||locked(b.employee_id,b.shift_date)||a.shift_date!==b.shift_date||a.employee_id===b.employee_id||a.shift_name===b.shift_name||a.area!==b.area||Math.abs(h(a)-h(b))>.001||b.segments?.length>1)continue;
     consider(aa.map((v,k)=>k===i?{...b,employee_id:a.employee_id}:k===j?{...a,employee_id:b.employee_id}:v),[i,j],true);
    }
   }
   if(!best)break;
   aa=best;currentScore=bestScore;currentMissing=bestMissing;
  }
  // Replanificar semanas completas supera bloqueos por descanso que un cambio de celda no resuelve.
  for(let round=0;round<3;round++){
   let changed=false;
   for(const emp of ctx.employees.filter(rotating)){
    const own=aa.filter(a=>a.employee_id===emp.id);
    if(own.length!==6||own.some(a=>Math.abs(h(a)-8)>.001||a.segments?.length>1))continue;
    const fixed=own.filter(a=>locked(emp.id,a.shift_date)),others=aa.filter(a=>a.employee_id!==emp.id);
    const cells=coverage([...others,...fixed],ctx,week);
    const hist=(ctx.historyAssignments||[]).filter(a=>a.employee_id===emp.id).sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
    let chosen=null,chosenScore=score(aa,ctx,week,true),chosenGap=currentMissing;
    for(let off=0;off<7;off++){
     if(fixed.some(a=>a.shift_date===add(week,off)))continue;
     const days=Array.from({length:7},(_,i)=>i).filter(di=>di!==off&&!locked(emp.id,add(week,di)));
     if(days.length+fixed.length!==6)continue;
     let states=[{plan:[],value:0}];
     for(const di of days){
      const d=add(week,di),next=[];
      for(const state of states)for(const sh of ctx.shifts)for(const area of areas(emp)){
       const [st,en]=slot(d,sh);if(en-st!==8*3600000)continue;
       const a={employee_id:emp.id,shift_date:d,shift_name:sh.name,area,starts_at:iso(st),ends_at:iso(en),segments:[{area,starts_at:iso(st),ends_at:iso(en)}]};
       if(hard(a,[...others,...fixed,...state.plan],ctx))continue;
       const plan=[...state.plan,a],all=[...fixed,...plan].sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
       const gain=plan.reduce((n,a)=>n+cells.filter(c=>c.missing&&c.area===a.area&&c.t>=Date.parse(a.starts_at)&&c.t<Date.parse(a.ends_at)).length,0);
       const stability=ctx.strategy==='stable'?changes(all,(ctx.baselineAssignments||[]).filter(a=>a.employee_id===emp.id),week).length*20:0;
       next.push({plan,value:gain*10000-rotationPenalty(all,hist)-stability});
      }
      next.sort((a,b)=>b.value-a.value);states=next.slice(0,48);if(!states.length)break;
     }
     for(const state of states.slice(0,8)){
      if(state.plan.length+fixed.length!==6)continue;
      const candidate=[...others,...fixed,...state.plan],gap=missing(candidate),value=score(candidate,ctx,week,true);
      if(gap<chosenGap||(gap===chosenGap&&value>chosenScore+.000001)){chosen=candidate;chosenGap=gap;chosenScore=value;}
     }
    }
    if(chosen){aa=chosen;currentMissing=chosenGap;changed=true;}
   }
   if(!changed)break;
  }
  // Intercambiar bloques de varios días permite rotar sin romper las 12 h de descanso.
  const peers=ctx.employees.filter(e=>rotating(e)&&e.active!==false);
  for(let pass=0;pass<4;pass++){
   let changed=false;
   for(let i=0;i<peers.length;i++)for(let j=i+1;j<peers.length;j++){
    const e=peers[i],f=peers[j];if((e.primary_area||e.area)!==(f.primary_area||f.area))continue;
    const pair=aa.filter(a=>a.employee_id===e.id||a.employee_id===f.id),others=aa.filter(a=>a.employee_id!==e.id&&a.employee_id!==f.id);
    const total=id=>pair.filter(a=>a.employee_id===id).reduce((n,a)=>n+h(a),0);
    const baseline=score(aa,ctx,week,true),candidates=[];
    for(let mask=1;mask<128;mask++){
     const dates=Array.from({length:7},(_,di)=>di).filter(di=>mask&(1<<di)).map(di=>add(week,di));
     if(dates.some(d=>locked(e.id,d)||locked(f.id,d)))continue;
     const moved=pair.map(a=>dates.includes(a.shift_date)?{...a,employee_id:a.employee_id===e.id?f.id:e.id}:a);
     if(Math.abs(moved.filter(a=>a.employee_id===e.id).reduce((n,a)=>n+h(a),0)-total(e.id))>.001)continue;
     const candidate=[...others,...moved],value=score(candidate,ctx,week,true);
     if(value>baseline+.000001)candidates.push({candidate,moved,value});
    }
    candidates.sort((a,b)=>b.value-a.value);
    const best=candidates.find(c=>c.moved.every(a=>!hard(a,c.candidate.filter(x=>x!==a),ctx)));
    if(best){aa=best.candidate;changed=true;}
   }
   if(!changed)break;
  }
  return aa;
 }
 function coordinatedRotation(assignments,ctx,week,locked){
  // Buscar patrones semanales juntos evita que el último trabajador herede todas las noches.
  const workers=ctx.employees.filter(e=>rotating(e)&&Number(e.weekly_hours)===48&&Number(e.work_days||6)===6&&assignments.filter(a=>a.employee_id===e.id).length===6&&assignments.filter(a=>a.employee_id===e.id).every(a=>h(a)===8&&!(a.segments?.length>1)));
  if(!workers.length)return assignments;
  const ids=new Set(workers.map(e=>e.id)),others=assignments.filter(a=>!ids.has(a.employee_id));
  const cells=coverage(others,ctx,week).filter(c=>c.missing),need=cells.map(c=>c.missing);
  const patterns=[];
  for(const emp of workers){
   const fixed=assignments.filter(a=>a.employee_id===emp.id&&locked(emp.id,a.shift_date)),list=[];
   const history=(ctx.historyAssignments||[]).filter(a=>a.employee_id===emp.id).sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
   function visit(di,plan,counts,off){
    if(di===7){if(plan.length!==6)return;const hits=[];for(let i=0;i<cells.length;i++)if(plan.some(a=>a.area===cells[i].area&&Date.parse(a.starts_at)<=cells[i].t&&Date.parse(a.ends_at)>=cells[i].t+H))hits.push(i);list.push({plan,hits,cost:rotationPenalty(plan,history)+(ctx.strategy==='stable'?changes(plan,(ctx.baselineAssignments||[]).filter(a=>a.employee_id===emp.id),week).length*20:0)});return;}
    const d=add(week,di),fix=fixed.find(a=>a.shift_date===d),isLocked=locked(emp.id,d);
    if(!off&&!fix)visit(di+1,plan,counts,true);
    if(isLocked&&!fix)return;
    for(const sh of ctx.shifts){
     const k=shiftNames.indexOf(sh.name);if(k<0||counts[k]>=(k===0?2:3))continue;
     if(sh.name==='Amanecida'&&plan.some(a=>a.shift_date===add(d,-1)&&a.shift_name==='Amanecida'))continue;
     const [st,en]=slot(d,sh);if(en-st!==8*3600000)continue;
     for(const area of areas(emp)){
      const a=fix||{employee_id:emp.id,shift_date:d,starts_at:iso(st),ends_at:iso(en),area,shift_name:sh.name,segments:[{area,starts_at:iso(st),ends_at:iso(en)}]};
      if(fix&&(a.shift_name!==sh.name||a.area!==area))continue;
      if(hard(a,[...others,...plan],ctx))continue;
      const next=[...counts];next[k]++;visit(di+1,[...plan,a],next,off);
     }
    }
   }
   visit(0,[],[0,0,0],false);
   if(!list.length)return assignments;
   patterns.push({emp,list});
  }
  patterns.sort((a,b)=>a.list.length-b.list.length);
  let states=[{plan:[],counts:new Uint8Array(need.length),gain:0,cost:0}];
  for(const {list} of patterns){
   const next=[];
   for(const state of states)for(const pattern of list){
    const counts=state.counts.slice();let gain=state.gain;
    for(const i of pattern.hits)if(counts[i]<need[i]){counts[i]++;gain++;}
    next.push({plan:[...state.plan,...pattern.plan],counts,gain,cost:state.cost+pattern.cost});
   }
   next.sort((a,b)=>b.gain-a.gain||a.cost-b.cost);
   // Mantener coberturas distintas, no cientos de permutaciones del mismo reparto.
   const seen=new Set();states=[];
   for(const state of next){const key=state.counts.join(',');if(seen.has(key))continue;seen.add(key);states.push(state);if(states.length>=192)break;}
  }
  const oldGap=coverage(assignments,ctx,week).reduce((n,c)=>n+c.missing,0),oldScore=score(assignments,ctx,week,true);
  for(const state of states){const plan=[...others,...state.plan],gap=need.reduce((n,v,i)=>n+Math.max(0,v-state.counts[i]),0);if(gap<=oldGap&&score(plan,ctx,week,true)>oldScore)return plan;}
  return assignments;
 }
 function preflight(ctx,week){
  const warnings=[];
  for(let di=0;di<7;di++)for(const sh of ctx.shifts)for(const area of ['gerencial','produccion','servicio']){
   const d=add(week,di),[st,en]=slot(d,sh);
   const required=area==='gerencial'?1:Number(ctx.requirements.find(r=>Number(r.weekday)===day(d)&&r.shift_id===sh.id&&r.area===area)?.minimum_staff||0);
   if(!required)continue;
   let available=ctx.employees.filter(e=>{
    const cell=(ctx.lockedCells||[]).find(c=>c.employee_id===e.id&&c.shift_date===d);
    return areas(e).includes(area)&&active(e,d,ctx.restrictions)&&!blocked(e,st,en,ctx)&&!(e.role==='gerente'&&di===0&&tm(st)!=='08:00')&&(!cell||(cell.assignment&&cell.assignment.area===area&&Date.parse(cell.assignment.starts_at)<=st&&Date.parse(cell.assignment.ends_at)>=en));
   });
   const external=area==='gerencial'?(ctx.replacements||[]).filter(r=>r.replacement_date===d&&stamp(d,min(r.starts_at))<=st&&stamp(d,min(r.ends_at)+(min(r.ends_at)<=min(r.starts_at)?1440:0))>=en).length:0;
   if(available.length+external<required)warnings.push(`${d} · ${area} · ${sh.name}: mínimo ${required}, solo ${available.length+external} disponibles durante todo el turno. Revisa clases, permisos o refuerzos.`);
  }
  return warnings;
 }
 // Jornadas ancladas al inicio del turno para personal de 48h.
 // La cobertura es un MÍNIMO: no impide asignaciones adicionales.
 function generate(ctx,week,count=1,onProgress=()=>{}){
  const people=ctx.employees.filter(e=>e.active!==false), results=[];
  const timeSlots=ctx.shifts.map(s=>s.name);
  const workHours=e=>Number(e.weekly_hours)||0;
  const isPT=e=>e.role==='part_time';
  const dayAssignments=(aa,e,d)=>aa.filter(a=>a.employee_id===e.id&&a.shift_date===d);
  const total=(aa,e)=>aa.filter(a=>a.employee_id===e.id).reduce((n,a)=>n+h(a),0);
  const create=(e,d,shift,start,len,area)=>({employee_id:e.id,shift_date:d,starts_at:iso(start),ends_at:iso(start+len*3600000),area,shift_name:shift.name,segments:[{area,starts_at:iso(start),ends_at:iso(start+len*3600000)}]});
  const key=(c)=>c.area+'|'+c.t; // El timestamp absoluto incluye el día.
  const priority=e=>isPT(e)?0:1;
  const hash=(id,seed)=>[...String(id)].reduce((n,c)=>(n*31+c.charCodeAt(0))%100003,seed+7);
  const trials=Math.max(1,Math.min(3,count));
  const locks=ctx.lockedCells||[];
  const locked=(id,d)=>locks.some(c=>c.employee_id===id&&c.shift_date===d);
  if(new Set(locks.map(c=>c.employee_id+'|'+c.shift_date)).size!==locks.length||locks.some(c=>c.shift_date<week||c.shift_date>add(week,6)||!people.some(e=>e.id===c.employee_id)||(c.assignment&&(c.assignment.employee_id!==c.employee_id||c.assignment.shift_date!==c.shift_date))))throw Error('Revisa las fijaciones: persona, fecha o celda duplicada');
  const seeds=locks.filter(c=>c.assignment).map(c=>({...c.assignment,segments:c.assignment.segments?.map(s=>({...s}))||[]}));
  for(const [i,a] of seeds.entries()){const why=hard(a,seeds.filter((_,j)=>i!==j),ctx);if(why)throw Error(`Jornada fijada ${a.shift_date}: ${why}`);}
  const baseContext=ctx;
  onProgress({stage:"preparing",completed:0,total:trials});
  for(let trial=0;trial<trials;trial++){
   const ctx={...baseContext,strategy:trial===1?'stable':baseContext.strategy};
   let aa=[...seeds], seeded=trial*137;
   const shuffled=[...people].sort((a,b)=>priority(b)-priority(a)||hash(String(a.id)+seeded,7)%97-hash(String(b.id)+seeded,7)%97);
   // FASE GERENCIAL INDEPENDIENTE: un descanso por persona, nunca el mismo
   // día para varios gerenciales cuando hay suficientes trabajadores.
   // Se puntúan primero las coberturas de cada turno, luego la preferencia
   // de la gerente y el reparto de cierres/amanecidas.
   const managers=shuffled.filter(managerial);
   if(managers.length){
    let bestManagerPlan=[],bestManagerScore=-Infinity;
    const managerShifts=[...ctx.shifts].sort((a,b)=>min(a.starts_at)-min(b.starts_at));
    const managerOrder=[...managers].sort((a,b)=>(a.role==='gerente'?-1:1)-(b.role==='gerente'?-1:1));
    // Siete patrones rotativos de descansos, distribuidos en días diferentes.
    for(let rotation=0;rotation<7;rotation++){
     let daysOff=new Map(managerOrder.map((e,i)=>[e.id,(rotation+i)%7]));
     if(managerOrder.some(e=>e.role==='gerente'&&daysOff.get(e.id)===0))continue;
     let states=[{plan:[],value:0,counts:{}}];
     for(let di=0;di<7;di++){
      const d=add(week,di),workers=managerOrder.filter(e=>daysOff.get(e.id)!==di&&!locked(e.id,d)&&active(e,d,ctx.restrictions));
      let next=[];
      for(let state of states){
       let combinations=[{adds:[],counts:{...state.counts},value:state.value}];
       for(let emp of workers){
        let opts=[];
        for(let partial of combinations)for(let sh of managerShifts){
         let [start,end]=slot(d,sh);
         // Solo jornadas regulares ancladas en 00, 08, 16. La excepción
         // por estudios queda a cargo de la fase de ajustes posteriores.
         if(Math.abs((end-start)/3600000-8)>.01)continue;
         let a=create(emp,d,sh,start,8,'gerencial');
         if(hard(a,[...aa,...state.plan,...partial.adds],ctx))continue;
         let key=emp.id+'|'+sh.name, cnt=partial.counts[key]||0;
         let value=partial.value;
         if(emp.role==='gerente'&&ctx.preference===sh.name)value+=5;
         if(sh.name==='Amanecida'||sh.name==='Cierre')value-=cnt*2.5;
         opts.push({adds:[...partial.adds,a],counts:{...partial.counts,[key]:cnt+1},value});
        }
        opts.sort((a,b)=>b.value-a.value);
        combinations=opts.slice(0,36);
        if(!combinations.length)break;
       }
       for(let partial of combinations){
        let shiftsCovered=new Set([...partial.adds,...aa.filter(a=>a.shift_date===d&&a.area==='gerencial')].map(a=>a.shift_name));
        let missing=managerShifts.filter(sh=>!shiftsCovered.has(sh.name)).length;
        // Cada turno sin gerencial es mucho peor que cualquier preferencia.
        next.push({plan:[...state.plan,...partial.adds],counts:partial.counts,value:partial.value-missing*150});
       }
      }
      next.sort((a,b)=>b.value-a.value);
      states=next.slice(0,18);
      if(!states.length)break;
     }
     for(let state of states){
      const hours=managerOrder.reduce((n,e)=>n+[...aa,...state.plan].filter(a=>a.employee_id===e.id).reduce((v,a)=>v+h(a),0),0);
      const objective=managerOrder.reduce((n,e)=>n+Number(e.weekly_hours||48),0);
      let val=state.value-Math.max(0,objective-hours)*250;
      if(val>bestManagerScore){bestManagerScore=val;bestManagerPlan=state.plan;}
     }
    }
    aa.push(...bestManagerPlan);
   }
   onProgress({stage:'managerial',completed:1,total:3});
   // Primero construir seis jornadas de 8h para personal de 48h sin estudios.
   // El planificador anterior elegía la cobertura de manera global y podía dejar
   // trabajadores con solo una jornada. Aquí se evalúa el patrón semanal completo.
   const regular=shuffled.filter(e=>!managerial(e)&&!isPT(e)&&Number(e.weekly_hours)===48&&Number(e.work_days||6)===6&&
     !ctx.studies.some(b=>b.employee_id===e.id)&&
     !ctx.restrictions.some(r=>r.employee_id===e.id&&r.kind==='study'));
   for(const emp of regular){
    let bestPlan=[],bestValue=-Infinity;
    // Probar cada descanso y distintas prioridades de turnos, sin violar el mínimo de 12h.
    for(let off=0;off<7;off++){
     const fixed=aa.filter(a=>a.employee_id===emp.id);
     if(fixed.some(a=>a.shift_date===add(week,off)))continue;
     const days=Array.from({length:7},(_,i)=>i).filter(i=>i!==off&&!locked(emp.id,add(week,i)));
     if(days.length+fixed.length!==6)continue;
     const initial=coverage(aa,ctx,week);
     const hist=(ctx.historyAssignments||[]).filter(a=>a.employee_id===emp.id).sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
     let states=[{plan:[],value:0}];
     for(const di of days){
      const d=add(week,di), next=[];
      for(const state of states){
       for(const sh of ctx.shifts){
        const [start]=slot(d,sh);
        for(const area of areas(emp)){
         const a=create(emp,d,sh,start,8,area);
         if(hard(a,[...aa,...state.plan],ctx))continue;
         // Cobertura mínima es un objetivo, no un máximo.
         const current=initial;
         let gain=0;
         for(const c of current)if(c.area===area&&c.t>=start&&c.t<start+8*3600000&&c.missing>0)gain+=.5;
         const own=[...fixed,...state.plan,a].sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
         const previous=[...fixed,...state.plan].sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
         const rotation=rotating(emp)?rotationPenalty(own,hist)-rotationPenalty(previous,hist):0;
         const historical=hist.filter(x=>x.shift_name===a.shift_name).length;
         const stable=ctx.strategy==='stable'&&(ctx.baselineAssignments||[]).some(x=>x.employee_id===emp.id&&x.shift_date===d&&x.starts_at===a.starts_at)?20:0;
         next.push({plan:[...state.plan,a],value:state.value+gain*1000-rotation-historical*2+stable+(trial+di+off)%3*.001});
        }
       }
      }
      next.sort((x,y)=>y.value-x.value);
      states=next.slice(0,24);
      if(!states.length)break;
     }
     if(states.length&&states[0].plan.length+fixed.length===6&&states[0].value>bestValue){bestPlan=states[0].plan;bestValue=states[0].value}
    }
    // Si estudios, vacaciones u otra restricción impiden seis jornadas,
    // la fase de mejor esfuerzo continuará sin falsificar descansos.
    if(bestPlan.length)aa.push(...bestPlan);
   }
   onProgress({stage:'operations',completed:2,total:3});
   // Las jornadas normales son de 8 horas; jornadas extendidas solo para compensar estudios/cobertura.
   // Fase 1: asignar una jornada por día, priorizando el déficit de cobertura y las 48h.
   for(let round=0;round<Math.min(people.length*7,350);round++){
    let cells=coverage(aa,ctx,week),missing=new Map(cells.map(c=>[key(c),c.missing]));
    let candidates=[];
    for(let e of shuffled.filter(e=>!managerial(e))){
     let left=workHours(e)-total(aa,e);if(left<.5)continue;
     let daysUsed=new Set(aa.filter(a=>a.employee_id===e.id).map(a=>a.shift_date));
     if(daysUsed.size>=Number(e.work_days||6))continue;
     for(let di=0;di<7;di++){
      // Evaluar los siete días; no descartar arbitrariamente un tercio de las opciones.
      let d=add(week,di);if(locked(e.id,d)||daysUsed.has(d)||!active(e,d,ctx.restrictions))continue;
      for(let sh of ctx.shifts){
       let [st,en]=slot(d,sh),hasStudies=ctx.studies.some(b=>b.employee_id===e.id)||ctx.restrictions.some(r=>r.employee_id===e.id&&r.kind==='study');
       let opts=isPT(e)?[3.5,4,4.5,5,5.5,6,6.5,7,7.5,8]:(hasStudies?[8,7,6,5,4,9,10,11,12]:[8]);
       for(let len of opts){if(len>left+.001||len>(isPT(e)?8:12))continue;
        if(isPT(e)&&sh.name==='Amanecida'&&len!==8)continue;
        // Personal de 48 horas ingresa únicamente al comienzo de un turno.
        // PT puede ingresar en medias horas dentro del turno.
        let starts=isPT(e)?Array.from({length:Math.max(0,Math.floor((en-st-len*3600000)/H)+1)},(_,i)=>st+i*H):[st];
        for(let start of starts){
         for(let area of areas(e)){
          let a=create(e,d,sh,start,len,area);
          if(hard(a,aa,ctx))continue;
          let gain=0;
          for(let t=start;t<start+len*3600000;t+=H){let m=missing.get(area+'|'+t)||0;if(m>0)gain+=.5;}
          // Prioridad cobertura, luego horas de contrato. 8h es jornada preferida.
          let weight=gain*100+len*1.5+(isPT(e)?0:50)-Math.abs(len-8)*(isPT(e)?0:15);
          // Los contratos de 48 h necesitan seis días efectivos; no usar 12 h para sustituir jornadas normales.
          if(!isPT(e))weight+=Math.max(0,6-daysUsed.size)*8;
          // En caso de igualdad, rotar los días para producir alternativas.
          if(rotating(e)){const own=aa.filter(a=>a.employee_id===e.id).sort((a,b)=>a.shift_date.localeCompare(b.shift_date));const history=(ctx.historyAssignments||[]).filter(a=>a.employee_id===e.id);weight-=rotationPenalty([...own,a].sort((a,b)=>a.shift_date.localeCompare(b.shift_date)),history)-rotationPenalty(own,history);}
          weight+=((di*7+trial*13+round*3)%11)*.01;
          candidates.push({a,weight,gain,len});
         }
        }
       }
      }
     }
    }
    if(!candidates.length)break;
    candidates.sort((a,b)=>b.weight-a.weight);
    // No insertar jornada sin cobertura en las primeras rondas si quedan huecos solucionables.
    let best=candidates[0];
    if(best.weight<=0)break;
    aa.push(best.a);
    // Una asignación por iteración; repetir hasta completar jornadas.
    if(aa.length>=people.length*6)break;
    // Salida segura para iteraciones improductivas.
    if(aa.length>250)break;
   }
   // Fase 2: ampliar jornadas existentes sin exigir déficit de cobertura.
   // La cobertura es mínima, NO máxima; completar horas sigue siendo un objetivo.
   for(let e of shuffled.filter(e=>!managerial(e))){
    for(let attempt=0;attempt<32;attempt++){
     let left=workHours(e)-total(aa,e);if(left<.49)break;
     let own=aa.filter(a=>a.employee_id===e.id),changed=false;
     for(let old of own){
      if(locked(e.id,old.shift_date))continue;
      let dur=h(old),hasStudies=ctx.studies.some(b=>b.employee_id===e.id)||ctx.restrictions.some(r=>r.employee_id===e.id&&r.kind==='study');
      let max=isPT(e)?8:(hasStudies?12:8),delta=Math.min(left,max-dur);
      if(delta<.49)continue;
      let inc=Math.floor(delta*2)/2;
      let next={...old,ends_at:iso(Date.parse(old.ends_at)+inc*3600000),segments:old.segments.map((seg,i)=>i===old.segments.length-1?{...seg,ends_at:iso(Date.parse(seg.ends_at)+inc*3600000)}:seg)};
      if(!hard(next,aa.filter(x=>x!==old),ctx)){
       aa[aa.indexOf(old)]=next;changed=true;break;
      }
     }
     if(!changed)break;
    }
   }
   onProgress({stage:'balancing',completed:0,total:1});
   aa=coordinatedRotation(aa,ctx,week,locked);
   aa=improve(aa,ctx,week,locked);
   let diag=diagnostics(aa,ctx,week),quality=score(aa,ctx,week);
   let signature=aa.map(a=>a.employee_id+'/'+a.starts_at+'/'+a.ends_at+'/'+a.area).sort().join('|');
   if(!results.some(x=>x.key===signature))results.push({assignments:aa,diagnostics:diag,score:quality,key:signature});
   onProgress({stage:"calculating",completed:trial+1,total:trials});
  }
  return results.sort((a,b)=>a.diagnostics.hardIssues.length-b.diagnostics.hardIssues.length||a.diagnostics.missingPersonHours-b.diagnostics.missingPersonHours||a.diagnostics.missingContractHours-b.diagnostics.missingContractHours||b.score-a.score).slice(0,count);
 }
 return {add,day,iso,dateOf,tm,slot,h,areas,hard,blocked,diagnostics,score,generate,balance,changes,improve,preflight};
})();
