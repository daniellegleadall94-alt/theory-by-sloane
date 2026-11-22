import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createCipheriv} from 'node:crypto';
import {createCompanyApi} from '../server/company-api.mjs';
import {externalSyncItem,localSyncItem,applyExternalItem,providerPayload} from '../server/calendar-sync-model.mjs';
import {exportRecurrence,importRecurrence} from '../server/calendar-recurrence.mjs';
import {completeTask} from '../src/work.ts';
import {eventOccurrences} from '../src/calendarModel.ts';

test('native event repeat patterns retain weekday, interval, count and local daylight-saving schedule',()=>{
 for(const provider of ['microsoft','google'])for(const recurrence of [{mode:'daily',interval:2,unit:'days',days:[],count:6},{mode:'weekly',interval:2,unit:'weeks',days:[1,3],count:7},{mode:'monthly',interval:1,unit:'months',days:[],monthlyPattern:'weekday',ordinal:4,weekday:3,count:5}]){
  const event={title:'Review',start:'2026-03-25T09:00',end:'2026-03-25T10:00',allDay:false,timeZone:'Europe/London',recurrence},rule=exportRecurrence(provider,event),restored=importRecurrence(provider,rule,event.start,event.timeZone);
  assert.deepEqual(eventOccurrences({...event,recurrence:restored},'2026-03-01','2027-01-01').map(e=>e.start),eventOccurrences(event,'2026-03-01','2027-01-01').map(e=>e.start));
  const payload=providerPayload(provider,localSyncItem({kind:'event'},event));assert.equal(provider==='google'?payload.start.timeZone:payload.start.timeZone,'Europe/London');
 }
 for(const day of [29,30,31]){const event={start:'2028-01-'+day,end:'2028-01-'+day,allDay:true,timeZone:'Europe/London',recurrence:{mode:'monthly',interval:1,days:[],count:15}};const rule=exportRecurrence('google',event);assert.ok(rule[0].includes('BYSETPOS=-1'));const restored=importRecurrence('google',rule,event.start);assert.deepEqual(eventOccurrences({...event,recurrence:restored},'2028-01-01','2029-12-31').map(e=>e.start),eventOccurrences(event,'2028-01-01','2029-12-31').map(e=>e.start));const ms=importRecurrence('microsoft',exportRecurrence('microsoft',event),event.start);assert.deepEqual(eventOccurrences({...event,recurrence:ms},'2028-01-01','2029-12-31').map(e=>e.start),eventOccurrences(event,'2028-01-01','2029-12-31').map(e=>e.start))}
 for(const provider of ['microsoft','google']){const event={start:'2028-02-29',end:'2028-02-29',allDay:true,recurrence:{mode:'annually',interval:1,days:[],count:4}};const restored=importRecurrence(provider,exportRecurrence(provider,event),event.start);assert.deepEqual(eventOccurrences({...event,recurrence:restored},'2028-01-01','2032-01-01').map(e=>e.start),['2028-02-29','2029-02-28','2030-02-28','2031-02-28']);}
 const clamped={start:'2027-02-28',end:'2027-02-28',allDay:true,recurrence:{mode:'monthly',monthDay:31,interval:1,days:[],count:3}};for(const provider of ['microsoft','google'])assert.equal(importRecurrence(provider,exportRecurrence(provider,clamped),clamped.start).monthDay,31);
 assert.equal(importRecurrence('microsoft',{pattern:{type:'daily',interval:1,dayOfMonth:0,month:0},range:{type:'noEnd',startDate:'2026-01-01'}},'2026-01-01').unit,'days');
 assert.throws(()=>importRecurrence('google',['RRULE:FREQ=MONTHLY;BYMONTHDAY=28,31;BYSETPOS=-1'],'2026-01-31'),/without changing/);
 assert.throws(()=>applyExternalItem('task',{title:'Keep me',occurrenceOf:'series'},{recurrence:{mode:'weekly'}}),/history cannot be changed/);
 assert.throws(()=>importRecurrence('google',['RRULE:FREQ=MONTHLY;BYMONTHDAY=31'],'2026-01-31'),/without changing/);
});

test('calendar sync retains all-day boundaries, London summer times, descriptions and completion markers',()=>{
 const row={kind:'task',updated_at:'2026-07-01T12:00:00Z'},task={title:'Launch',due:'2026-07-01',done:true,description:'Details'};
 const item=localSyncItem(row,task);assert.equal(item.title,'✓ Launch');assert.equal(item.end,'2026-07-02');
 const timed=localSyncItem(row,{...task,calendarTime:{start:'09:00',end:'10:00',timeZone:'Europe/London'}});assert.equal(timed.start,'2026-07-01T08:00:00.000Z');
 const remote=externalSyncItem('google',{...providerPayload('google',timed),id:'one',organizer:{self:true}});
 const restored=applyExternalItem('task',task,remote);assert.equal(restored.calendarTime.start,'09:00');assert.equal(restored.description,'Details');assert.equal(restored.title,'Launch');
 assert.equal(localSyncItem(row,{...task,recurrence:{mode:'daily'}}).recurrence,null);
});

for(const provider of ['microsoft','google'])test(provider+' two-way mapping, imports, conflicts, permissions, deletion confirmation and disconnect',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'theory-sync-')),path=join(dir,'db.sqlite'),key=randomBytes(32),google=provider==='google',events=new Map();let serial=0,creates=0;
 const env={THEORY_PUBLIC_URL:'http://127.0.0.1',THEORY_CALENDAR_MASTER_KEY:key.toString('base64')};
 const revision=e=>google?e.etag:e['@odata.etag'];
 const stamp=(id,body)=>({...body,id,...(google?{etag:'v'+(++serial),updated:new Date().toISOString(),organizer:{self:true}}:{'@odata.etag':'v'+(++serial),lastModifiedDateTime:new Date().toISOString(),isOrganizer:true})});
 const fetchImpl=async(value,options={})=>{
  const url=new URL(value),method=options.method||'GET',body=options.body?JSON.parse(options.body):null,id=decodeURIComponent(url.pathname.split('/').at(-1));
  if(method==='GET'&&(url.pathname.endsWith('/calendars')||url.pathname.endsWith('/calendarList')))return Response.json(google?{items:[{id:'theory-calendar',summary:'Theory'}]}:{value:[{id:'theory-calendar',name:'Theory'}]});
  if(url.pathname.endsWith('/calendarView'))return Response.json({value:[...events.values()]});
  if(url.pathname.endsWith('/calendars')&&method==='POST')return Response.json({id:'theory-calendar',name:'Theory',summary:'Theory'});
  if(url.pathname.endsWith('/events')){
   if(method==='GET')return Response.json(google?{items:[...events.values()],nextSyncToken:'cursor'}:{value:[...events.values()]});
   if(method==='POST'){creates++;const existing=[...events.values()].find(e=>google?e.id===body.id:e.transactionId===body.transactionId);if(existing)return Response.json(existing);const e=stamp(body.id||'external-'+serial,body);events.set(e.id,e);return Response.json(e)}
  }
  if(url.pathname.endsWith('/instances')){const masterId=decodeURIComponent(url.pathname.split('/').at(-2)),master=events.get(masterId),date='2026-12-08';let instance=[...events.values()].find(e=>(e.recurringEventId||e.seriesMasterId)===masterId);if(!instance){instance=stamp('instance-'+masterId,google?{...master,recurrence:undefined,recurringEventId:masterId,originalStartTime:{date},start:{date},end:{date:'2026-12-09'}}:{...master,recurrence:null,seriesMasterId:masterId,originalStart:date+'T00:00:00Z',start:{dateTime:date+'T00:00:00'},end:{dateTime:'2026-12-09T00:00:00'}});events.set(instance.id,instance)}return Response.json(google?{items:[instance]}:{value:[instance]})}
  const e=events.get(id);if(e&&!google&&url.searchParams.has('$expand'))return Response.json({...e,exceptionOccurrences:[...events.values()].filter(x=>x.seriesMasterId===e.id).map(x=>({id:x.id}))});
  if(!e)return Response.json({error:'missing'},{status:404});
  if(method==='GET')return Response.json(e);
  if(options.headers['If-Match']!==revision(e))return Response.json({error:'version'},{status:412});
  if(method==='DELETE'){events.delete(id);return new Response(null,{status:204})}
  if(method==='PATCH'){const next=stamp(id,{...e,...body});events.set(id,next);return Response.json(next)}
  throw Error('Unexpected request');
 };
 const api=createCompanyApi({databasePath:path,calendarOptions:{env,fetchImpl}}),server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;env.THEORY_PUBLIC_URL=origin;
 const req=async(cookie,url,method='GET',body)=>{const r=await fetch(origin+'/api/'+url,{method,headers:{Origin:origin,Cookie:cookie||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')}};
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON');
 try{
  const owner=await req('','auth/register','POST',{name:'Owner',email:'owner@sync.test',password:'Test calendar sync password',companyName:'Test company'}),other=await req('','auth/register','POST',{name:'Other',email:'other@sync.test',password:'Test calendar sync password',companyName:'Other company'}),user=db.prepare('SELECT * FROM users WHERE email=?').get('owner@sync.test');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(user.id+':account'));const secret=Buffer.concat([iv,cipher.update(JSON.stringify({access:'test',refresh:'test',expires:Date.now()+3600000})),cipher.final(),cipher.getAuthTag()]).toString('base64');
  db.prepare('INSERT INTO calendar_accounts(id,user_id,provider,subject,label,secret,can_write) VALUES(?,?,?,?,?,?,1)').run('account',user.id,provider,'subject','Test account',secret);
  const task=(await req(owner.cookie,'personal/data/task','POST',{id:'task',title:'Launch',due:'2026-12-01',description:'Launch notes',done:false})).body.record;
  await req(other.cookie,'personal/data/task','POST',{id:'private-other',title:'Never export',due:'2026-12-01',done:false});
  const endpoint='calendar/connections/account/theory-sync';
  assert.equal((await req(other.cookie,endpoint)).status,404);
  assert.equal((await req(owner.cookie,endpoint,'POST',{})).status,400);
  assert.equal((await req(owner.cookie,endpoint,'POST',{confirm:true})).status,200);
  assert.equal(events.size,1);assert.equal(creates,1);
  const meeting=stamp('invited-meeting',google?{summary:'Team meeting',start:{date:'2026-12-01'},end:{date:'2026-12-02'},attendees:[{email:'colleague@example.test'}]}:{subject:'Team meeting',isAllDay:true,start:{dateTime:'2026-12-01T00:00:00'},end:{dateTime:'2026-12-02T00:00:00'},attendees:[{emailAddress:{address:'colleague@example.test'}}]});events.set(meeting.id,meeting);
  const shown=await req(owner.cookie,'calendar/external-events?from=2026-12-01&to=2026-12-03');assert.equal(shown.status,200);assert.deepEqual(shown.body.events.map(event=>event.title),['Team meeting']);events.delete(meeting.id);
  assert.equal((await req(owner.cookie,endpoint,'POST',{})).status,200);assert.equal(creates,1);
  const externalId=[...events.keys()][0],remote=events.get(externalId);
  events.set(externalId,stamp(externalId,{...remote,...(google?{summary:'Moved outside',start:{date:'2026-12-03'},end:{date:'2026-12-04'}}:{subject:'Moved outside',start:{dateTime:'2026-12-03T00:00:00'},end:{dateTime:'2026-12-04T00:00:00'}})}));
  await req(owner.cookie,endpoint,'POST',{});
  let current=(await req(owner.cookie,'personal/data/task')).body.records.find(t=>t.id==='task');assert.equal(current.due,'2026-12-03');assert.equal(current.title,'Moved outside');
  current=(await req(owner.cookie,'personal/data/task/task','PUT',{...current,title:'Done now',done:true})).body.record;
  await req(owner.cookie,endpoint,'POST',{});assert.equal(google?events.get(externalId).summary:events.get(externalId).subject,'✓ Done now');
  const inbound=stamp('new-external',google?{summary:'Incoming',description:'Created outside',start:{dateTime:'2026-07-01T08:00:00Z'},end:{dateTime:'2026-07-01T09:00:00Z'}}:{subject:'Incoming',body:{content:'Created outside'},start:{dateTime:'2026-07-01T08:00:00'},end:{dateTime:'2026-07-01T09:00:00'}});events.set(inbound.id,inbound);
  await req(owner.cookie,endpoint,'POST',{});let tasks=(await req(owner.cookie,'personal/data/task')).body.records;const imported=tasks.find(t=>t.title==='Incoming');assert.equal(imported.plannerAllocated,false);assert.equal(imported.calendarTime.start,'09:00');
  await req(owner.cookie,endpoint,'POST',{});assert.equal((await req(owner.cookie,'personal/data/task')).body.records.length,2);
  // A simultaneous edit keeps the newer provider version and retains the overwritten Theory data.
  await req(owner.cookie,'personal/data/task/'+imported.id,'PUT',{...imported,title:'Local conflict'});
  events.set(inbound.id,stamp(inbound.id,{...events.get(inbound.id),...(google?{summary:'Remote conflict',updated:'2099-01-01T00:00:00Z'}:{subject:'Remote conflict',lastModifiedDateTime:'2099-01-01T00:00:00Z'})}));
  const conflict=events.get(inbound.id);if(google)conflict.updated='2099-01-01T00:00:00Z';else conflict.lastModifiedDateTime='2099-01-01T00:00:00Z';
  await req(owner.cookie,endpoint,'POST',{});
  assert.equal((await req(owner.cookie,'personal/data/task')).body.records.find(t=>t.id===imported.id).title,'Remote conflict');
  assert.ok(db.prepare('SELECT overwritten FROM calendar_sync_history').all().some(row=>row.overwritten.includes('Local conflict')));
  // A Theory deletion retains the remote copy until the user confirms.
  const third=(await req(owner.cookie,'personal/data/task','POST',{id:'delete-local',title:'Remove deliberately',due:'2026-12-05',done:false})).body.record;
  await req(owner.cookie,endpoint,'POST',{});const thirdLink=db.prepare("SELECT l.* FROM calendar_sync_links l JOIN workspace_records r ON r.record_key=l.record_key WHERE r.external_id='delete-local'").get();
  await req(owner.cookie,'personal/data/task/delete-local','DELETE',{version:third.version});await req(owner.cookie,endpoint,'POST',{});assert.ok(events.has(thirdLink.external_id));
  assert.equal((await req(owner.cookie,endpoint+'/'+thirdLink.id,'POST',{action:'delete-both',confirm:true})).status,200);assert.ok(!events.has(thirdLink.external_id));
  // Permission loss never writes the linked company record or publishes subsequent private changes.
  const org=user.company_id,companyTask=(await req(owner.cookie,'organisations/'+org+'/data/task','POST',{id:'company-task',title:'Company item',due:'2026-12-07',done:false})).body.record;
  assert.ok(companyTask);await req(owner.cookie,endpoint,'POST',{});const companyLink=db.prepare("SELECT l.* FROM calendar_sync_links l JOIN workspace_records r ON r.record_key=l.record_key WHERE r.external_id='company-task'").get();assert.ok(companyLink);
  db.prepare("UPDATE memberships SET role='viewer' WHERE user_id=? AND company_id=?").run(user.id,org);
  const companyRemote=events.get(companyLink.external_id);events.set(companyLink.external_id,stamp(companyLink.external_id,{...companyRemote,...(google?{summary:'Forbidden edit'}:{subject:'Forbidden edit'})}));await req(owner.cookie,endpoint,'POST',{});
  assert.equal(JSON.parse(db.prepare('SELECT data FROM workspace_records WHERE record_key=?').get(companyLink.record_key).data).title,'Company item');
  assert.match(db.prepare('SELECT error FROM calendar_sync_links WHERE id=?').get(companyLink.id).error,/access changed/);
  if(google)events.set(externalId,{id:externalId,status:'cancelled'});else events.delete(externalId);await req(owner.cookie,endpoint,'POST',{});
  let links=(await req(owner.cookie,endpoint)).body.items;const pending=links.find(i=>i.pending==='remote-deleted');assert.ok(pending);assert.equal((await req(owner.cookie,'personal/data/task')).body.records.length,2);
  assert.equal((await req(owner.cookie,endpoint+'/'+pending.id,'POST',{action:'delete-both',confirm:true,version:0})).status,409);
  assert.equal((await req(owner.cookie,endpoint+'/'+pending.id,'POST',{action:'delete-both',confirm:true,version:pending.version})).status,200);
  assert.equal((await req(owner.cookie,'personal/data/task')).body.records.length,1);
  const nativeEvent=(await req(owner.cookie,'personal/data/event','POST',{id:'native-series',calendarEvent:true,title:'Weekly review',start:'2026-12-01',end:'2026-12-01',allDay:true,timeZone:'Europe/London',notes:'Series notes',unitIds:[],recurrence:{mode:'weekly',interval:1,unit:'weeks',days:[2],count:3}})).body.record;
  assert.ok(nativeEvent);await req(owner.cookie,endpoint,'POST',{});
  const seriesLink=db.prepare("SELECT l.* FROM calendar_sync_links l JOIN workspace_records r ON r.record_key=l.record_key WHERE r.external_id='native-series'").get(),series=events.get(seriesLink.external_id);assert.ok(series,seriesLink.error);assert.ok(series.recurrence);
  events.set(series.id,stamp(series.id,{...series,recurrence:google?['RRULE:FREQ=WEEKLY;INTERVAL=1;WKST=MO;BYDAY=TU;COUNT=5']:{...series.recurrence,range:{...series.recurrence.range,numberOfOccurrences:5}}}));
  await req(owner.cookie,endpoint,'POST',{});assert.equal((await req(owner.cookie,'personal/data/event/native-series')).body.record.recurrence.count,5);
  let edited=(await req(owner.cookie,'personal/data/event/native-series')).body.record;
  edited=(await req(owner.cookie,'personal/data/event/native-series','PUT',{...edited,exceptions:{'2026-12-08':{title:'One review only'}}})).body.record;
  await req(owner.cookie,endpoint,'POST',{});let instance=[...events.values()].find(e=>(e.recurringEventId||e.seriesMasterId)===series.id);assert.ok(instance);assert.equal(google?instance.summary:instance.subject,'One review only');assert.equal(google?events.get(series.id).summary:events.get(series.id).subject,'Weekly review');
  instance=stamp(instance.id,{...instance,...(google?{summary:'External occurrence'}:{subject:'External occurrence'})});events.set(instance.id,instance);await req(owner.cookie,endpoint,'POST',{});
  edited=(await req(owner.cookie,'personal/data/event/native-series')).body.record;assert.equal(edited.exceptions['2026-12-08'].title,'External occurrence');
  edited=(await req(owner.cookie,'personal/data/event/native-series','PUT',{...edited,exceptions:{...edited.exceptions,'2026-12-08':{cancelled:true}}})).body.record;await req(owner.cookie,endpoint,'POST',{});
  const occurrence=(await req(owner.cookie,endpoint)).body.items.find(i=>i.occurrence);assert.ok(occurrence);assert.ok(events.has(instance.id));
  assert.equal((await req(owner.cookie,endpoint+'/'+occurrence.id,'POST',{action:'delete-both',confirm:true,version:occurrence.version})).status,200);assert.ok(!events.has(instance.id));assert.ok(events.has(series.id));

  // A task's remaining series advances while completed work remains a separate ticked event.
  const routine=(await req(owner.cookie,'personal/data/task','POST',{id:'routine',title:'Daily routine',due:'2026-12-01',done:false,recurrence:{mode:'daily',interval:1,unit:'days',days:[],count:3}})).body.record;
  await req(owner.cookie,endpoint,'POST',{});
  const routineLink=db.prepare("SELECT l.* FROM calendar_sync_links l JOIN workspace_records r ON r.record_key=l.record_key WHERE r.external_id='routine'").get();assert.equal(routineLink.error,'');assert.ok(events.get(routineLink.external_id).recurrence);
  const completion=await req(owner.cookie,'personal/data/task/routine/actions','POST',{version:routine.version,action:'complete'});assert.equal(completion.status,200,JSON.stringify(completion.body));
  await req(owner.cookie,endpoint,'POST',{});const active=events.get(routineLink.external_id);assert.equal(google?active.start.date:active.start.dateTime.slice(0,10),'2026-12-02');assert.equal(google?active.recurrence[0].includes('COUNT=2'):active.recurrence.range.numberOfOccurrences===2,true);
  const historyTask=completion.body.records.find(t=>t.occurrenceOf==='routine');assert.ok(historyTask);const historyLink=db.prepare('SELECT l.* FROM calendar_sync_links l JOIN workspace_records r ON r.record_key=l.record_key WHERE r.external_id=?').get(historyTask.id);assert.equal(historyLink.error,'');assert.equal(google?events.get(historyLink.external_id).summary:events.get(historyLink.external_id).subject,'✓ Daily routine');
  const oldHistory=events.get(historyLink.external_id);events.set(oldHistory.id,stamp(oldHistory.id,{...oldHistory,...(google?{summary:'Rewrite history'}:{subject:'Rewrite history'})}));await req(owner.cookie,endpoint,'POST',{});
  assert.equal((await req(owner.cookie,'personal/data/task/'+historyTask.id)).body.record.title,'Daily routine');assert.equal(google?events.get(oldHistory.id).summary:events.get(oldHistory.id).subject,'✓ Daily routine');
  const incomingRule=providerPayload(provider,localSyncItem({kind:'task'},{title:'External routine',due:'2026-12-10',done:false,recurrence:{mode:'daily',interval:2,unit:'days',days:[],count:4}}));events.set('incoming-series',stamp('incoming-series',incomingRule));await req(owner.cookie,endpoint,'POST',{});
  const incomingTask=(await req(owner.cookie,'personal/data/task')).body.records.find(t=>t.title==='External routine');assert.ok(incomingTask);assert.equal(incomingTask.plannerAllocated,false);assert.equal(incomingTask.recurrence.count,4);assert.equal(incomingTask.recurrence.interval,2);

  let occurrenceTask=(await req(owner.cookie,'personal/data/task','POST',{id:'task-exceptions',title:'Weekly task',due:'2026-12-01',done:false,recurrence:{mode:'weekly',interval:1,unit:'weeks',days:[2],count:3},recurrenceOverrides:{'2026-12-08':{title:'Only this task',start:'2026-12-08',due:'2026-12-08'}}})).body.record;
  assert.ok(occurrenceTask);await req(owner.cookie,endpoint,'POST',{});
  const taskSeriesLink=db.prepare("SELECT l.* FROM calendar_sync_links l JOIN workspace_records r ON r.record_key=l.record_key WHERE r.external_id='task-exceptions'").get();assert.equal(taskSeriesLink.error,'');
  let taskInstance=[...events.values()].find(e=>(e.recurringEventId||e.seriesMasterId)===taskSeriesLink.external_id);assert.ok(taskInstance);assert.equal(google?taskInstance.summary:taskInstance.subject,'Only this task');
  taskInstance=stamp(taskInstance.id,{...taskInstance,...(google?{summary:'Moved future task',start:{date:'2026-12-09'},end:{date:'2026-12-10'}}:{subject:'Moved future task',start:{dateTime:'2026-12-09T00:00:00'},end:{dateTime:'2026-12-10T00:00:00'}})});events.set(taskInstance.id,taskInstance);await req(owner.cookie,endpoint,'POST',{});
  occurrenceTask=(await req(owner.cookie,'personal/data/task/task-exceptions')).body.record;assert.equal(occurrenceTask.title,'Weekly task');assert.equal(occurrenceTask.recurrenceOverrides['2026-12-08'].due,'2026-12-09');
  const occurrenceAdvance=await req(owner.cookie,'personal/data/task/task-exceptions/actions','POST',{version:occurrenceTask.version,action:'complete'});assert.equal(occurrenceAdvance.status,200,JSON.stringify(occurrenceAdvance.body));
  const moved=occurrenceAdvance.body.records.find(t=>t.id==='task-exceptions');assert.equal(moved.due,'2026-12-09');assert.equal(moved.title,'Moved future task');assert.equal(moved.scheduledDue,'2026-12-08');
  await req(owner.cookie,endpoint,'POST',{});assert.equal(db.prepare('SELECT error FROM calendar_sync_links WHERE id=?').get(taskSeriesLink.id).error,'');
  const finalAdvance=await req(owner.cookie,'personal/data/task/task-exceptions/actions','POST',{version:moved.version,action:'complete'});assert.equal(finalAdvance.status,200,JSON.stringify(finalAdvance.body));const normal=finalAdvance.body.records.find(t=>t.id==='task-exceptions');assert.equal(normal.due,'2026-12-15');assert.equal(normal.title,'Weekly task');

  const cancellable=(await req(owner.cookie,'personal/data/task','POST',{id:'cancel-occurrence',title:'Cancel one',due:'2026-12-08',done:false,recurrence:{mode:'weekly',interval:1,unit:'weeks',days:[2],count:2}})).body.record;assert.ok(cancellable);await req(owner.cookie,endpoint,'POST',{});
  const cancelLink=db.prepare("SELECT l.* FROM calendar_sync_links l JOIN workspace_records r ON r.record_key=l.record_key WHERE r.external_id='cancel-occurrence'").get();
  const cancelledInstance=stamp('cancel-instance',google?{recurringEventId:cancelLink.external_id,originalStartTime:{date:'2026-12-08'},status:'cancelled'}:{seriesMasterId:cancelLink.external_id,originalStart:'2026-12-08T00:00:00Z',isCancelled:true});events.set(cancelledInstance.id,cancelledInstance);
  await req(owner.cookie,endpoint,'POST',{});const pendingOccurrence=(await req(owner.cookie,endpoint)).body.items.find(i=>i.id===cancelLink.id+'~2026-12-08');assert.equal(pendingOccurrence?.pending,'remote-deleted');
  const confirmed=await req(owner.cookie,endpoint+'/'+pendingOccurrence.id,'POST',{action:'delete-both',confirm:true,version:pendingOccurrence.version});assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));
  const afterCancel=(await req(owner.cookie,'personal/data/task/cancel-occurrence')).body.record;assert.equal(afterCancel.due,'2026-12-15');
  await req(owner.cookie,endpoint,'POST',{});assert.equal(db.prepare('SELECT error FROM calendar_sync_links WHERE id=?').get(cancelLink.id).error,'');
  const skipped=(await req(owner.cookie,'personal/data/task')).body.records.find(t=>t.occurrenceOf==='cancel-occurrence');assert.equal(skipped.skipped,true);assert.equal(db.prepare('SELECT l.id FROM calendar_sync_links l JOIN workspace_records r ON r.record_key=l.record_key WHERE r.external_id=?').get(skipped.id),undefined);
  const taskCount=(await req(owner.cookie,'personal/data/task')).body.records.length;
  await req(owner.cookie,'calendar/connections/account','DELETE');assert.equal((await req(owner.cookie,'personal/data/task')).body.records.length,taskCount);assert.equal(db.prepare('SELECT count(*) n FROM calendar_sync_links').get().n,0);
 }finally{await new Promise(resolve=>server.close(resolve));api.close();db.close();rmSync(dir,{recursive:true,force:true})}
});

test('task series retain remaining counts, month-end anchors and immutable completed dates',()=>{
 const task={id:'monthly',title:'Month end',due:'2028-01-31',done:false,recurrence:{mode:'monthly',interval:1,unit:'months',days:[],count:3}};
 const advanced=completeTask([task],task.id,'2028-01-31T12:00:00Z');
 for(const provider of ['microsoft','google']){
  const item=localSyncItem({kind:'task'},advanced[0]);assert.equal(item.recurrence.count,2);assert.equal(item.recurrence.monthDay,31);
  const payload=providerPayload(provider,item);const restored=importRecurrence(provider,payload.recurrence,'2028-02-29');
  assert.deepEqual(eventOccurrences({start:'2028-02-29',end:'2028-02-29',allDay:true,recurrence:restored},'2028-01-01','2028-12-31').map(e=>e.start),['2028-02-29','2028-03-31']);
 }
 assert.equal(localSyncItem({kind:'task'},advanced[1]).start,'2028-01-31');assert.equal(localSyncItem({kind:'task'},advanced[1]).recurrence,null);
 assert.equal(localSyncItem({kind:'task'},{...task,seriesDefaults:{title:'Normal'}}).title,'Normal');
 assert.throws(()=>localSyncItem({kind:'task'},{...task,start:'2028-01-30'}),/Multi-day/);
 assert.equal(localSyncItem({kind:'task'},{...task,recurrence:{...task.recurrence,basis:'completion'}}).recurrence,null);
});
