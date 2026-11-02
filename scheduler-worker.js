/* Worker: no bloquea la pantalla mientras calcula. */
importScripts('./engine.js');
if (!self.Scheduler || typeof self.Scheduler.generate !== 'function') { throw new Error('No se pudo cargar el motor de horarios'); }
self.onmessage=event=>{
 try{
  const {ctx,week,count}=event.data;
  const result=self.Scheduler.generate(ctx,week,count,p=>self.postMessage({type:'progress',...p}));
  self.postMessage({type:'done',result});
 }catch(e){self.postMessage({type:'error',message:e.message||String(e)})}
};
