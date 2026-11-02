/* Formato simple y compatibilidad con las plantillas anteriores. */
globalThis.ImportTemplate=(()=>{
 const normal=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const defaults={gerente:48,asistente:48,entrenador:48,full_time:48,part_time:19.5};
 const blank=v=>v===undefined||v===null||String(v).trim()==='';
 const yes=v=>['si','true','1','x'].includes(normal(v));
 const dni=v=>typeof v==='number'&&Number.isInteger(v)?String(v).padStart(8,'0'):String(v??'').trim();
 const time=v=>{
  if(typeof v==='number'){
   const minutes=Math.round(v*1440);
   if(v<0||v>=1||minutes>=1440)return '';
   return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  }
  const m=String(v??'').trim().match(/^(\d{1,2}):(\d{2})(?::00)?$/);
  return m&&Number(m[1])<24&&Number(m[2])<60?`${m[1].padStart(2,'0')}:${m[2]}`:'';
 };
 function parse(rows,blocks){
  const staff=[];
  for(const [i,r] of rows.entries()){
   if(['DNI','Nombre','Cargo','Área','Area','Otra área','Horas semanales'].every(k=>blank(r[k])))continue;
   const line=(r.__rowNum__??i+1)+1;
   const role=normal(r.Cargo).replace(/\s+/g,'_');
   const ger=['gerente','asistente'].includes(role);
   const area=ger?'gerencial':normal(r['Área']??r.Area);
   const extra=normal(r['Otra área']);
   const id=dni(r.DNI),name=String(r.Nombre??'').trim();
   if(!/^\d{8}$/.test(id)||!name||!defaults[role]||!['produccion','servicio','gerencial'].includes(area)||(!ger&&area==='gerencial'))throw Error(`Personal fila ${line}: revisa DNI, nombre, cargo y área`);
   if(!ger&&extra&&!['produccion','servicio'].includes(extra))throw Error(`Personal fila ${line}: otra área debe ser Producción o Servicio`);
   const prod=!ger&&(r['Producción']!==undefined?yes(r['Producción']):area==='produccion'||extra==='produccion');
   const serv=!ger&&(r.Servicio!==undefined?yes(r.Servicio):area==='servicio'||extra==='servicio');
   if(!ger&&(!(prod||serv)||(area==='produccion'&&!prod)||(area==='servicio'&&!serv)))throw Error(`Personal fila ${line}: el área principal debe estar habilitada`);
   const hours=blank(r['Horas semanales'])?defaults[role]:Number(String(r['Horas semanales']).replace(',','.'));
   const days=blank(r['Días de trabajo'])?6:Number(r['Días de trabajo']);
   if(!Number.isFinite(hours)||hours<=0||hours>days*(role==='part_time'?8:12)||!Number.isInteger(days)||days<1||days>6)throw Error(`Personal fila ${line}: horas o días de trabajo inválidos`);
   if(staff.some(e=>e.dni===id))throw Error(`Personal fila ${line}: DNI duplicado ${id}`);
   staff.push({dni:id,full_name:name,role,area,primary_area:area,can_production:prod,can_service:serv,weekly_hours:hours,work_days:days,active:true});
  }
  if(!staff.length)throw Error('Completa al menos una persona en la pestaña Personal');
  const weekdays={lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6,domingo:7};
  const study=[];
  for(const [i,r] of blocks.entries()){
   if(['DNI','Día','Dia','Inicio','Fin'].every(k=>blank(r[k])))continue;
   const line=(r.__rowNum__??i+1)+1;
   const b={dni:dni(r.DNI),weekday:weekdays[normal(r['Día']??r.Dia)],starts_at:time(r.Inicio),ends_at:time(r.Fin)};
   if(!staff.some(e=>e.dni===b.dni)||!b.weekday||!b.starts_at||!b.ends_at||b.starts_at>=b.ends_at)throw Error(`Estudios fila ${line}: usa un DNI de Personal, un día y horas válidas (inicio anterior al fin)`);
   if(study.some(s=>s.dni===b.dni&&s.weekday===b.weekday&&s.starts_at<b.ends_at&&b.starts_at<s.ends_at))throw Error(`Estudios fila ${line}: clase duplicada o superpuesta`);
   study.push(b);
  }
  return {staff,study};
 }
 return {parse};
})();
