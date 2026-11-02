(()=>{'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config=window.APP_CONFIG;if(!config||!config.supabaseUrl||!config.supabaseAnonKey){$('login').insertAdjacentHTML('beforeend','<p class="badbox">Configura config.js con URL y clave pública.</p>');return}
const db=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey);
let user,profile,storeId,stores=[],employees=[],studies=[],restrictions=[],shifts=[],requirements=[],rules={},meetings=[],replacements=[],preference='ninguna',options=[],selected=null,editorEmployee=null,pending=null,managerConfirmed=false,managerEditing=false,managerDraft=null,managerSelectedCells=[],managerSwapMode=false;
const q=async p=>{let {data,error}=await p;if(error)throw error;return data};
const notify=s=>{let n=$('notice');n.textContent=s;n.style.display='block';setTimeout(()=>n.style.display='none',7000)};
const guard=f=>async e=>{e?.preventDefault();try{await f(e)}catch(ex){console.error(ex);notify('Error: '+ex.message)}};
const admin=()=>profile?.role==='admin';
const monday=()=>{let d=new Date(),k=(d.getDay()+6)%7;d.setDate(d.getDate()+(7-k));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const normal=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const group=e=>['gerente','asistente'].includes(e.role)?0:(e.primary_area||e.area)==='produccion'?1:2;
const rank=e=>e.role==='gerente'?0:e.role==='asistente'?1:e.role==='full_time'?2:e.role==='entrenador'?3:4;
const sorted=es=>[...es].sort((a,b)=>group(a)-group(b)||rank(a)-rank(b)||a.full_name.localeCompare(b.full_name));
const dayNames=['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
function tab(t){if(admin())t='admin';document.querySelectorAll('.panel').forEach(x=>x.hidden=x.id!==t);document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x.dataset.tab===t))}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('loginForm').onsubmit=guard(async()=>{await q(db.auth.signInWithPassword({email:$('email').value,password:$('password').value}));await boot()});
$('logout').onclick=guard(async()=>{await q(db.auth.signOut());location.reload()});
async function boot(){let {data:{user:u},error}=await db.auth.getUser();if(error||!u)return;user=u;profile=await q(db.from('profiles').select('*').eq('user_id',u.id).maybeSingle());if(!profile)throw Error('No tienes perfil asignado');$('login').hidden=true;$('app').hidden=false;$('logout').hidden=false;$('who').textContent=profile.full_name+' · '+(admin()?'Administrador':'Gerente');$('adminTab').hidden=!admin();document.querySelectorAll('nav button').forEach(b=>{if(b.id!=='adminTab')b.hidden=admin()});$('store').disabled=!admin();$('genWeek').value=monday();tab(admin()?'admin':'employees');await loadStores()}
async function loadStores(){stores=await q(db.from('stores').select('*').order('name'));if(!admin()){let links=await q(db.from('store_managers').select('store_id').eq('user_id',user.id));stores=stores.filter(s=>links.some(l=>l.store_id===s.id))}storeId=stores.some(s=>s.id===storeId)?storeId:stores[0]?.id;$('store').innerHTML=stores.map(s=>`<option value="${s.id}">${esc(s.name)} (${esc(s.code)})</option>`).join('');if(!storeId){notify('Sin tiendas asignadas');return} $('store').value=storeId;await reload()}
$('store').onchange=guard(async()=>{storeId=$('store').value;await reload()});
async function reload(){if(admin()){renderAdmin();return}
 [employees,shifts,requirements,meetings,replacements]=await Promise.all([
 q(db.from('employees').select('*').eq('store_id',storeId).order('full_name')),
 q(db.from('shifts').select('*').eq('store_id',storeId)),q(db.from('staffing_requirements').select('*').eq('store_id',storeId)),
 q(db.from('manager_meetings').select('*').eq('store_id',storeId).order('meeting_date')),
 q(db.from('external_replacements').select('*').eq('store_id',storeId).order('replacement_date'))]);
 rules=await q(db.from('store_rules').select('*').eq('store_id',storeId).maybeSingle())||{study_travel_minutes:120,min_rest_minutes:720};
 preference=(await q(db.from('manager_preferences').select('preferred_shift').eq('store_id',storeId).maybeSingle()))?.preferred_shift||'ninguna';
 studies=employees.length?await q(db.from('study_blocks').select('*').in('employee_id',employees.map(e=>e.id))):[];
 restrictions=await q(db.from('employee_restrictions').select('*').eq('store_id',storeId));
 renderEmployees();renderRules();renderManager();await loadOptions();
}
function renderAdmin(){$('adminStores').innerHTML='<table><tr><th>Tienda</th><th>Código</th></tr>'+stores.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.code)}</td></tr>`).join('')+'</table>'}
$('storeForm').onsubmit=guard(async()=>{if(!admin())throw Error('Acceso restringido');await q(db.from('stores').insert({name:$('storeName').value.trim(),code:$('storeCode').value.trim()}));$('storeForm').reset();await loadStores()});
const defaults={full_time:48,entrenador:48,asistente:48,gerente:48,part_time:19.5};
$('role').onchange=()=>{let r=$('role').value;$('hours').value=defaults[r];$('days').value=6;if(['asistente','gerente'].includes(r)){$('area').value='gerencial';$('canProd').checked=false;$('canServ').checked=false}};
$('area').onchange=()=>{let a=$('area').value;if(a==='produccion')$('canProd').checked=true;if(a==='servicio')$('canServ').checked=true};
function renderEmployees(){
 const table=arr=>'<div class="scroll"><table><tr><th>Trabajador</th><th>Cargo</th><th>Área principal</th><th>Áreas habilitadas</th><th>Horas</th><th>Estado</th><th>Acciones</th></tr>'+arr.map(e=>`<tr><td>${esc(e.full_name)}<br><small>${esc(e.dni)}</small></td><td>${esc(e.role)}</td><td>${esc(e.primary_area||e.area)}</td><td>${e.can_production?'Producción ':''}${e.can_service?'Servicio':''}</td><td>${e.weekly_hours}</td><td>${e.active?'Activo':'Inactivo'}</td><td class="staff-actions"><button data-restrict="${e.id}">Ver restricciones</button><button data-delete="${e.id}" class="danger">Eliminar</button></td></tr>`).join('')+'</table></div>';
 let html='';for(let [i,title] of ['Gerenciales','Producción','Servicio'].entries())html+=`<h3 class="group-title">${title}</h3>`+table(sorted(employees.filter(e=>group(e)===i)));$('employeesTable').innerHTML=html;
 document.querySelectorAll('[data-restrict]').forEach(b=>b.onclick=guard(async()=>await openRestrictions(b.dataset.restrict)));
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=guard(async()=>{const e=employees.find(x=>x.id===b.dataset.delete);if(!e)return;const typed=prompt(`ELIMINACIÓN DEFINITIVA de ${e.full_name} (${e.dni}).\nSe eliminarán también sus clases y asignaciones históricas.\n\nEscribe exactamente su DNI:`);if(typed===null)return;if(typed!==e.dni)throw Error('DNI incorrecto; no se eliminó');await q(db.rpc('turnopro_delete_employee',{p_employee_id:e.id,p_store_id:storeId}));if(editorEmployee===e.id){editorEmployee=null;$('restrictionEditor').hidden=true}await reload();notify('Trabajador eliminado')}));
 if(editorEmployee)renderRestrictionRows();
}
function employeeData(dni,name,role,area,prod,serv,hrs,days){let ger=['gerente','asistente'].includes(role);if(ger)area='gerencial';if(!ger&&!prod&&!serv)throw Error('Marca al menos un área');if(!ger&&!(area==='produccion'?prod:serv))throw Error('Área principal debe estar habilitada');if(!/^\d{8}$/.test(dni))throw Error('DNI inválido');return {store_id:storeId,dni,full_name:name,role,area,primary_area:area,can_production:ger?false:prod,can_service:ger?false:serv,weekly_hours:Number(hrs),work_days:role==='part_time'?6:Number(days),active:true}}
$('employeeForm').onsubmit=guard(async()=>{let e=employeeData($('dni').value.trim(),$('fullname').value.trim(),$('role').value,$('area').value,$('canProd').checked,$('canServ').checked,$('hours').value,$('days').value);await q(db.from('employees').upsert(e,{onConflict:'store_id,dni'}));$('employeeForm').reset();await reload();notify('Trabajador guardado')});
const excelTime=v=>typeof v==='number'?`${String(Math.floor(Math.round(v*1440)/60)%24).padStart(2,'0')}:${String(Math.round(v*1440)%60).padStart(2,'0')}`:String(v??'').slice(0,5);
$('previewImport').onclick=guard(async()=>{let file=$('excel').files[0];if(!file)throw Error('Selecciona Excel');let wb=XLSX.read(await file.arrayBuffer(),{type:'array'});if(!wb.Sheets.Personal||!wb.Sheets.Estudios)throw Error('Requiere pestañas Personal y Estudios');let rows=XLSX.utils.sheet_to_json(wb.Sheets.Personal,{defval:''}),blocks=XLSX.utils.sheet_to_json(wb.Sheets.Estudios,{defval:''});
 let staff=rows.map((r,i)=>{let role=normal(r.Cargo).replace(/\s+/g,'_'),area=normal(r['Área']??r.Area),dni=String(r.DNI??'').trim(),name=String(r.Nombre??'').trim();if(!defaults[role]||!['produccion','servicio','gerencial'].includes(area)||!name)throw Error(`Personal fila ${i+2}: revisa cargo, nombre y área`);let ger=['gerente','asistente'].includes(role);let prod=ger?false:(r['Producción']!==undefined?['si','sí','true','1','x'].includes(normal(r['Producción'])):area==='produccion');let serv=ger?false:(r.Servicio!==undefined?['si','sí','true','1','x'].includes(normal(r.Servicio)):area==='servicio');return employeeData(dni,name,role,area,prod,serv,r['Horas semanales']===''?defaults[role]:r['Horas semanales'],r['Días de trabajo']===''?6:r['Días de trabajo'])});
 if(!staff.length||new Set(staff.map(x=>x.dni)).size!==staff.length)throw Error('Personal vacío o DNI duplicados');
 let map={lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6,domingo:7};let study=blocks.filter(r=>String(r.DNI??'').trim()).map((r,i)=>{let b={dni:String(r.DNI).trim(),weekday:map[normal(r['Día']??r.Dia)],starts_at:excelTime(r.Inicio),ends_at:excelTime(r.Fin)};if(!staff.some(e=>e.dni===b.dni)||!b.weekday||b.starts_at>=b.ends_at)throw Error(`Estudios fila ${i+2}: datos inválidos`);return b});pending={staff,study};
 $('importPreview').hidden=false;renderImportPreview();});
function renderImportPreview(){let p=$('importPreview');p.innerHTML=`<h3>Revisar antes de confirmar</h3><p>${pending.staff.length} trabajadores y ${pending.study.length} clases. Puedes modificar las casillas antes de guardar. Los estudios de estos DNI se reemplazarán.</p><div class="preview-scroll"><table><tr><th>DNI</th><th>Nombre</th><th>Cargo</th><th>Principal</th><th>Producción</th><th>Servicio</th><th>Horas</th></tr>${pending.staff.map((e,i)=>`<tr><td>${esc(e.dni)}</td><td>${esc(e.full_name)}</td><td>${esc(e.role)}</td><td><select data-principal="${i}"><option value="produccion" ${e.primary_area==='produccion'?'selected':''}>Producción</option><option value="servicio" ${e.primary_area==='servicio'?'selected':''}>Servicio</option><option value="gerencial" ${e.primary_area==='gerencial'?'selected':''}>Gerencial</option></select></td><td><input type="checkbox" data-prod="${i}" ${e.can_production?'checked':''} ${e.area==='gerencial'?'disabled':''}></td><td><input type="checkbox" data-serv="${i}" ${e.can_service?'checked':''} ${e.area==='gerencial'?'disabled':''}></td><td>${e.weekly_hours}</td></tr>`).join('')}</table></div><button id="confirmImport">Confirmar y guardar</button> <button id="cancelImport" class="secondary">Cancelar</button>`;
 $('cancelImport').onclick=()=>{pending=null;p.hidden=true};$('confirmImport').onclick=guard(async()=>{for(let i=0;i<pending.staff.length;i++){let e=pending.staff[i];e.can_production=p.querySelector(`[data-prod="${i}"]`).checked;e.can_service=p.querySelector(`[data-serv="${i}"]`).checked;e.primary_area=p.querySelector(`[data-principal="${i}"]`).value;e.area=e.primary_area;if(e.role!=='gerente'&&e.role!=='asistente'){if(!e.can_production&&!e.can_service)throw Error(`${e.full_name}: sin áreas`);if(e.primary_area==='gerencial'||(e.primary_area==='produccion'&&!e.can_production)||(e.primary_area==='servicio'&&!e.can_service))throw Error(`${e.full_name}: área principal incorrecta`);}}
 await q(db.from('employees').upsert(pending.staff,{onConflict:'store_id,dni'}));let people=await q(db.from('employees').select('id,dni').eq('store_id',storeId)),lookup=new Map(people.map(e=>[e.dni,e.id]));let ids=pending.staff.map(e=>lookup.get(e.dni));if(ids.length)await q(db.from('study_blocks').delete().in('employee_id',ids));if(pending.study.length)await q(db.from('study_blocks').insert(pending.study.map(s=>({employee_id:lookup.get(s.dni),weekday:s.weekday,starts_at:s.starts_at,ends_at:s.ends_at}))));pending=null;p.hidden=true;await reload();notify('Importación confirmada')});}
async function openRestrictions(id){
 const e=employees.find(x=>x.id===id);if(!e)throw Error('Trabajador no encontrado');
 // Leer directamente con la sesión del gerente, evitando datos en caché.
 const [academic,other]=await Promise.all([
 q(db.from('study_blocks').select('id,employee_id,weekday,starts_at,ends_at,valid_from,valid_until').eq('employee_id',id).order('weekday')),
 q(db.from('employee_restrictions').select('*').eq('store_id',storeId).eq('employee_id',id))
 ]);
 studies=studies.filter(x=>x.employee_id!==id).concat(academic);
 restrictions=restrictions.filter(x=>x.employee_id!==id).concat(other);
 editorEmployee=id;$('restrictionEditor').hidden=false;renderRestrictionRows();$('restrictionEditor').scrollIntoView({behavior:'smooth'});
}
$('closeRestrictions').onclick=()=>{$('restrictionEditor').hidden=true;editorEmployee=null};
function renderRestrictionRows(){
 const e=employees.find(x=>x.id===editorEmployee);if(!e)return;
 $('restrictionTitle').textContent='Restricciones y áreas · '+e.full_name;
 const isManager=['gerente','asistente'].includes(e.role);
 $('employeeAreas').innerHTML=isManager?'<p>Personal gerencial: su función es la cobertura gerencial.</p>':`<div class="area-editor"><strong>Áreas habilitadas</strong><p>Selecciona las áreas en las que puede trabajar. Puede alternar una vez durante una jornada.</p><label><input type="checkbox" id="editCanProd" ${e.can_production?'checked':''}> Producción</label><label><input type="checkbox" id="editCanServ" ${e.can_service?'checked':''}> Servicio</label><label>Área principal <select id="editPrimaryArea"><option value="produccion" ${e.primary_area==='produccion'?'selected':''}>Producción</option><option value="servicio" ${e.primary_area==='servicio'?'selected':''}>Servicio</option></select></label><button type="button" id="saveEmployeeAreas">Guardar áreas</button></div>`;
 if(!isManager)$('saveEmployeeAreas').onclick=guard(async()=>{
   const prod=$('editCanProd').checked,serv=$('editCanServ').checked,primary=$('editPrimaryArea').value;
   if(!prod&&!serv)throw Error('Selecciona al menos un área');
   if(primary==='produccion'&&!prod||primary==='servicio'&&!serv)throw Error('El área principal debe estar habilitada');
   await q(db.from('employees').update({can_production:prod,can_service:serv,primary_area:primary,area:primary}).eq('id',e.id).eq('store_id',storeId));
   await reload();await openRestrictions(e.id);notify('Áreas actualizadas');
 });
 const academic=studies.filter(x=>x.employee_id===e.id).map(x=>({...x,kind:'study_original'}));
 const other=restrictions.filter(x=>x.employee_id===e.id);
 const arr=[...academic,...other];
 let html=`<p><b>${academic.length} clases importadas</b> · ${other.length} restricciones adicionales · Traslado previo: ${rules.study_travel_minutes??120} minutos.</p>`;
 if(!academic.length)html+=`<div class="warning">No se encontraron clases vinculadas a este trabajador (DNI ${esc(e.dni)}). Esto no significa que se hayan borrado las clases de otros trabajadores. Comprueba el diagnóstico SQL incluido en la entrega.</div>`;
 html+='<div class="scroll"><table><tr><th>Tipo</th><th>Día / fechas</th><th>Inicio</th><th>Fin</th><th>Notas</th><th>Acciones</th></tr>';
 html+=arr.map(x=>`<tr><td>${esc(x.kind==='study_original'?'Clase importada':x.kind==='vacation'?'Vacaciones':x.kind==='personal'?'Pedido especial':'Estudios')}</td><td>${x.weekday?esc(dayNames[Number(x.weekday)]||x.weekday):esc((x.date_from||'')+' '+(x.date_to||''))}</td><td>${esc(x.starts_at||'—')}</td><td>${esc(x.ends_at||'—')}</td><td>${esc(x.notes||'')}</td><td class="staff-actions"><button data-redit="${x.id}" data-kind="${x.kind}" class="secondary">Editar</button><button data-rdel="${x.id}" data-kind="${x.kind}" class="danger">Eliminar</button></td></tr>`).join('')+'</table></div>';
 $('restrictionRows').innerHTML=html;
 document.querySelectorAll('[data-rdel]').forEach(b=>b.onclick=guard(async()=>{if(!confirm('¿Eliminar esta restricción?'))return;await q(db.from(b.dataset.kind==='study_original'?'study_blocks':'employee_restrictions').delete().eq('id',b.dataset.rdel));await openRestrictions(editorEmployee);notify('Restricción eliminada')}));
 document.querySelectorAll('[data-redit]').forEach(b=>b.onclick=guard(async()=>{
 const x=arr.find(r=>r.id===b.dataset.redit);if(!x)return;
 const day=prompt('Día semanal (1=Lunes ... 7=Domingo). Deja vacío para restricción por fechas:',x.weekday||'');if(day===null)return;
 const start=prompt('Hora de inicio (HH:MM). Para vacaciones, deja vacío:',(x.starts_at||'').slice(0,5));if(start===null)return;
 const end=prompt('Hora de fin (HH:MM). Para vacaciones, deja vacío:',(x.ends_at||'').slice(0,5));if(end===null)return;
 const wd=day.trim()?Number(day):null;
 if(wd!==null&&(!Number.isInteger(wd)||wd<1||wd>7))throw Error('Día inválido');
 const isVacation=x.kind==='vacation';
 if(!isVacation&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end))throw Error('Horas inválidas');
 const table=b.dataset.kind==='study_original'?'study_blocks':'employee_restrictions';
 const changes=table==='study_blocks'?{weekday:wd,starts_at:start,ends_at:end}:{weekday:wd,starts_at:isVacation?null:start,ends_at:isVacation?null:end};
 if(table==='study_blocks'&&!wd)throw Error('Una clase importada requiere día semanal');
 await q(db.from(table).update(changes).eq('id',x.id));await openRestrictions(editorEmployee);notify('Restricción actualizada');
 }));
}
$('restrictionForm').onsubmit=guard(async()=>{if(!editorEmployee)throw Error('Selecciona trabajador');let kind=$('restrictionKind').value,weekday=$('restrictionDay').value?Number($('restrictionDay').value):null,from=$('restrictionFrom').value||null,to=$('restrictionTo').value||null,starts=$('restrictionStart').value||null,ends=$('restrictionEnd').value||null;if(!weekday&&!from)throw Error('Indica día recurrente o fecha');if(kind==='vacation'){if(!from||!to)throw Error('Vacaciones requieren fecha inicial y final');starts=null;ends=null;weekday=null;}else if(!starts||!ends||starts>=ends)throw Error('Horas inválidas');if(from&&to&&to<from)throw Error('Fechas inválidas');await q(db.from('employee_restrictions').insert({store_id:storeId,employee_id:editorEmployee,kind,weekday,starts_at:starts,ends_at:ends,date_from:from,date_to:to,notes:$('restrictionNotes').value}));$('restrictionForm').reset();await openRestrictions(editorEmployee);notify('Restricción guardada')});
function renderRules(){$('travel').value=rules.study_travel_minutes??120;$('rest').value=rules.min_rest_minutes??720;
 let basic=[['Amanecida','00:00','08:00'],['Apertura','08:00','16:00'],['Cierre','16:00','00:00']];$('shiftRows').innerHTML=basic.map(([name,start,end])=>{let s=shifts.find(x=>x.name===name);return `<div class="shiftline"><label><input type="checkbox" data-shift="${name}" ${s?'checked':''}> ${name}</label><input type="time" data-start="${name}" value="${esc((s?.starts_at||start).slice(0,5))}"><input type="time" data-end="${name}" value="${esc((s?.ends_at||end).slice(0,5))}"></div>`}).join('');
 $('coverage').innerHTML='<div class="scroll"><table><tr><th>Día</th><th>Turno</th><th>Producción</th><th>Servicio</th></tr>'+Array.from({length:7},(_,i)=>i+1).flatMap(w=>shifts.map(s=>`<tr><td>${dayNames[w]}</td><td>${esc(s.name)}</td>${['produccion','servicio'].map(a=>`<td><input type="number" min="0" max="99" value="${Number(requirements.find(r=>Number(r.weekday)===w&&r.shift_id===s.id&&r.area===a)?.minimum_staff||0)}" data-cover="${w}|${s.id}|${a}"></td>`).join('')}</tr>`)).join('')+'</table></div>'}
$('rulesForm').onsubmit=guard(async()=>{await q(db.from('store_rules').upsert({store_id:storeId,study_travel_minutes:Number($('travel').value),min_rest_minutes:Number($('rest').value),max_manager_nights:1}));await reload();notify('Reglas guardadas')});
$('saveShifts').onclick=guard(async()=>{for(let name of ['Amanecida','Apertura','Cierre']){let checked=document.querySelector(`[data-shift="${name}"]`).checked,s=shifts.find(x=>x.name===name);if(checked){let row={store_id:storeId,name,starts_at:document.querySelector(`[data-start="${name}"]`).value,ends_at:document.querySelector(`[data-end="${name}"]`).value,is_overnight:name==='Amanecida'};if(row.starts_at===row.ends_at)throw Error('Turno de duración cero');await q(db.from('shifts').upsert(row,{onConflict:'store_id,name'}));}else if(s){await q(db.from('staffing_requirements').delete().eq('shift_id',s.id));await q(db.from('shifts').delete().eq('id',s.id));}}await reload();notify('Turnos guardados')});
$('saveCoverage').onclick=guard(async()=>{let rows=[...document.querySelectorAll('[data-cover]')].map(x=>{let [weekday,shift_id,area]=x.dataset.cover.split('|');return {store_id:storeId,weekday:Number(weekday),shift_id,area,minimum_staff:Number(x.value)}});await q(db.from('staffing_requirements').upsert(rows,{onConflict:'store_id,shift_id,weekday,area'}));await reload();notify('Cobertura semanal guardada')});
function renderManager(){$('preferredShift').value=preference;$('meetingsTable').innerHTML='<table><tr><th>Fecha</th><th>Reunión</th><th>Turno afectado</th><th></th></tr>'+meetings.map(m=>`<tr><td>${m.meeting_date}</td><td>${m.meeting_start.slice(0,5)}–${m.meeting_end.slice(0,5)}</td><td>${esc(shifts.filter(s=>{let a=Scheduler.slot(m.meeting_date,s),b=Date.parse(m.meeting_date+'T'+m.meeting_start+'-05:00'),c=Date.parse(m.meeting_date+'T'+m.meeting_end+'-05:00');return a[0]<c&&b<a[1]}).map(s=>s.name).join(', ')||'Sin turno coincidente')}</td><td><button data-mdel="${m.id}">Eliminar</button></td></tr>`).join('')+'</table>';
 $('replacementsTable').innerHTML='<table><tr><th>Fecha</th><th>Nombre</th><th>Tienda</th><th>Horario</th><th></th></tr>'+replacements.map(r=>`<tr><td>${r.replacement_date}</td><td>${esc(r.full_name)}</td><td>${esc(r.origin_store)}</td><td>${r.starts_at.slice(0,5)}–${r.ends_at.slice(0,5)}</td><td><button data-rpdel="${r.id}">Eliminar</button></td></tr>`).join('')+'</table>';
 document.querySelectorAll('[data-mdel]').forEach(b=>b.onclick=guard(async()=>{await q(db.from('manager_meetings').delete().eq('id',b.dataset.mdel));await reload()}));document.querySelectorAll('[data-rpdel]').forEach(b=>b.onclick=guard(async()=>{await q(db.from('external_replacements').delete().eq('id',b.dataset.rpdel));await reload()}));}
$('preferenceForm').onsubmit=guard(async()=>{await q(db.from('manager_preferences').upsert({store_id:storeId,preferred_shift:$('preferredShift').value}));await reload();notify('Preferencia guardada')});
$('meetingForm').onsubmit=guard(async()=>{let m={store_id:storeId,meeting_date:$('meetingDate').value,meeting_start:$('meetingStart').value,meeting_end:$('meetingEnd').value,absence_start:$('meetingStart').value,absence_end:$('meetingEnd').value,notes:$('meetingNotes').value};if(m.meeting_start>=m.meeting_end)throw Error('Horas de reunión inválidas');await q(db.from('manager_meetings').insert(m));$('meetingForm').reset();await reload();notify('Reunión registrada')});
$('replacementForm').onsubmit=guard(async()=>{let r={store_id:storeId,replacement_date:$('repDate').value,starts_at:$('repStart').value,ends_at:$('repEnd').value,full_name:$('repName').value.trim(),origin_store:$('repOrigin').value.trim()};if(r.starts_at===r.ends_at)throw Error('Horario inválido');await q(db.from('external_replacements').insert(r));$('replacementForm').reset();await reload();notify('Reemplazo registrado')});
function context(){return {employees,studies,restrictions,shifts,requirements,rules,meetings,replacements,preference}}
function presentDiagnostics(d){let cls=d.status==='valido'?'good':d.status==='condicionado'?'warning':'badbox';$('diagnostics').innerHTML=`<div class="${cls}"><b>Estado: ${d.status.toUpperCase()}</b> · ${d.missingPersonHours.toFixed(1)} horas-persona sin cubrir · ${d.missingContractHours.toFixed(1)} horas contractuales pendientes</div>`+(d.hardIssues.length?`<h3>Infracciones estrictas (${d.hardIssues.length})</h3><ul>${d.hardIssues.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:'')+`<h3>Cobertura pendiente: intervalos sin personal suficiente (${d.gaps.length})</h3><div class="scroll"><table><tr><th>Día</th><th>Turno</th><th>Área</th><th>Personal adicional necesario</th><th>Desde</th><th>Hasta</th></tr>${d.gaps.map(g=>`<tr><td>${dayNames[Scheduler.day(g.d)]}</td><td>${esc(g.shift)}</td><td>${esc(g.area)}</td><td>${g.missing}</td><td>${Scheduler.tm(g.start)}</td><td>${Scheduler.tm(g.end)}</td></tr>`).join('')}</table></div><p class="small"><strong>¿Qué significa?</strong> Cada fila indica cuándo no se alcanza el mínimo de trabajadores definido para ese día, turno y área. Por ejemplo, 1 persona faltante durante 30 minutos equivale a 0.5 horas-persona. No es una infracción del trabajador: es una necesidad de cobertura de la tienda.</p><h3>Horas contractuales pendientes</h3><div class="scroll"><table><tr><th>Trabajador</th><th>Asignadas</th><th>Objetivo</th><th>Faltantes</th></tr>${d.hours.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.worked.toFixed(1)}</td><td>${x.target}</td><td>${x.missing.toFixed(1)}</td></tr>`).join('')}</table></div>`}
function scheduleHtml(assignments,week){let days=Array.from({length:7},(_,i)=>Scheduler.add(week,i)),html='';for(let g=0;g<3;g++){html+=`<h3 class="group-title">${['GERENCIALES','PRODUCCIÓN','SERVICIO'][g]}</h3>${g===0?'<div class="shift-legend"><span class="legend-night">Amanecida · 00:00–08:00</span><span class="legend-open">Apertura · 08:00–16:00</span><span class="legend-close">Cierre · 16:00–00:00</span><span class="legend-rest">DESC · Descanso</span></div><p class="small">Los colores identifican el turno. Las jornadas excepcionales por estudios pueden tener otros horarios. Una celda marcada indica una restricción o incidencia que debe revisarse.</p>':''}<div class="scroll"><table><tr><th>Trabajador</th>${days.map(d=>`<th>${dayNames[Scheduler.day(d)]}</th>`).join('')}<th>Horas</th></tr>`;
 for(let e of sorted(employees.filter(x=>group(x)===g))){let own=assignments.filter(a=>a.employee_id===e.id);html+=`<tr><th>${esc(e.full_name)}<br><small>${esc(e.role)}</small></th>`;for(let d of days){let a=own.find(x=>x.shift_date===d),vac=restrictions.some(r=>r.employee_id===e.id&&r.kind==='vacation'&&r.date_from<=d&&(!r.date_to||r.date_to>=d));let content=vac?'VAC':a?`${Scheduler.tm(Date.parse(a.starts_at))}–${Scheduler.tm(Date.parse(a.ends_at))}<br>${(a.segments||[]).map(s=>`${esc(s.area)} ${Scheduler.tm(Date.parse(s.starts_at))}–${Scheduler.tm(Date.parse(s.ends_at))}`).join('<br>')}`:'DESC';let shiftClass='';if(g===0&&a){const hh=Scheduler.tm(Date.parse(a.starts_at));shiftClass=hh==='00:00'?'shift-night':hh==='08:00'?'shift-open':hh==='16:00'?'shift-close':'shift-exception';}else if(g===0&&!a)shiftClass='shift-rest';html+=`<td class="cell ${shiftClass} ${g===0&&managerEditing?'manager-editable':''}" ${g===0?`data-manager-employee="${esc(e.id)}" data-manager-day="${d}"`:``}>${content}</td>`}html+=`<td>${own.reduce((n,a)=>n+Scheduler.h(a),0).toFixed(1)}/${e.weekly_hours}</td></tr>`;}html+='</table></div>'}return html}

// Gerenciales V5.12: borrador local, validación completa y confirmación persistida.
const managerial=e=>['gerente','asistente'].includes(e.role);
const managerIds=()=>new Set(employees.filter(managerial).map(e=>e.id));
const managerRows=aa=>aa.filter(a=>managerIds().has(a.employee_id));
const cloneRows=aa=>aa.map(a=>({...a,segments:(a.segments||[]).map(x=>({...x}))}));
function makeManagerAssignment(id,d,start){
 if(start==='DESC')return null;
 const from=Date.parse(`${d}T${start}:00-05:00`);
 const to=from+8*3600000;
 const shift_name={'00:00':'Amanecida','08:00':'Apertura','16:00':'Cierre'}[start];
 return {employee_id:id,shift_date:d,starts_at:Scheduler.iso(from),ends_at:Scheduler.iso(to),area:'gerencial',shift_name,segments:[]};
}
function managerCellAssignment(rows,id,d){return rows.find(a=>a.employee_id===id&&a.shift_date===d)}
function replaceManagerCell(rows,id,d,newAssignment){const i=rows.findIndex(a=>a.employee_id===id&&a.shift_date===d);if(i>=0)rows.splice(i,1);if(newAssignment)rows.push(newAssignment)}
function validateManagerRows(rows,week){
 const errors=[];const ids=managerIds();const relevant=rows.filter(a=>ids.has(a.employee_id));
 for(let i=0;i<relevant.length;i++){
  const a=relevant[i];const reason=Scheduler.hard(a,rows.filter(x=>x!==a),context());
  if(reason)errors.push(`${employees.find(e=>e.id===a.employee_id)?.full_name}: ${reason}`);
 }
 for(let e of employees.filter(managerial)){
  if(e.active===false)continue;
  const own=relevant.filter(a=>a.employee_id===e.id);
  const total=own.reduce((v,a)=>v+Scheduler.h(a),0);
  const vacation=restrictions.some(r=>r.employee_id===e.id&&r.kind==='vacation'&&r.date_from<=week&&(!r.date_to||r.date_to>=Scheduler.add(week,6)));
  if(!vacation&&(own.length!==6||Math.abs(total-Number(e.weekly_hours))>.01))errors.push(`${e.full_name}: ${own.length} días y ${total} h; se requieren 6 días y ${e.weekly_hours} h (salvo excepciones justificadas).`);
 }
 // Cobertura gerencial, continua y por turno, sin mezclar áreas.
 for(let i=0;i<7;i++)for(let shift of shifts){
  const d=Scheduler.add(week,i),[a,b]=Scheduler.slot(d,shift);
  for(let t=a;t<b;t+=1800000){
   const covered=relevant.some(x=>Date.parse(x.starts_at)<=t&&Date.parse(x.ends_at)>=t+1800000);
   const external=replacements.some(r=>r.replacement_date===d&&(()=>{let st=Date.parse(`${d}T${String(r.starts_at).slice(0,5)}:00-05:00`),en=Date.parse(`${d}T${String(r.ends_at).slice(0,5)}:00-05:00`);if(en<=st)en+=86400000;return st<=t&&en>=t+1800000})());
   if(!covered&&!external){errors.push(`Sin cobertura gerencial: ${d}, ${shift.name}, ${Scheduler.tm(t)}.`);break}
  }
 }
 return [...new Set(errors)];
}
function managerCrossWeekWarnings(rows,week){
 const out=[];const next=Scheduler.add(week,7),sat=Scheduler.add(week,5),sun=Scheduler.add(week,6);
 for(let e of employees.filter(managerial)){
  const satA=managerCellAssignment(rows,e.id,sat),sunA=managerCellAssignment(rows,e.id,sun);
  if(satA&&sunA&&Scheduler.tm(Date.parse(satA.starts_at))==='00:00'&&Scheduler.tm(Date.parse(sunA.starts_at))==='00:00')out.push(`${e.full_name}: amanecidas sábado y domingo; al planificar el lunes ${next}, priorizar recuperación y evitar otra amanecida.`);
 }
 return out;
}
async function loadManagerConfirmation(){
 managerConfirmed=false;
 if(!selected)return;
 const row=await q(db.from('manager_schedule_confirmations').select('confirmed_at').eq('option_id',selected.id).maybeSingle());
 managerConfirmed=!!row;
}
function renderManagerEditor(){
 const root=$('managerEditor');root.hidden=!selected;if(!selected)return;
 $('managerLockLabel').textContent=managerConfirmed?'✓ Gerenciales confirmados y bloqueados':'Gerenciales · Sin confirmar';
 $('managerLockLabel').classList.toggle('manager-locked',managerConfirmed);
 $('managerEditBtn').textContent=managerConfirmed?'Desbloquear para editar':'Editar gerenciales';
 $('managerConfirmBtn').disabled=managerConfirmed||managerEditing;
 $('managerEditControls').hidden=!managerEditing;
 $('managerEditorHint').textContent=managerEditing?'Selecciona una celda gerencial y cambia su turno; o activa Intercambiar y selecciona dos celdas. Guarda para aplicar.':'El horario gerencial confirmado no se modifica durante la generación de otras áreas.';
 const aa=managerEditing?managerDraft:selected.assignments;
 $('managerWarnings').innerHTML=managerCrossWeekWarnings(aa,selected.week).map(w=>`<p class="manager-warning">${esc(w)}</p>`).join('');
 document.querySelectorAll('[data-manager-employee]').forEach(cell=>{cell.onclick=()=>{
  if(!managerEditing)return;
  const key=[cell.dataset.managerEmployee,cell.dataset.managerDay];
  if(managerSwapMode){managerSelectedCells.push(key);if(managerSelectedCells.length===2){const [[id1,d1],[id2,d2]]=managerSelectedCells;const a=managerCellAssignment(managerDraft,id1,d1),b=managerCellAssignment(managerDraft,id2,d2);
   const s1=a?Scheduler.tm(Date.parse(a.starts_at)):'DESC',s2=b?Scheduler.tm(Date.parse(b.starts_at)):'DESC';
   if(!['DESC','00:00','08:00','16:00'].includes(s1)||!['DESC','00:00','08:00','16:00'].includes(s2)){notify('Intercambio de jornadas excepcionales: usa edición individual');managerSelectedCells=[];return}
   replaceManagerCell(managerDraft,id1,d1,makeManagerAssignment(id1,d1,s2));replaceManagerCell(managerDraft,id2,d2,makeManagerAssignment(id2,d2,s1));managerSelectedCells=[];managerSwapMode=false;
   const errs=validateManagerRows(managerDraft,selected.week);$('managerEditStatus').textContent=errs.length?`${errs.length} observaciones: ${errs.slice(0,3).join(' | ')}`:'Intercambio válido. Guarda para persistir.';redrawManagerDraft();
  }else $('managerEditStatus').textContent='Selecciona una segunda celda para intercambiar.';
  }else{managerSelectedCells=[key];document.querySelectorAll('.manager-cell-selected').forEach(x=>x.classList.remove('manager-cell-selected'));cell.classList.add('manager-cell-selected');const a=managerCellAssignment(managerDraft,...key);$('managerShiftChoice').value=a?Scheduler.tm(Date.parse(a.starts_at)):'DESC';$('managerEditStatus').textContent=`Seleccionado: ${key[1]}`}
 }});
}
function redrawManagerDraft(){$('schedule').innerHTML=scheduleHtml(managerDraft,selected.week);renderManagerEditor()}
$('managerEditBtn').onclick=guard(async()=>{
 if(!selected)throw Error('No hay horario');
 if(managerConfirmed){if(!confirm('Se desbloqueará el horario gerencial. Debes volver a confirmarlo tras editar. ¿Continuar?'))return;
  await q(db.from('manager_schedule_confirmations').delete().eq('option_id',selected.id));managerConfirmed=false;}
 managerEditing=true;managerDraft=cloneRows(selected.assignments);managerSelectedCells=[];managerSwapMode=false;redrawManagerDraft();
});
$('managerCancelEdit').onclick=()=>{managerEditing=false;managerDraft=null;managerSelectedCells=[];$('schedule').innerHTML=scheduleHtml(selected.assignments,selected.week);renderManagerEditor()};
$('managerSwapCell').onclick=()=>{managerSwapMode=true;managerSelectedCells=[];$('managerEditStatus').textContent='Selecciona dos celdas para intercambiar sus turnos.'};
$('managerApplyCell').onclick=()=>{if(!managerSelectedCells.length)throw Error('Selecciona una celda');const [id,d]=managerSelectedCells[0];replaceManagerCell(managerDraft,id,d,makeManagerAssignment(id,d,$('managerShiftChoice').value));const errs=validateManagerRows(managerDraft,selected.week);$('managerEditStatus').textContent=errs.length?`${errs.length} observaciones: ${errs.slice(0,3).join(' | ')}`:'Cambio válido. Guarda para persistir.';redrawManagerDraft()};
$('managerSaveDraft').onclick=guard(async()=>{
 if(!selected||!managerEditing)throw Error('No hay edición activa');
 const errors=validateManagerRows(managerDraft,selected.week);if(errors.length)throw Error('No se puede guardar: '+errors.slice(0,5).join(' | '));
 const ids=[...managerIds()];const originals=managerRows(selected.assignments);
 // Reemplazar SOLO jornadas gerenciales; el resto queda intacto.
 // Los registros de segmentos antiguos se borran en cascada.
 if(originals.length)await q(db.from('schedule_assignments').delete().in('id',originals.map(a=>a.id)));
 const payload=managerRows(managerDraft).map(a=>({option_id:selected.id,employee_id:a.employee_id,shift_date:a.shift_date,starts_at:a.starts_at,ends_at:a.ends_at,area:'gerencial'}));
 for(let i=0;i<payload.length;i+=100)await q(db.from('schedule_assignments').insert(payload.slice(i,i+100)));
 managerEditing=false;managerDraft=null;managerSelectedCells=[];
 await selectOption(selected.id);notify('Cambios gerenciales guardados. Falta confirmar para bloquear.');
});
$('managerConfirmBtn').onclick=guard(async()=>{
 if(!selected||managerEditing)throw Error('Termina de editar antes de confirmar');
 const errors=validateManagerRows(selected.assignments,selected.week);if(errors.length)throw Error('No se puede confirmar: '+errors.slice(0,5).join(' | '));
 await q(db.from('manager_schedule_confirmations').upsert({option_id:selected.id,store_id:storeId,week_start:selected.week,confirmed_by:user.id},{onConflict:'option_id'}));
 managerConfirmed=true;renderManagerEditor();notify('Horario gerencial confirmado y bloqueado');
});

async function loadOptions(){
 // Solo se presenta la propuesta más reciente de la semana elegida.
 // El historial anterior permanece intacto en Supabase.
 const week=$('genWeek').value||monday();
 const batches=await q(db.from('schedule_batches').select('id,week_start').eq('store_id',storeId).eq('week_start',week).order('created_at',{ascending:false}).limit(1));
 const rows=batches.length?await q(db.from('schedule_options').select('*').eq('batch_id',batches[0].id).order('created_at',{ascending:false}).limit(1)):[];
 options=rows.map(o=>({...o,week}));
 $('optionSelect').innerHTML=options.map(o=>`<option value="${o.id}">Horario ${esc(week)} · ${esc(o.status)}</option>`).join('');
 if(options.length){await selectOption(options[0].id);$('proposalCard').hidden=false}
 else{selected=null;$('schedule').innerHTML='';$('diagnostics').innerHTML='';$('proposalCard').hidden=true}
}
$('genWeek').addEventListener('change',()=>loadOptions().catch(e=>notify('Error: '+e.message)));
async function selectOption(id){managerEditing=false;managerDraft=null;managerSelectedCells=[];selected=options.find(o=>o.id===id);if(!selected)return;let aa=await q(db.from('schedule_assignments').select('*').eq('option_id',id));let segs=aa.length?await q(db.from('assignment_segments').select('*').in('assignment_id',aa.map(a=>a.id))):[];selected.assignments=aa.map(a=>({...a,shift_name:shifts.find(s=>{let [x,y]=Scheduler.slot(a.shift_date,s);return Date.parse(a.starts_at)>=x&&Date.parse(a.starts_at)<y})?.name||'Turno',segments:segs.filter(s=>s.assignment_id===a.id)}));let diag=Scheduler.diagnostics(selected.assignments,context(),selected.week);$('schedule').innerHTML=scheduleHtml(managerEditing?managerDraft:selected.assignments,selected.week);presentDiagnostics(diag);await loadManagerConfirmation();renderManagerEditor();$('optionSelect').value=id}
$('optionSelect').onchange=guard(async()=>selectOption($('optionSelect').value));
// El cálculo pesado se ejecuta fuera del hilo principal.
function calculateInWorker(ctx,week,count,status){
 return new Promise((resolve,reject)=>{
  const worker=new Worker('./scheduler-worker.js');
  let finished=false;
  const timer=setTimeout(()=>{if(!finished){worker.terminate();reject(Error('El cálculo excedió 120 segundos. Prueba con una alternativa.'))}},120000);
  const close=()=>{finished=true;clearTimeout(timer);worker.terminate()};
  worker.onmessage=({data})=>{
   if(data.type==='done'){close();resolve(data.result)}
   else if(data.type==='error'){close();reject(Error(data.message))}
   else if(data.type==='progress'){status(data)}
  };
  worker.onerror=e=>{close();reject(Error('Error del motor: '+(e.message||'Worker')))};
  worker.postMessage({ctx,week,count});
 });
}
$('generateBtn').onclick=guard(async()=>{
 let week=$('genWeek').value;
 if(!week||Scheduler.day(week)!==1)throw Error('Elige un lunes');if(managerConfirmed&&selected?.week===week)throw Error('Los gerenciales están confirmados. Para cambiar esta semana, desbloquea el horario antes de generar nuevamente.');
 if(!shifts.length||!employees.length)throw Error('Faltan turnos o personal');
 if(requirements.length!==shifts.length*7*2)throw Error('Guarda la cobertura para los siete días y las dos áreas');
 let count=1;
 const button=$('generateBtn'),bar=$('generationProgress'),status=$('generationStatus');
 button.disabled=true;bar.hidden=false;bar.removeAttribute('value');bar.setAttribute('aria-valuetext','Calculando horario');
 status.textContent='Optimizando horarios en segundo plano...';
 try{
  const result=await calculateInWorker(context(),week,count,p=>{
   if(p.stage==='managerial'){bar.max=3;bar.value=1;status.textContent='Etapa 1/3: horario gerencial calculado. Revisando producción y servicio...'}else if(p.stage==='operations'){bar.max=3;bar.value=2;status.textContent='Etapa 2/3: asignando producción y servicio...'}else if(p.stage==='calculating'&&p.completed>0){bar.max=p.total;bar.value=p.completed;status.textContent=`Cálculo terminado: ${p.completed} de ${p.total} intento(s). Preparando guardado...`}
   else{bar.removeAttribute('value');status.textContent='Calculando primero gerenciales y luego cobertura de producción y servicio...'}
  });
  if(!result.length)throw Error('No se encontraron propuestas');
  bar.value=0;bar.max=result.reduce((n,o)=>n+o.assignments.length,0)||1;
  status.textContent='Guardando horario...';
  const batch=await q(db.from('schedule_batches').insert({store_id:storeId,week_start:week,created_by:user.id}).select('id').single());
  let saved=0;
  for(let o of result){
   const row=await q(db.from('schedule_options').insert({batch_id:batch.id,score:o.score,status:'draft'}).select('id').single());
   // Un solo INSERT por propuesta en vez de una solicitud por trabajador.
   const payload=o.assignments.map(a=>({option_id:row.id,employee_id:a.employee_id,shift_date:a.shift_date,starts_at:a.starts_at,ends_at:a.ends_at,area:a.area}));
   let inserted=[];
   for(let i=0;i<payload.length;i+=100){
    const chunk=await q(db.from('schedule_assignments').insert(payload.slice(i,i+100)).select('id,employee_id,shift_date,starts_at,ends_at'));
    inserted.push(...chunk);
    saved+=chunk.length;bar.value=saved;
    status.textContent=`Guardando horarios: ${saved} de ${bar.max}`;
   }
   const segmentPayload=[];
   for(let i=0;i<o.assignments.length;i++){
    const a=o.assignments[i];
    const match=inserted.find(x=>x.employee_id===a.employee_id&&x.shift_date===a.shift_date&&x.starts_at===a.starts_at&&x.ends_at===a.ends_at);
    if(match)for(const seg of a.segments||[])segmentPayload.push({assignment_id:match.id,area:seg.area,starts_at:seg.starts_at,ends_at:seg.ends_at});
   }
   for(let i=0;i<segmentPayload.length;i+=100)await q(db.from('assignment_segments').insert(segmentPayload.slice(i,i+100)));
  }
  status.textContent=`Horario guardado. ${result[0].diagnostics.missingPersonHours} horas-persona sin cubrir y ${result[0].diagnostics.missingContractHours} horas pendientes.`;
  await loadOptions();
 }finally{button.disabled=false;bar.hidden=true}
});
$('approve').onclick=guard(async()=>{if(!selected)throw Error('Selecciona una propuesta');let d=Scheduler.diagnostics(selected.assignments,context(),selected.week);if(d.status!=='valido')throw Error('No se aprueba como completo: existen déficits o restricciones incumplidas. Se conserva como borrador condicionado.');await q(db.from('schedule_options').update({status:'archived'}).eq('batch_id',selected.batch_id).eq('status','approved'));await q(db.from('schedule_options').update({status:'approved'}).eq('id',selected.id));await loadOptions();notify('Horario aprobado')});
$('exportExcel').onclick=guard(async()=>{if(!selected)throw Error('Selecciona propuesta');let rows=sorted(employees).map(e=>{let o={Grupo:['Gerenciales','Producción','Servicio'][group(e)],DNI:e.dni,Nombre:e.full_name,Cargo:e.role};for(let i=0;i<7;i++){let d=Scheduler.add(selected.week,i),a=selected.assignments.find(x=>x.employee_id===e.id&&x.shift_date===d);o[dayNames[i+1]]=a?`${Scheduler.tm(Date.parse(a.starts_at))}-${Scheduler.tm(Date.parse(a.ends_at))} ${(a.segments||[]).map(s=>s.area).join('/')}`:'DESC'}o.Horas=selected.assignments.filter(a=>a.employee_id===e.id).reduce((n,a)=>n+Scheduler.h(a),0);return o});let wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Horario');let d=Scheduler.diagnostics(selected.assignments,context(),selected.week);XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(d.gaps.map(g=>({Dia:dayNames[Scheduler.day(g.d)],Turno:g.shift,Area:g.area,Faltan:g.missing,Desde:Scheduler.tm(g.start),Hasta:Scheduler.tm(g.end)}))),'Cobertura faltante');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(d.hours),'Horas faltantes');XLSX.writeFile(wb,`TurnoPro_${selected.week}.xlsx`)});
$('exportPdf').onclick=()=>window.print();
boot().catch(e=>notify(e.message));
})();
