// Ejecutar con Playwright disponible y la aplicación servida en localhost:8765.
import assert from 'node:assert/strict';
import '../engine.js';
const {chromium}=await import(process.env.PLAYWRIGHT_PATH||'playwright');
const shifts=[{id:'n',store_id:'s',name:'Amanecida',starts_at:'00:00',ends_at:'08:00'},{id:'o',store_id:'s',name:'Apertura',starts_at:'08:00',ends_at:'16:00'},{id:'c',store_id:'s',name:'Cierre',starts_at:'16:00',ends_at:'00:00'}];
const employees=Array.from({length:6},(_,i)=>({id:'e'+i,store_id:'s',dni:String(i+1).padStart(8,'0'),full_name:'Persona de prueba '+i,role:i===5?'entrenador':'full_time',area:'produccion',primary_area:'produccion',can_production:true,can_service:false,weekly_hours:48,work_days:6,active:true}));
const requirements=Array.from({length:7},(_,i)=>shifts.flatMap(s=>['produccion','servicio'].map(area=>({store_id:'s',weekday:i+1,shift_id:s.id,area,minimum_staff:area==='produccion'?1:0})))).flat();
const ctx={employees,shifts,requirements,studies:[],restrictions:[],meetings:[],rules:{}};
const old=Scheduler.generate(ctx,'2026-10-26')[0].assignments;
const tables={profiles:[{user_id:'u',full_name:'Gerente de prueba',role:'manager'}],stores:[{id:'s',name:'Tienda de prueba',code:'PRUEBA'}],store_managers:[{user_id:'u',store_id:'s'}],employees,shifts,staffing_requirements:requirements,store_rules:[{store_id:'s',study_travel_minutes:120,min_rest_minutes:720}],manager_preferences:[],study_blocks:[],employee_restrictions:[],manager_meetings:[],external_replacements:[],manager_schedule_confirmations:[],schedule_batches:[{id:'old-b',store_id:'s',week_start:'2026-10-26',created_at:'2026-10-25T12:00:00Z'}],schedule_options:[{id:'old-o',batch_id:'old-b',status:'draft',score:80,created_at:'2026-10-25T12:00:00Z'}],schedule_assignments:old.map((a,i)=>({...a,id:'old-a'+i,option_id:'old-o'})),assignment_segments:[]};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({tables})=>{
  window.__tables=tables;let counter=0;
  class Query{
   constructor(table){this.table=table;this.filters=[];this.sort=[];this.mode='read';}
   select(){return this} eq(k,v){this.filters.push(r=>r[k]===v);return this} in(k,vs){this.filters.push(r=>vs.includes(r[k]));return this}
   gte(k,v){this.filters.push(r=>r[k]>=v);return this} lte(k,v){this.filters.push(r=>r[k]<=v);return this}
   order(k,opts={}){this.sort.push([k,opts.ascending!==false]);return this} limit(n){this.end=n-1;return this} range(a,b){this.start=a;this.end=b;return this}
   maybeSingle(){this.one=true;return this} single(){this.one=true;return this}
   insert(rows){this.mode='insert';this.payload=Array.isArray(rows)?rows:[rows];return this}
   update(value){this.mode='update';this.payload=value;return this} delete(){this.mode='delete';return this}
   then(resolve,reject){return Promise.resolve().then(()=>{
    const source=window.__tables[this.table]||=[];let rows=source.filter(r=>this.filters.every(f=>f(r)));
    if(this.mode==='insert'){rows=this.payload.map(r=>({...r,id:r.id||'new-'+(++counter),created_at:new Date(Date.now()+counter).toISOString()}));source.push(...rows)}
    if(this.mode==='delete')window.__tables[this.table]=source.filter(r=>!rows.includes(r));
    if(this.mode==='update')rows.forEach(r=>Object.assign(r,this.payload));
    for(const [key,ascending] of this.sort.reverse())rows.sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(ascending?1:-1));
    rows=rows.slice(this.start||0,this.end===undefined?undefined:this.end+1);
    return {data:this.one?rows[0]||null:structuredClone(rows),error:null};
   }).then(resolve,reject)}
  }
  window.__mockClient={auth:{getUser:async()=>({data:{user:{id:'u'}}}),signOut:async()=>({error:null})},from:table=>new Query(table)};
 },{tables});
 await page.route('**/supabase-js@2/**',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>window.__mockClient};'}));
 await page.route('**/xlsx.full.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.XLSX={};'}));
 await page.goto('http://127.0.0.1:8765/');
 await page.waitForFunction(()=>document.querySelector('#who').textContent.includes('Gerente de prueba'));
 await page.locator('button[data-tab="generate"]').click();
 await page.locator('#genWeek').fill('2026-11-02');await page.locator('#genWeek').dispatchEvent('change');
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('1 de'));
 await page.locator('#copyPrevious').click();
 await page.waitForFunction(()=>document.querySelector('#scheduleTitle').textContent.includes('sin guardar'));
 assert.equal(await page.locator('#schedule [data-weekly-employee]').count(),42);
 await page.locator('#cancelWeeklyDraft').click();
 await page.locator('#proposalCount').selectOption('3');
 await page.locator('#generateBtn').click();
 await page.waitForFunction(()=>document.querySelector('#generationStatus').textContent.includes('Horario guardado'),null,{timeout:120000});
 await page.waitForFunction(()=>!document.querySelector('#generateBtn').disabled);
 assert.equal(await page.locator('#balanceReport tbody tr').count(),7);
 assert(await page.locator('#optionSelect option').count()>=2,'Debe mostrar alternativas distintas');
 await page.locator('#editPerson').selectOption('e0');
 await page.locator('#editDate').selectOption('2026-11-05');
 if(await page.locator('#editLength').inputValue()==='8'){
  await page.locator('#applyWeeklyCell').click();
  await page.waitForFunction(()=>document.querySelector('#scheduleTitle').textContent.includes('sin guardar'));
  assert(await page.locator('#schedule .weekly-fixed').count()>0);
  const before=await page.evaluate(()=>window.__tables.schedule_options.length);
  await page.locator('#saveWeeklyVersion').click();
  await page.waitForFunction(n=>window.__tables.schedule_options.length>n,before);
  await page.waitForFunction(()=>!document.querySelector('#scheduleTitle').textContent.includes('sin guardar'));
 }
 const downloadPromise=page.waitForEvent('download');await page.locator('#exportImage').click();
 const download=await downloadPromise;assert(download.suggestedFilename().endsWith('.png'));
 await download.saveAs('/tmp/turnopro-weekly-export.png');
 await page.locator('#weeklyEditor').screenshot({path:'/tmp/turnopro-weekly-editor.png'});
 await page.locator('#schedule').screenshot({path:'/tmp/turnopro-weekly-schedule.png'});
 assert.deepEqual(errors,[]);
 console.log('OK: interfaz con datos simulados, historial, copia, generación real en Worker, edición, fijación, nueva versión e imagen PNG');
}finally{await browser.close()}
