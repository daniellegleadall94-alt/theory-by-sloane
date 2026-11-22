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
 assert.throws(()=>applyExternalItem('task',{title:'Keep me'},{recurrence:{mode:'weekly'}}),/original task has been retained/);
 assert.throws(()=>importRecurrence('google',['RRULE:FREQ=MONTHLY;BYMONTHDAY=31'],'2026-01-31'),/without changing/);
});

test('calendar sync retains all-day boundaries, London summer times, descriptions and completion markers',()=>{
 const row={kind:'task',updated_at:'2026-07-01T12:00:00Z'},task={title:'Launch',due:'2026-07-01',done:true,description:'Details'};
 const item=localSyncItem(row,task);assert.equal(item.title,'✓ Launch');assert.equal(item.end,'2026-07-02');
 const timed=localSyncItem(row,{...task,calendarTime:{start:'09:00',end:'10:00',timeZone:'Europe/London'}});assert.equal(timed.start,'2026-07-01T08:00:00.000Z');
 const remote=externalSyncItem('google',{...providerPayload('google',timed),id:'one',organizer:{self:true}});
 const restored=applyExternalItem('task',task,remote);assert.equal(restored.calendarTime.start,'09:00');assert.equal(restored.description,'Details');assert.equal(restored.title,'Launch');
 assert.throws(()=>localSyncItem(row,{...task,recurrence:{mode:'daily'}}),/series/);
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
  const e=events.get(id);if(!e)return Response.json({error:'missing'},{status:404});
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
  await req(owner.cookie,'calendar/connections/account','DELETE');assert.equal((await req(owner.cookie,'personal/data/task')).body.records.length,1);assert.equal(db.prepare('SELECT count(*) n FROM calendar_sync_links').get().n,0);
 }finally{await new Promise(resolve=>server.close(resolve));api.close();db.close();rmSync(dir,{recursive:true,force:true})}
});
