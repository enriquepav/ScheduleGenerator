const assert=require('node:assert/strict');
require('../import-template.js');
const parse=globalThis.ImportTemplate.parse;
const staff=[
 {DNI:'01234567',Nombre:'Ana',Cargo:'Gerente'},
 {DNI:'12345678',Nombre:'Luis',Cargo:'Part time','Área':'Producción','Otra área':'Servicio'},
 {DNI:'87654321',Nombre:'Rosa',Cargo:'Full time','Área':'Servicio','Horas semanales':40},
 {'REGISTRO DE PERSONAL':'No importar instrucciones'},
];
const blocks=[{DNI:'12345678','Día':'Miércoles',Inicio:14/24,Fin:19/24},{DNI:'01234567','Día':'Jueves',Inicio:'9:00',Fin:'12:00'}];
const result=parse(staff,blocks);
assert.equal(result.staff.length,3);
assert.equal(result.staff[0].area,'gerencial');
assert.equal(result.staff[0].dni,'01234567');
assert.equal(result.staff[0].weekly_hours,48);
assert.equal(result.staff[1].weekly_hours,19.5);
assert(result.staff[1].can_production&&result.staff[1].can_service);
assert.equal(result.staff[2].weekly_hours,40);
assert.equal(result.study[0].starts_at,'14:00');
assert.equal(result.study[1].starts_at,'09:00');
assert.equal(parse([{DNI:1234567,Nombre:'Ana',Cargo:'Asistente'}],[]).staff[0].dni,'01234567');
const legacy=parse([{DNI:'12345678',Nombre:'Luis',Cargo:'part_time','Área':'produccion','Horas semanales':19.5,'Días de trabajo':6,'Producción':'SI',Servicio:'SI'}],blocks.slice(0,1));
assert(legacy.staff[0].can_service);
assert.equal(parse(staff,[]).study.length,0);
assert.throws(()=>parse([...staff,staff[0]],[]),/duplicado/);
assert.throws(()=>parse(staff,[{DNI:'11111111','Día':'Lunes',Inicio:'14:00',Fin:'15:00'}]),/Estudios fila/);
for(const Inicio of ['abc','25:00','14:99','',1,-0.1])assert.throws(()=>parse(staff,[{...blocks[0],Inicio}]),/Estudios fila/);
assert.throws(()=>parse(staff,[{...blocks[0],DNI:''}]),/Estudios fila/);
assert.throws(()=>parse(staff,[blocks[0],blocks[0]]),/superpuesta/);
assert.throws(()=>parse([{...staff[1],'Horas semanales':'abc'}],[]),/horas/);
assert.throws(()=>parse([{...staff[1],'Área':'Gerencial'}],[]),/área/);
console.log('OK: formato simple, anterior, gerenciales, áreas, horas, DNI, clases y validación');
