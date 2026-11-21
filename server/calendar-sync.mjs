import {randomUUID} from 'node:crypto';
import {calendarSyncProvider} from './calendar-sync-provider.mjs';
import {localSyncItem,externalSyncItem,applyExternalItem,syncFingerprint,syncIdentity} from './calendar-sync-model.mjs';

const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export function createCalendarSync(db,workspace,{request,origin,now=()=>new Date().toISOString()}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS calendar_sync_settings(account_id TEXT PRIMARY KEY REFERENCES calendar_accounts(id) ON DELETE CASCADE,calendar_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,cursor TEXT,last_synced_at TEXT,error TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS calendar_sync_links(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES calendar_accounts(id) ON DELETE CASCADE,record_key TEXT NOT NULL,external_id TEXT,identity TEXT NOT NULL,local_version INTEGER NOT NULL DEFAULT 0,remote_revision TEXT,local_hash TEXT,remote_hash TEXT,snapshot TEXT NOT NULL,pending TEXT NOT NULL DEFAULT '',error TEXT NOT NULL DEFAULT '',last_synced_at TEXT,UNIQUE(account_id,record_key),UNIQUE(account_id,external_id));
 CREATE TABLE IF NOT EXISTS calendar_sync_history(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES calendar_accounts(id) ON DELETE CASCADE,record_key TEXT NOT NULL,action TEXT NOT NULL,overwritten TEXT NOT NULL,created_at TEXT NOT NULL);`);
 const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 const locks=new Map(),mutations=new Map();let stopped=false,timer;
 const alive=()=>{if(stopped)throw Error('Calendar synchronisation stopped.')};
 const owned=(user,id)=>{const account=one('SELECT * FROM calendar_accounts WHERE id=? AND user_id=?',id,user.id);if(!account)fail(404,'Calendar account not found.');return account};
 const available=account=>!one('SELECT suspended FROM user_restrictions WHERE user_id=?',account.user_id)?.suspended;
 const rowFor=key=>one('SELECT * FROM workspace_records WHERE record_key=?',key);
 const accessible=(account,row)=>row&&workspace.canWrite(account.user_id,row);
 const itemFor=(account,row)=>{
  const data=workspace.result(row),names=data.unitIds.map(id=>one('SELECT name FROM business_units WHERE id=?',id)?.name).filter(Boolean);
  return localSyncItem(row,data,{company:names.join(', ')||one('SELECT name FROM companies WHERE id=?',row.organisation_id)?.name||'',link:origin()+'/?calendarRecord='+encodeURIComponent(row.external_id)+'&calendarScope='+encodeURIComponent(row.organisation_id||'personal')+'&calendarKind='+row.kind});
 };
 const createLink=(account,row,externalId)=>{const id=randomUUID();run('INSERT INTO calendar_sync_links(id,account_id,record_key,external_id,identity,snapshot) VALUES(?,?,?,?,?,?)',id,account.id,row.record_key,externalId||null,syncIdentity(account.id,row.record_key),JSON.stringify(row));return one('SELECT * FROM calendar_sync_links WHERE id=?',id)};
 const remember=(link,row,item,remote)=>run("UPDATE calendar_sync_links SET external_id=?,local_version=?,remote_revision=?,local_hash=?,remote_hash=?,snapshot=?,pending='',error='',last_synced_at=? WHERE id=?",remote.id,row.version,remote.revision||null,syncFingerprint(item),syncFingerprint(remote),JSON.stringify(row),now(),link.id);
 const history=(account,row,action,overwritten)=>{
  run('INSERT INTO calendar_sync_history VALUES(?,?,?,?,?,?)',randomUUID(),account.id,row.record_key,action,JSON.stringify(overwritten),now());
  if(row.kind==='task')run('INSERT INTO task_activity VALUES(?,?,?,?,?,?,?)',randomUUID(),row.record_key,account.user_id,'Calendar sync',action,JSON.stringify(['title','dates','description']),now());
 };
 const saveRemote=(account,row,item)=>{
  if(!accessible(account,row))fail(403,'You no longer have permission to edit this Theory item.');if(row.organisation_id)workspace.assertWritable(row.organisation_id);
  const data=workspace.result(row),next=applyExternalItem(row.kind,data,item,data.calendarTime?.timeZone||data.timeZone||'Europe/London');
  return workspace.transaction(()=>workspace.save(account.user_id,row.organisation_id,row.kind,row.external_id,next,row,{preserveComments:true}));
 };
 async function reconcile(account,settings,provider,link,remoteRaw){
  if(link.pending==='unlinked')return;
  let row=rowFor(link.record_key);const previous=JSON.parse(link.snapshot);
  if(!accessible(account,row||previous)){run("UPDATE calendar_sync_links SET error='Theory access changed. Synchronisation is paused for this item.' WHERE id=?",link.id);return}
  if(!row){run("UPDATE calendar_sync_links SET pending='local-deleted',remote_revision=?,error='' WHERE id=?",remoteRaw?.etag||remoteRaw?.['@odata.etag']||null,link.id);return}
  if(row.organisation_id)workspace.assertWritable(row.organisation_id);
  let local=itemFor(account,row),remote=remoteRaw?externalSyncItem(account.provider,remoteRaw):null;
  if(link.external_id&&(!remote||remote.deleted)){run("UPDATE calendar_sync_links SET pending='remote-deleted',error='' WHERE id=?",link.id);return}
  if(link.pending)return;
  if(!remote){
   const version=row.version,created=await provider.create(settings.calendar_id,local,link.identity);alive();
   remote=externalSyncItem(account.provider,created);if(!remote.id)fail(502,'The provider did not return an event identifier.');
   // Record the exact sent version. An edit made during the request is picked up next pass.
   remember(link,{...row,version},local,remote);return;
  }
  if(remote.attendeeCount||!remote.isOrganiser){run("UPDATE calendar_sync_links SET error='This item has attendees or another organiser. Use the meeting editor to confirm updates.' WHERE id=?",link.id);return}
  const localChanged=syncFingerprint(local)!==link.local_hash,remoteChanged=syncFingerprint(remote)!==link.remote_hash;
  if(!localChanged&&!remoteChanged){remember(link,row,local,remote);return}
  if(localChanged&&remoteChanged&&link.local_version){
   const remoteAt=Date.parse(remote.updatedAt),localAt=Date.parse(row.updated_at);
   if(!Number.isFinite(remoteAt))fail(409,'Both copies changed and the provider supplied no edit time. Resolve this item before syncing.');
   if(remoteAt>localAt){history(account,row,'Calendar conflict: provider version kept',workspace.result(row));row=saveRemote(account,row,remote);local=itemFor(account,row);remember(link,row,local,remote);return}
   history(account,row,'Calendar conflict: Theory version kept',remote);
  }else if(remoteChanged&&link.local_version){row=saveRemote(account,row,remote);local=itemFor(account,row);remember(link,row,local,remote);return}
  const updated=await provider.update(settings.calendar_id,remote.id,local,remote.revision);alive();remember(link,row,local,externalSyncItem(account.provider,updated));
 }
 async function tickAccount(account){
  if(locks.has(account.id))return locks.get(account.id);
  const work=(async()=>{
   alive();const settings=one('SELECT * FROM calendar_sync_settings WHERE account_id=? AND enabled=1',account.id);if(!settings||!account.can_write||!available(account))return;
   const provider=calendarSyncProvider(account,request),listing=await provider.list(settings.calendar_id,settings.cursor);alive();
   const remote=new Map(listing.items.map(item=>[item.id,item])),links=all('SELECT * FROM calendar_sync_links WHERE account_id=?',account.id);
   const candidates=all("SELECT * FROM workspace_records WHERE kind IN ('task','event') AND (personal_user_id=? OR owner_id=? OR EXISTS(SELECT 1 FROM record_assignments WHERE record_key=workspace_records.record_key AND user_id=?))",account.user_id,account.user_id,account.user_id).filter(row=>{const data=JSON.parse(row.data);return accessible(account,row)&&!data.archived&&(row.kind==='task'?!!data.due:!!data.calendarEvent)});
   for(const row of candidates)if(!links.some(link=>link.record_key===row.record_key))links.push(createLink(account,row));
   for(const link of links){
    try{
     let event=link.external_id?remote.get(link.external_id):listing.items.find(event=>event.transactionId===link.identity||event.id===link.identity);
     if(link.external_id&&!event)event=await provider.get(settings.calendar_id,link.external_id);alive();
     if(event&&!link.external_id){run('UPDATE calendar_sync_links SET external_id=? WHERE id=?',event.id,link.id);link.external_id=event.id}
     await reconcile(account,settings,provider,link,event);alive();
    }catch(error){alive();run('UPDATE calendar_sync_links SET error=? WHERE id=?',String(error.message).slice(0,500),link.id)}
   }
   for(const event of listing.items){
    if(one('SELECT id FROM calendar_sync_links WHERE account_id=? AND external_id=?',account.id,event.id))continue;
    let item;try{item=externalSyncItem(account.provider,event)}catch{continue}
    if(item.deleted||item.attendeeCount||!item.isOrganiser)continue;
    workspace.transaction(()=>{
     const data=applyExternalItem('task',{title:item.title,due:'',done:false,status:'To do',priority:'Medium',campaign:'',discipline:'',channel:'',plannerAllocated:false,unitIds:[],assigneeIds:[account.user_id]},item);
     const row=workspace.save(account.user_id,null,'task',randomUUID(),data,null),link=createLink(account,row,item.id);remember(link,row,itemFor(account,row),item);
    });
   }
   run("UPDATE calendar_sync_settings SET cursor=?,last_synced_at=?,error='' WHERE account_id=?",listing.cursor||null,now(),account.id);
  })();locks.set(account.id,work);try{return await work}catch(error){if(!stopped)run('UPDATE calendar_sync_settings SET error=? WHERE account_id=?',String(error.message).slice(0,500),account.id);throw error}finally{locks.delete(account.id)}
 }
 const tick=async()=>{for(const account of all('SELECT a.* FROM calendar_accounts a JOIN calendar_sync_settings s ON s.account_id=a.id WHERE s.enabled=1')){if(stopped)return;if(mutations.has(account.id))continue;try{await tickAccount(account)}catch{}}};
 return {
  tick,
  start(){if(!timer){timer=setInterval(()=>{void tick()},60000);timer.unref()}},
  close(){stopped=true;clearInterval(timer)},
  async disconnect(id){if(mutations.has(id))await mutations.get(id).catch(()=>{});if(locks.has(id))await locks.get(id).catch(()=>{})},
  async handle(context){
   const match=context.path.match(/^\/api\/calendar\/connections\/([^/]+)\/theory-sync/);
   if(!match||context.req.method!=='POST')return this.handleUnlocked(context);
   const id=match[1];if(mutations.has(id))fail(409,'A calendar change is already running. Please wait.');
   const pending=this.handleUnlocked(context);mutations.set(id,pending);try{return await pending}finally{mutations.delete(id)}
  },
  async handleUnlocked({req,path,user,bodyOf,send}){
   const route=path.match(/^\/api\/calendar\/connections\/([^/]+)\/theory-sync(?:\/([^/]+))?$/);if(!route)return false;
   if(!user)fail(401,'Sign in to configure calendar sync.');const account=owned(user,route[1]),settings=one('SELECT * FROM calendar_sync_settings WHERE account_id=?',account.id);
   if(req.method==='GET')return send(200,{settings:settings||null,items:all('SELECT * FROM calendar_sync_links WHERE account_id=? ORDER BY last_synced_at DESC',account.id).filter(link=>workspace.canRead(user.id,rowFor(link.record_key)||JSON.parse(link.snapshot))).map(link=>({id:link.id,version:rowFor(link.record_key)?.version,title:JSON.parse(JSON.parse(link.snapshot).data).title,pending:link.pending,error:link.error,lastSyncedAt:link.last_synced_at}))});
   if(!available(account))fail(403,'This account cannot synchronise calendars.');
   if(req.method==='POST'&&route[2]){
    if(locks.has(account.id))await locks.get(account.id).catch(()=>{});const link=one('SELECT * FROM calendar_sync_links WHERE id=? AND account_id=?',route[2],account.id),body=await bodyOf(req);
    if(!link||!settings)fail(404,'Synced item not found.');const row=rowFor(link.record_key),previous=JSON.parse(link.snapshot);
    if(!accessible(account,row||previous))fail(403,'You no longer have permission to change this item.');
    if(!['local-deleted','remote-deleted'].includes(link.pending))fail(409,'Refresh this item before resolving its deletion.');
    if(body.action==='keep-theory'&&link.pending==='remote-deleted'&&row){run("UPDATE calendar_sync_links SET external_id=NULL,identity=?,pending='',remote_revision=NULL,remote_hash=NULL,local_version=0 WHERE id=?",randomUUID().replaceAll('-',''),link.id);return send(200,{ok:true})}
    if(body.action==='keep-external'&&link.pending==='local-deleted'){run("UPDATE calendar_sync_links SET pending='unlinked',error='' WHERE id=?",link.id);return send(200,{ok:true})}
    if(body.action!=='delete-both'||body.confirm!==true)fail(400,'Confirm deletion from Theory and the connected calendar.');
    if(row&&body.version!==row.version)fail(409,'This Theory item changed. Refresh before confirming deletion.');
    if(row?.organisation_id)workspace.assertWritable(row.organisation_id);
    const provider=calendarSyncProvider(account,request),raw=link.external_id?await provider.get(settings.calendar_id,link.external_id):null;alive();
    if(raw){const item=externalSyncItem(account.provider,raw);if(!item.deleted){if(item.attendeeCount||!item.isOrganiser)fail(409,'Delete this meeting through its organiser workflow.');if(item.revision!==link.remote_revision)fail(409,'The external item changed. Sync now and review it before deleting.');await provider.remove(settings.calendar_id,item.id,item.revision);alive()}}
    const current=rowFor(link.record_key);if(current&&current.version!==row?.version)fail(409,'Theory changed while deleting the external copy. Review the remaining Theory item.');
    workspace.transaction(()=>{if(current)workspace.deleteRecord(user.id,current);run('DELETE FROM calendar_sync_links WHERE id=?',link.id)});return send(200,{ok:true});
   }
   if(req.method==='POST'&&!route[2]){
    const body=await bodyOf(req);if(!account.can_write)fail(403,'Enable calendar editing before turning on two-way sync.');
    if(settings){if(body.action==='pause'){if(locks.has(account.id))await locks.get(account.id).catch(()=>{});run('UPDATE calendar_sync_settings SET enabled=0 WHERE account_id=?',account.id);return send(200,{ok:true})}if(body.action==='resume')run('UPDATE calendar_sync_settings SET enabled=1 WHERE account_id=?',account.id);await tickAccount(account);return send(200,{ok:true})}
    if(!origin())fail(503,'Configure the Theory address before enabling calendar sync.');if(body.confirm!==true)fail(400,'Confirm which Theory work will be copied to this external account.');
    const provider=calendarSyncProvider(account,request);let calendar;
    if(body.calendarId){calendar=one('SELECT * FROM external_calendars WHERE id=? AND account_id=?',body.calendarId,account.id);if(!calendar)fail(404,'Choose a calendar from this account.');calendar={id:calendar.external_id}}
    else calendar=await provider.createCalendar();
    alive();if(!calendar?.id)fail(502,'The provider did not create a calendar.');run('INSERT INTO calendar_sync_settings(account_id,calendar_id) VALUES(?,?)',account.id,calendar.id);await tickAccount(account);return send(200,{ok:true});
   }
   return false;
  }
 };
}
