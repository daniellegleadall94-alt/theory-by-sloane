import {completeTask,taskSeriesDefaults} from '../src/work.ts';
import {addDays} from '../src/overview.ts';
import {applyExternalItem} from './calendar-sync-model.mjs';
import {localOccurrence,remoteOccurrence,occurrenceChange,taskOccurrenceData} from './calendar-occurrence-model.mjs';
import {syncFingerprint} from './calendar-sync-model.mjs';
const fingerprint=item=>item.deleted?'deleted':syncFingerprint(item);
export function createOccurrenceSync(db,workspace,{itemFor,history,alive,now}){
 db.exec(`CREATE TABLE IF NOT EXISTS calendar_sync_occurrences(link_id TEXT NOT NULL REFERENCES calendar_sync_links(id) ON DELETE CASCADE,day TEXT NOT NULL,external_id TEXT,local_hash TEXT,remote_hash TEXT,pending TEXT NOT NULL DEFAULT '',remote_revision TEXT,PRIMARY KEY(link_id,day));`);
 const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
 const current=(account,link)=>{const row=one('SELECT * FROM workspace_records WHERE record_key=?',link.record_key);if(!row||!workspace.canWrite(account.user_id,row))throw Error('Access to this series changed.');if(row.organisation_id)workspace.assertWritable(row.organisation_id);return row};
 const dataFor=row=>taskOccurrenceData(row,workspace.result(row));
 const save=(account,link,date,item)=>{
  const row=current(account,link),data=workspace.result(row);
  if(row.kind!=='task')return workspace.transaction(()=>workspace.save(account.user_id,row.organisation_id,'event',row.external_id,{...data,exceptions:{...data.exceptions,[date]:{...data.exceptions?.[date],...occurrenceChange(data,item)}}},row));
  const series=dataFor(row),duration=Math.round((Date.parse(series.end.slice(0,10))-Date.parse(series.start.slice(0,10)))/86400000),due=addDays(date,duration),currentDue=data.scheduledDue||data.due;
  if(due<currentDue)throw Error('Completed occurrences cannot be edited.');
  if(item.deleted&&due===currentDue){
   const at=now();return workspace.transaction(()=>{let saved;for(const task of completeTask([data],row.external_id,at)){const next=workspace.save(account.user_id,row.organisation_id,'task',task.id,task.done?{...task,skipped:true}:task,task.id===row.external_id?row:null);if(task.id===row.external_id)saved=next;}return saved;});
  }
  const changed=item.deleted?{cancelled:true}:applyExternalItem('task',{},item,series.timeZone),patch=item.deleted?changed:Object.fromEntries(['title','description','start','due','calendarTime','location'].map(key=>[key,changed[key]??(key==='calendarTime'?null:'')]));
  const next=due===currentDue?{...data,...patch,scheduledDue:currentDue,seriesDefaults:data.seriesDefaults||taskSeriesDefaults(data)}:{...data,recurrenceOverrides:{...data.recurrenceOverrides,[due]:patch}};
  return workspace.transaction(()=>workspace.save(account.user_id,row.organisation_id,'task',row.external_id,next,row));
 };
 const remember=(link,date,local,remote,pending='')=>run('INSERT INTO calendar_sync_occurrences VALUES(?,?,?,?,?,?,?) ON CONFLICT(link_id,day) DO UPDATE SET external_id=excluded.external_id,local_hash=excluded.local_hash,remote_hash=excluded.remote_hash,pending=excluded.pending,remote_revision=excluded.remote_revision',link.id,date,remote.id||null,fingerprint(local),fingerprint(remote),pending,remote.revision||null);
 return {
  async sync(account,settings,provider,link,master,known){
   let row=current(account,link);let data=dataFor(row);if(!data.recurrence||data.recurrence.mode==='none')return;
   const changes=await provider.exceptions(settings.calendar_id,master,known,data);alive();
   const remoteByDay=new Map(changes.map(x=>[x.date,x.event])),states=all('SELECT * FROM calendar_sync_occurrences WHERE link_id=?',link.id),dates=new Set([...Object.keys(data.exceptions||{}),...remoteByDay.keys(),...states.map(s=>s.day)]);
   if(dates.size>1000)throw Error('This series has too many occurrence changes.');
   for(const date of [...dates].sort()){
    if(row.kind==='task'&&date<data.start.slice(0,10)){run('DELETE FROM calendar_sync_occurrences WHERE link_id=? AND day=?',link.id,date);continue;}
    alive();row=current(account,link);data=dataFor(row);const metadata=itemFor(account,row).metadata;
    let local;try{local=localOccurrence(row,data,date)}catch(error){if(!data.exceptions?.[date]&&!remoteByDay.has(date)){run('DELETE FROM calendar_sync_occurrences WHERE link_id=? AND day=?',link.id,date);continue}throw error}if(!local.deleted)local.metadata=metadata;
    let raw=remoteByDay.get(date)||await provider.instance(settings.calendar_id,master.id,date,data);alive();
    let remote=remoteOccurrence(account.provider,raw);const prior=states.find(s=>s.day===date);
    if(current(account,link).version!==row.version)throw Error('This series changed while reading its occurrence. Sync again.');
    if(!remote.deleted&&(remote.attendeeCount||!remote.isOrganiser))throw Error('An occurrence has attendees or another organiser. Use the meeting editor.');
    if(local.deleted||remote.deleted){
     if(local.deleted&&remote.deleted){remember(link,date,local,remote);continue}
     remember(link,date,local,remote,local.deleted?'local-deleted':'remote-deleted');continue;
    }
    const baseline=localOccurrence(row,{...data,exceptions:{}},date);baseline.metadata=metadata;
    const localChanged=fingerprint(local)!==(prior?.local_hash||fingerprint(baseline));
    const remoteChanged=fingerprint(remote)!==(prior?.remote_hash||fingerprint(baseline));
    if(!localChanged&&!remoteChanged){remember(link,date,local,remote);continue}
    if(remoteChanged&&localChanged&&!Number.isFinite(Date.parse(remote.updatedAt)))throw Error('The provider supplied no occurrence edit time.');
    if(remoteChanged&&(!localChanged||Date.parse(remote.updatedAt)>Date.parse(row.updated_at))){
     if(localChanged)history(account,row,'Calendar occurrence conflict: provider version kept ('+date+')',local);
     row=save(account,link,date,remote);local=localOccurrence(row,dataFor(row),date);local.metadata=metadata;remember(link,date,local,remote);continue;
    }
    if(localChanged&&remoteChanged){if(!Number.isFinite(Date.parse(remote.updatedAt)))throw Error('The provider supplied no occurrence edit time.');history(account,row,'Calendar occurrence conflict: Theory version kept ('+date+')',remote)}
    raw=await provider.updateInstance(settings.calendar_id,remote.id,local,remote.revision);alive();remote=remoteOccurrence(account.provider,raw);remember(link,date,local,remote);
   }
  },
  items(accountId,userId){return all("SELECT o.*,l.record_key FROM calendar_sync_occurrences o JOIN calendar_sync_links l ON l.id=o.link_id WHERE l.account_id=? AND o.pending<>''",accountId).flatMap(o=>{const row=one('SELECT * FROM workspace_records WHERE record_key=?',o.record_key);return row&&workspace.canRead(userId,row)?[{id:o.link_id+'~'+o.day,title:workspace.result(row).title+' · '+o.day,pending:o.pending,occurrence:true,version:row.version,error:''}]:[]})},
  async confirm(account,settings,provider,link,date,body){
   const state=one('SELECT * FROM calendar_sync_occurrences WHERE link_id=? AND day=?',link.id,date),row=current(account,link);
   if(!state?.pending||body.action!=='delete-both'||body.confirm!==true)throw Error('Confirm removal of this occurrence from both calendars.');
   if(body.version!==row.version)throw Error('This series changed. Refresh before confirming.');
   if(state.pending==='local-deleted'){
    const raw=await provider.get(settings.calendar_id,state.external_id);alive();
    if(raw){const remote=remoteOccurrence(account.provider,raw);if(!remote.deleted){if(current(account,link).version!==row.version||remote.attendeeCount||!remote.isOrganiser||remote.revision!==state.remote_revision)throw Error('This occurrence changed. Sync and review it again.');await provider.remove(settings.calendar_id,remote.id,remote.revision);alive()}}
   }else{
    const master=await provider.get(settings.calendar_id,link.external_id);alive();if(!master)throw Error('The whole series was deleted. Sync and review it first.');
    const cached=all('SELECT data FROM calendar_sync_remote_cache WHERE account_id=?',account.id).map(r=>JSON.parse(r.data));
    const changes=await provider.exceptions(settings.calendar_id,master,cached,dataFor(row));alive();const removed=changes.find(x=>x.date===date);
    if(!removed||!remoteOccurrence(account.provider,removed.event).deleted)throw Error('This occurrence is no longer marked deleted. Sync and review it again.');
    if(account.provider==='google'){const latest=await provider.get(settings.calendar_id,removed.event.id);alive();if(latest&&!remoteOccurrence(account.provider,latest).deleted)throw Error('This occurrence has been restored. Sync before confirming.');}
   }
   if(current(account,link).version!==row.version)throw Error('The series changed during deletion. Sync and review the remaining occurrence.');
   save(account,link,date,{deleted:true});remember(link,date,{deleted:true},{deleted:true,id:state.external_id});
  }
 };
}
