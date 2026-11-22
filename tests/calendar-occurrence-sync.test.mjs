import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createOccurrenceSync} from '../server/calendar-occurrence-sync.mjs';
import {localOccurrence,occurrenceDate} from '../server/calendar-occurrence-model.mjs';
import {localSyncItem,providerPayload} from '../server/calendar-sync-model.mjs';
for(const provider of ['microsoft','google'])test(provider+' occurrence updates retain the master, conflicts and confirmed single deletion',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE workspace_records(record_key TEXT PRIMARY KEY,kind TEXT,external_id TEXT,data TEXT,version INTEGER,updated_at TEXT,organisation_id TEXT);CREATE TABLE calendar_sync_links(id TEXT PRIMARY KEY,account_id TEXT,record_key TEXT);CREATE TABLE calendar_sync_remote_cache(account_id TEXT,data TEXT)');
 const data={id:'series',title:'Weekly review',start:'2026-12-01T09:00',end:'2026-12-01T10:00',allDay:false,timeZone:'Europe/London',unitIds:[],recurrence:{mode:'weekly',unit:'weeks',interval:1,days:[2],count:4}};
 db.prepare('INSERT INTO workspace_records VALUES(?,?,?,?,?,?,NULL)').run('r','event','series',JSON.stringify(data),1,'2026-11-01T00:00:00Z');
 db.prepare('INSERT INTO calendar_sync_links VALUES(?,?,?)').run('link','account','r');
 const row=()=>db.prepare('SELECT * FROM workspace_records').get(),read=()=>JSON.parse(row().data);let allowed=true,updates=0,deletes=0,changed=[];const logs=[];
 const w={result:r=>JSON.parse(r.data),canWrite:()=>allowed,canRead:()=>allowed,assertWritable:()=>{},transaction:fn=>fn(),save:(user,org,kind,id,next,prior)=>{db.prepare('UPDATE workspace_records SET data=?,version=version+1,updated_at=?').run(JSON.stringify(next),'2026-11-02T00:00:00Z');return row()}};
 const account={id:'account',user_id:'u',provider},link={id:'link',record_key:'r',external_id:'master'},settings={calendar_id:'calendar'};
 const itemFor=(a,r)=>localSyncItem(r,JSON.parse(r.data));
 const sync=createOccurrenceSync(db,w,{itemFor,history:(...args)=>logs.push(args),alive:()=>{},now:()=>new Date().toISOString()});
 const raw=(item,date,revision='v1')=>({...providerPayload(provider,item),id:'instance-'+date,...(provider==='google'?{etag:revision,organizer:{self:true},updated:'2026-11-03T00:00:00Z',recurringEventId:'master',originalStartTime:{dateTime:date+'T09:00:00Z'}}:{'@odata.etag':revision,isOrganizer:true,lastModifiedDateTime:'2026-11-03T00:00:00Z',seriesMasterId:'master',originalStart:date+'T09:00:00Z'})});
 const date='2026-12-08',master={id:'master'},base=localOccurrence(row(),data,date);let external=raw(base,date);
 const remote={exceptions:async()=>changed,instance:async()=>external,get:async(c,id)=>id==='master'?master:external,updateInstance:async(c,id,item,version)=>{assert.equal(version,provider==='google'?external.etag:external['@odata.etag']);updates++;external=raw(item,date,'v'+(updates+1));changed=[{date,event:external}];return external},remove:async()=>{deletes++;external={id:external.id,status:'cancelled',isCancelled:true};changed=[{date,event:external}]}};
 try{
  w.save('u',null,'event','series',{...read(),exceptions:{[date]:{title:'Only this review'}}},row());await sync.sync(account,settings,remote,link,master,[]);assert.equal(updates,1);assert.equal(read().title,'Weekly review');
  await sync.sync(account,settings,remote,link,master,[]);assert.equal(updates,1);
  external=raw({...localOccurrence(row(),read(),date),title:'Changed externally',start:'2026-12-08T11:00:00.000Z',end:'2026-12-08T12:00:00.000Z',localStart:'2026-12-08T11:00',localEnd:'2026-12-08T12:00'},date,'v3');changed=[{date,event:external}];
  await sync.sync(account,settings,remote,link,master,[]);assert.equal(read().exceptions[date].title,'Changed externally');assert.equal(read().exceptions[date].start,'2026-12-08T11:00');assert.equal(read().start,data.start);
  w.save('u',null,'event','series',{...read(),exceptions:{[date]:{...read().exceptions[date],title:'Simultaneous local'}}},row());external=raw({...localOccurrence(row(),read(),date),title:'Newer remote'},date,'v4');changed=[{date,event:external}];await sync.sync(account,settings,remote,link,master,[]);assert.equal(read().exceptions[date].title,'Newer remote');assert.ok(logs.some(entry=>entry[2].includes('provider version kept')));
  const live=external;external={...external,status:'cancelled',isCancelled:true};changed=[{date,event:external}];await sync.sync(account,settings,remote,link,master,[]);assert.equal(read().exceptions[date].cancelled,undefined);assert.equal(sync.items('account','u')[0].pending,'remote-deleted');
  // A restoration made before confirmation must prevent deletion in Theory.
  external=live;changed=[{date,event:external}];await assert.rejects(sync.confirm(account,settings,remote,link,date,{action:'delete-both',confirm:true,version:row().version}),/no longer/);
  external={...live,status:'cancelled',isCancelled:true};changed=[{date,event:external}];await sync.confirm(account,settings,remote,link,date,{action:'delete-both',confirm:true,version:row().version});assert.equal(read().exceptions[date].cancelled,true);assert.equal(deletes,0);
  // Restore the disposable fixture for the opposite deletion direction.
  external=live;changed=[{date,event:external}];w.save('u',null,'event','series',{...read(),exceptions:{[date]:{title:'Restored locally'}}},row());await sync.sync(account,settings,remote,link,master,[]);
  w.save('u',null,'event','series',{...read(),exceptions:{[date]:{cancelled:true}}},row());await sync.sync(account,settings,remote,link,master,[]);assert.equal(deletes,0);assert.equal(sync.items('account','u')[0].occurrence,true);
  await assert.rejects(sync.confirm(account,settings,remote,link,date,{action:'delete-both',confirm:true,version:0}),/changed/);
  await sync.confirm(account,settings,remote,link,date,{action:'delete-both',confirm:true,version:row().version});assert.equal(deletes,1);assert.equal(read().exceptions[date].cancelled,true);assert.equal(read().recurrence.count,4);
  allowed=false;assert.deepEqual(sync.items('account','u'),[]);await assert.rejects(sync.sync(account,settings,remote,link,master,[]),/Access/);
 }finally{db.close()}
});
test('occurrence identity uses the original time in the series zone, never the moved date',()=>{
 assert.equal(occurrenceDate('google',{originalStartTime:{dateTime:'2026-07-01T23:30:00Z'},start:{dateTime:'2026-07-05T12:00:00Z'}},{timeZone:'Europe/London'}),'2026-07-02');
 assert.equal(occurrenceDate('microsoft',{originalStart:'2026-07-01T23:30:00Z'},{timeZone:'Europe/London'}),'2026-07-02');
 assert.throws(()=>occurrenceDate('google',{start:{date:'2026-07-01'}},{}),/original occurrence/);
});
