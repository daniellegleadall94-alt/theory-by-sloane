import {randomUUID} from 'node:crypto';
import {defaultCapacity,dependencyWarnings} from '../src/workManagement.ts';
import {validTaskDate} from '../src/work.ts';

export function createWorkManagementLayer(db,workspace){
 const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
 db.exec(`CREATE TABLE IF NOT EXISTS work_capacity(scope TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),settings TEXT NOT NULL,PRIMARY KEY(scope,user_id));
 CREATE TABLE IF NOT EXISTS work_bulk_undo(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),changes TEXT NOT NULL,expires_at TEXT NOT NULL);`);
 const scope=(user,org)=>org?'org:'+org:'user:'+user;
 const requireOrg=(user,org)=>{if(org&&!workspace.member(user,org))fail(403,'Choose an authorised organisation.');};
 const checkRows=(user,items)=>{
  if(!Array.isArray(items)||!items.length||items.length>100)fail(400,'Select between 1 and 100 tasks.');
  const seen=new Set();return items.map(item=>{
   if(!item||typeof item.id!=='string'||!Number.isInteger(item.version)||item.organisationId!=null&&typeof item.organisationId!=='string')fail(400,'Select valid task records and versions.');const org=item.organisationId||null;requireOrg(user,org);if(org)workspace.assertWritable(org);
   const row=one("SELECT * FROM workspace_records WHERE scope=? AND kind='task' AND external_id=?",scope(user,org),item.id);
   if(!row||!workspace.canWrite(user,row))fail(403,'You cannot edit every selected task.');
   if(row.version!==item.version)fail(409,'A selected task changed. Refresh and preview again.');
   if(seen.has(row.record_key))fail(400,'Select each task once.');seen.add(row.record_key);
   if(JSON.parse(row.data).occurrenceOf)fail(400,'Completion history cannot be bulk edited.');return row;
  });
 };
 async function handle({req,path,user,send,bodyOf}){
  if(!path.startsWith('/api/work-management/'))return false;
  if(path==='/api/work-management/capacity'){
   const org=new URL(req.url,'http://localhost').searchParams.get('organisationId')||null;requireOrg(user.id,org);
   if(req.method==='GET'){
    const manager=org&&['owner','admin','manager'].includes(workspace.member(user.id,org)?.role);
    const people=manager?all('SELECT users.id,users.name FROM memberships JOIN users ON users.id=memberships.user_id WHERE company_id=?',org):[{id:user.id,name:user.name}];
    return send(200,{people:people.map(person=>{const stored=one('SELECT settings FROM work_capacity WHERE scope=? AND user_id=?',scope(user.id,org),person.id);return {...person,configured:!!stored,capacity:stored?JSON.parse(stored.settings):defaultCapacity}}),team:!!manager});
   }
   if(req.method==='PUT'){
    if(org)workspace.assertWritable(org);const body=await bodyOf(req),id=body.userId||user.id,c=body.capacity;
    if(id!==user.id&&(!org||!['owner','admin','manager'].includes(workspace.member(user.id,org)?.role)||!workspace.member(id,org)))fail(403,'You cannot change this person’s capacity.');
    if(!c||!Number.isFinite(c.weeklyHours)||c.weeklyHours<0||c.weeklyHours>168||!Array.isArray(c.workingDays)||c.workingDays.length>7||new Set(c.workingDays).size!==c.workingDays.length||c.workingDays.some(d=>!Number.isInteger(d)||d<0||d>6)||!Array.isArray(c.daysOff)||c.daysOff.length>730||c.daysOff.some(d=>!validTaskDate(d))||c.weeklyHours>c.workingDays.length*24)fail(400,'Check weekly hours, working days and days off.');
    run('INSERT INTO work_capacity VALUES(?,?,?) ON CONFLICT(scope,user_id) DO UPDATE SET settings=excluded.settings',scope(user.id,org),id,JSON.stringify({weeklyHours:c.weeklyHours,workingDays:c.workingDays,daysOff:[...new Set(c.daysOff)]}));return send(200,{ok:true});
   }
  }
  if(path==='/api/work-management/bulk'&&req.method==='POST'){
   const body=await bodyOf(req);if(!['preview','apply'].includes(body.mode))fail(400,'Preview or apply the change.');
   const patch=body.patch;if(!patch||!Object.keys(patch).length||Object.keys(patch).some(k=>!['plannedDate','priority','archived'].includes(k)))fail(400,'Choose a supported bulk change.');
   if(patch.plannedDate!==undefined&&patch.plannedDate!==''&&!validTaskDate(patch.plannedDate)||patch.priority!==undefined&&!['Low','Medium','High'].includes(patch.priority)||patch.archived!==undefined&&typeof patch.archived!=='boolean')fail(400,'Check the bulk change.');
   const result=workspace.transaction(()=>{
    const rows=checkRows(user.id,body.items);
    if(body.mode==='preview')return {preview:rows.map(row=>{const t=workspace.result(row);return {id:t.id,title:t.title,organisationId:t.organisationId,before:Object.fromEntries(Object.keys(patch).map(k=>[k,t[k]??null])),after:patch,warnings:[...dependencyWarnings({...t,...patch},workspace.permittedRows(user.id,row.organisation_id,'task').map(workspace.result)),...(patch.archived&&all("SELECT data FROM workspace_records WHERE scope=? AND kind='task'",row.scope).some(r=>JSON.parse(r.data).dependencyIds?.includes(t.id))?['Other tasks depend on this task. Archiving keeps those links; restore it to finish its work.']:[])]}})};
    const changes=rows.map(row=>{const old=workspace.result(row),saved=workspace.save(user.id,row.organisation_id,'task',row.external_id,{...old,...patch},row);return {key:row.record_key,version:saved.version,before:Object.fromEntries(Object.keys(patch).map(k=>[k,old[k]??null]))}});
    const undoId=randomUUID();run('DELETE FROM work_bulk_undo WHERE expires_at<?',new Date().toISOString());run('INSERT INTO work_bulk_undo VALUES(?,?,?,?)',undoId,user.id,JSON.stringify(changes),new Date(Date.now()+15*60000).toISOString());return {updated:changes.length,undoId};
   });return send(200,result);
  }
  if(path==='/api/work-management/undo'&&req.method==='POST'){
   const body=await bodyOf(req);
   workspace.transaction(()=>{
    const undo=one('SELECT * FROM work_bulk_undo WHERE id=? AND user_id=?',body.undoId,user.id);if(!undo||undo.expires_at<new Date().toISOString())fail(409,'This undo has expired.');
    const changes=JSON.parse(undo.changes),rows=changes.map(change=>one('SELECT * FROM workspace_records WHERE record_key=?',change.key));
    if(rows.some((row,i)=>!row||row.version!==changes[i].version))fail(409,'A task changed after this bulk edit. Undo would overwrite newer work.');
    for(const row of rows){if(!workspace.canWrite(user.id,row))fail(403,'You no longer have permission to undo every change.');if(row.organisation_id)workspace.assertWritable(row.organisation_id)}
    rows.forEach((row,i)=>{const task=workspace.result(row);for(const [key,value] of Object.entries(changes[i].before)){if(value===null)delete task[key];else task[key]=value}workspace.save(user.id,row.organisation_id,'task',row.external_id,task,row)});
    run('DELETE FROM work_bulk_undo WHERE id=?',undo.id);
   });return send(200,{ok:true});
  }
  const activity=path.match(/^\/api\/work-management\/activity\/([^/]+)$/);
  if(activity&&req.method==='GET'){
   const org=new URL(req.url,'http://localhost').searchParams.get('organisationId')||null;requireOrg(user.id,org);
   const row=one("SELECT * FROM workspace_records WHERE scope=? AND kind='task' AND external_id=?",scope(user.id,org),decodeURIComponent(activity[1]));if(!row||!workspace.canRead(user.id,row))fail(404,'Task not found.');
   return send(200,{activity:all('SELECT actor_name,action,fields,created_at FROM task_activity WHERE record_key=? ORDER BY created_at DESC,rowid DESC LIMIT 100',row.record_key).map(a=>({...a,fields:JSON.parse(a.fields)}))});
  }
  fail(404,'Work management endpoint not found.');
 }
 return {handle};
}
