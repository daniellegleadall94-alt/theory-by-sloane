import {Worker} from 'node:worker_threads';
import {randomUUID,createHash} from 'node:crypto';
import {validTaskDate} from '../src/work.ts';

export const importFields=['title','description','owner','status','priority','start','plannedDate','due','publicationDate','campaign','discipline','channel','effortHours'];
export function importDate(value,format){
 if(!value)return '';if(validTaskDate(value))return value;
 const match=value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
 if(match&&['DMY','MDY'].includes(format)){const result=`${match[3]}-${(format==='DMY'?match[2]:match[1]).padStart(2,'0')}-${(format==='DMY'?match[1]:match[2]).padStart(2,'0')}`;if(validTaskDate(result))return result;}
 throw Error('Use a valid date matching the selected format.');
}
const fingerprint=t=>JSON.stringify([t.title.trim().toLowerCase(),t.campaign||'',t.due||'',t.accountableOwnerId||t.assigneeIds?.[0]||'']);
export function createTaskImportLayer(db,workspace){
 const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args),fail=(status,message)=>{throw Object.assign(Error(message),{status})};
 db.exec('CREATE TABLE IF NOT EXISTS import_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,data TEXT NOT NULL,expires_at TEXT NOT NULL)');
 const parsing=new Set();
 const parse=upload=>new Promise((resolve,reject)=>{const worker=new Worker(new URL('./import-parser.mjs',import.meta.url),{workerData:upload,resourceLimits:{maxOldGenerationSizeMb:192}}),timer=setTimeout(()=>{void worker.terminate();reject(Error('Parsing timed out. Use a smaller file.'))},15000);worker.once('message',data=>{clearTimeout(timer);void worker.terminate();data.error?reject(Error(data.error)):resolve(data.result)});worker.once('error',e=>{clearTimeout(timer);reject(e)});worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('The workbook could not be processed within the size limit.'))})});
 const scope=(user,org)=>org?'org:'+org:'user:'+user;
 const snapshot=(user,org)=>createHash('sha256').update(JSON.stringify(all("SELECT record_key,version FROM workspace_records WHERE scope=? ORDER BY record_key",scope(user,org)))).digest('hex');
 const authorise=(user,org)=>{if(org){const m=workspace.member(user,org);if(!m||!['owner','admin','manager','member'].includes(m.role))fail(403,'Your role cannot import tasks here.');workspace.assertWritable(org)}};
 async function handle({req,path,user,bodyOf,send}){
  if(!path.startsWith('/api/imports/'))return false;
  run('DELETE FROM import_jobs WHERE expires_at<?',new Date().toISOString());
  if(path==='/api/imports/upload'&&req.method==='POST'){
   if(parsing.has(user.id)||parsing.size>=2)fail(429,'Please wait for the current spreadsheet to finish processing.');if(all('SELECT data FROM import_jobs WHERE user_id=?',user.id).filter(r=>!JSON.parse(r.data).completed).length>=5)fail(429,'Finish your recent imports or wait for their 30-minute expiry.');const body=await bodyOf(req,7*1024*1024);let sheets;parsing.add(user.id);try{sheets=await parse(body);if(JSON.stringify(sheets).length>8*1024*1024)throw Error('The extracted data is too large. Use a smaller sheet.')}catch(e){fail(400,e.message)}finally{parsing.delete(user.id)}if(!sheets.length)fail(400,'No rows were found.');const id=randomUUID();run('INSERT INTO import_jobs VALUES(?,?,?,?)',id,user.id,JSON.stringify({sheets}),new Date(Date.now()+30*60000).toISOString());return send(201,{id,sheets:sheets.map(s=>({name:s.name,headers:s.headers,rows:s.rows.slice(0,5),count:s.rows.length})),fields:importFields});
  }
  const discard=path.match(/^\/api\/imports\/([^/]+)$/);if(discard&&req.method==='DELETE'){const owned=one('SELECT id FROM import_jobs WHERE id=? AND user_id=?',discard[1],user.id);if(!owned)fail(404,'Import not found.');run('DELETE FROM import_jobs WHERE id=?',owned.id);return send(200,{ok:true})}
  const match=path.match(/^\/api\/imports\/([^/]+)\/(preview|apply)$/);if(!match||req.method!=='POST')fail(404,'Import endpoint not found.');
  const row=one('SELECT * FROM import_jobs WHERE id=? AND user_id=?',match[1],user.id);if(!row)fail(404,'Import expired or was not found.');const job=JSON.parse(row.data),body=await bodyOf(req);if(job.completed)fail(409,'This import has already finished.');
  if(match[2]==='preview'){
   const org=body.organisationId||null;if(org!==null&&typeof org!=='string')fail(400,'Choose a valid organisation.');authorise(user.id,org);const sheet=job.sheets[body.sheet||0];if(!sheet)fail(400,'Choose a worksheet.');
   if(!body.mapping||Object.keys(body.mapping).some(k=>!importFields.includes(k))||Object.values(body.mapping).some(i=>!Number.isInteger(i)||i<0||i>=sheet.headers.length)||!Number.isInteger(body.mapping.title))fail(400,'Map the task name and valid columns.');
   const units=workspace.validateUnits(user.id,org,body.unitIds||[]);if(org&&workspace.authorisedUnits(user.id,org,false).length&&!units.length&&body.confirmOrganisationWide!==true)fail(400,'Choose brands or confirm organisation-wide tasks.');
   const members=org?all('SELECT users.id,users.name,users.email FROM memberships JOIN users ON users.id=memberships.user_id WHERE memberships.company_id=?',org):[user];
   const campaigns=workspace.permittedRows(user.id,org,'campaign').map(workspace.result),existing=new Set(workspace.permittedRows(user.id,org,'task').map(r=>fingerprint(workspace.result(r)))),seen=new Set();
   const records=sheet.rows.map((values,i)=>{
    const valuesFor=key=>String(values[body.mapping[key]]??'').trim();let task={id:randomUUID(),title:valuesFor('title'),description:valuesFor('description'),due:'',done:false,status:'To do',priority:'Medium',campaign:'',discipline:valuesFor('discipline')||'Marketing',channel:valuesFor('channel'),unitIds:units,assigneeIds:[user.id],accountableOwnerId:user.id,plannerAllocated:true};
    try{
     if(Object.values(body.mapping).some(column=>/^\[(Formula:|Unsupported cell)/.test(String(values[column]||''))))throw Error('Replace formula or unsupported cells with plain values.');
     for(const field of ['start','plannedDate','due','publicationDate']){const value=valuesFor(field);if(value)task[field]=importDate(value,body.dateFormat||'ISO');}
     const owner=valuesFor('owner');if(owner){const matches=members.filter(m=>[m.id,m.email,m.name].some(v=>v?.toLowerCase()===owner.toLowerCase()));if(matches.length!==1)throw Error('Owner must uniquely match a member name, email or ID in this workspace.');task.accountableOwnerId=matches[0].id;task.assigneeIds=[matches[0].id]}
     const campaign=valuesFor('campaign');if(campaign){const matches=campaigns.filter(c=>c.id===campaign||c.name?.toLowerCase()===campaign.toLowerCase());if(matches.length!==1)throw Error('Campaign must uniquely match an accessible campaign in this workspace.');task.campaign=matches[0].id}
     const status=valuesFor('status').toLowerCase();if(status){const statuses={'to do':'To do','todo':'To do','open':'To do','in progress':'In progress','in review':'In review','done':'Done','completed':'Done'};if(!Object.hasOwn(statuses,status))throw Error('Status must be To do, In progress, In review or Done.');task.status=statuses[status];task.done=task.status==='Done'}
     const priority=valuesFor('priority');if(priority){const p=['Low','Medium','High'].find(p=>p.toLowerCase()===priority.toLowerCase());if(!p)throw Error('Priority must be Low, Medium or High.');task.priority=p}
     const effort=valuesFor('effortHours');if(effort)task.effortHours=Number(effort);
     if(task.done){task.completedAt=new Date().toISOString();task.completedBy=user.id;task.completedByName=user.name}
     workspace.validateData(task,'task',org,user.id,null);const key=fingerprint(task),duplicate=existing.has(key)||seen.has(key);seen.add(key);
     return {row:sheet.rowNumbers?.[i]||i+2,task,duplicate,error:''};
    }catch(e){return {row:sheet.rowNumbers?.[i]||i+2,task,error:e.message,duplicate:false}}
   });
   job.preview={org,records,snapshot:snapshot(user.id,org),allowDuplicates:body.allowDuplicates===true};run('UPDATE import_jobs SET data=? WHERE id=?',JSON.stringify(job),row.id);
   return send(200,{records:records.map(r=>({row:r.row,title:r.task.title,owner:members.find(m=>m.id===r.task.accountableOwnerId)?.name||'',due:r.task.due,plannedDate:r.task.plannedDate,duplicate:r.duplicate,error:r.error})),valid:records.filter(r=>!r.error&&(!r.duplicate||job.preview.allowDuplicates)).length,errors:records.filter(r=>r.error).length,duplicates:records.filter(r=>r.duplicate).length});
  }
  if(!job.preview)fail(400,'Preview this import first.');if(body.confirm!==true)fail(400,'Confirm the import.');const preview=job.preview;authorise(user.id,preview.org);
  if(preview.records.some(r=>r.error)&&body.confirmValidOnly!==true)fail(400,'Fix validation errors or explicitly import valid rows only.');
  const count=workspace.transaction(()=>{if(preview.snapshot!==snapshot(user.id,preview.org))fail(409,'Workspace records changed. Preview again before importing.');let count=0;for(const r of preview.records){if(r.error||r.duplicate&&!preview.allowDuplicates)continue;workspace.save(user.id,preview.org,'task',r.task.id,r.task,null);count++;}job.completed=true;delete job.sheets;run('UPDATE import_jobs SET data=? WHERE id=?',JSON.stringify(job),row.id);return count});
  return send(200,{imported:count,skipped:preview.records.length-count,errors:preview.records.filter(r=>r.error).map(r=>({row:r.row,error:r.error}))});
 }
 return {handle};
}
