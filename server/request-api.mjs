import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {requestStatuses,requestFields,defaultRequestForms} from '../src/requests.ts';
import {validTaskDate} from '../src/work.ts';

export function createRequestLayer(db,workspace){
 const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 const fail=(status,message)=>{throw Object.assign(new Error(message),{status})},now=()=>new Date().toISOString(),hash=s=>createHash('sha256').update(s).digest('hex');
 db.exec(`CREATE TABLE IF NOT EXISTS marketing_request_forms(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES companies(id),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS marketing_request_portals(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES companies(id),form_id TEXT NOT NULL REFERENCES marketing_request_forms(id),token_hash TEXT UNIQUE NOT NULL,name TEXT NOT NULL,unit_ids TEXT NOT NULL,expires_at TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS marketing_requests(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES companies(id),requester_id TEXT REFERENCES users(id),portal_id TEXT REFERENCES marketing_request_portals(id),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,first_response_at TEXT,completed_at TEXT);
 CREATE TABLE IF NOT EXISTS marketing_request_comments(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES marketing_requests(id),actor_id TEXT,name TEXT NOT NULL,text TEXT NOT NULL,internal INTEGER NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS marketing_request_events(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES marketing_requests(id),actor_id TEXT,name TEXT NOT NULL,action TEXT NOT NULL,internal INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS marketing_request_work(request_id TEXT NOT NULL REFERENCES marketing_requests(id),record_key TEXT REFERENCES workspace_records(record_key) ON DELETE SET NULL,kind TEXT NOT NULL,external_id TEXT NOT NULL,PRIMARY KEY(request_id,kind,external_id));
 CREATE TABLE IF NOT EXISTS marketing_request_notifications(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES marketing_requests(id),user_id TEXT NOT NULL REFERENCES users(id),event_key TEXT NOT NULL,title TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,UNIQUE(request_id,user_id,event_key));
 CREATE INDEX IF NOT EXISTS marketing_request_org ON marketing_requests(organisation_id);`);
 const parse=row=>JSON.parse(row.data),member=(id,org)=>workspace.member(id,org);
 const manager=(id,org,units=[])=>['owner','admin','manager'].includes(member(id,org)?.role)&&workspace.canUnits(id,org,units);
 const requireManager=(id,org,units=[])=>{if(!manager(id,org,units))fail(403,'Marketing manager access to this organisation and its brands is required.');};
 const write=org=>workspace.assertWritable(org);
 const record=row=>row.record_key?one('SELECT * FROM workspace_records WHERE record_key=?',row.record_key):null;
 const linked=(row)=>all('SELECT * FROM marketing_request_work WHERE request_id=?',row.id);
 const access=(user,row)=>{
  if(!user||!member(user.id,row.organisation_id))return false;const d=parse(row);if(!workspace.canUnits(user.id,row.organisation_id,d.unitIds))return false;
  return manager(user.id,row.organisation_id,d.unitIds)||row.requester_id===user.id||[d.requestOwnerId,d.deliveryOwnerId,d.commercialOwnerId,...d.contributorIds,...d.approverIds].includes(user.id)||linked(row).some(link=>{const r=record(link);return r?.organisation_id===row.organisation_id&&workspace.canRead(user.id,r)&&one('SELECT user_id FROM record_assignments WHERE record_key=? AND user_id=?',r.record_key,user.id)});
 };
 const requireRow=(user,id)=>{const row=one('SELECT * FROM marketing_requests WHERE id=?',id);if(!row||!access(user,row))fail(404,'Request not found.');return row;};
 const event=(row,actor,action,internal=false)=>run('INSERT INTO marketing_request_events VALUES(?,?,?,?,?,?,?)',randomUUID(),row.id,actor?.id||null,actor?.name||'Theory',action,Number(internal),now());
 const pref=(id)=>JSON.parse(one('SELECT notifications FROM user_settings WHERE user_id=?',id)?.notifications||'{}');
 const notificationType=title=>title.startsWith('New request')?'Marketing requests':title.startsWith('Request assignment')?'Assigned tasks':title.startsWith('Overdue')?'Overdue tasks':'Marketing requests';
 const notify=(row,key,title)=>{
  const d=parse(row),recipients=new Set([row.requester_id,d.requestOwnerId,d.deliveryOwnerId,d.commercialOwnerId,...d.contributorIds,...d.approverIds,...all("SELECT user_id FROM memberships WHERE company_id=? AND role IN ('owner','admin','manager')",row.organisation_id).map(m=>m.user_id)]);
  for(const id of recipients){if(!id||!access({id},row))continue;const p=pref(id);if(p.frequency==='off'||p.channel==='email'||p.types&&!p.types.includes(notificationType(title))||p.organisationIds?.length&&!p.organisationIds.includes(row.organisation_id))continue;run('INSERT OR IGNORE INTO marketing_request_notifications VALUES(?,?,?,?,?,?,NULL)',randomUUID(),row.id,id,key,title,now());}
 };
 const workSummary=(row,user,portal=false)=>linked(row).map(link=>{const r=record(link);if(!r||r.organisation_id!==row.organisation_id)return {id:link.external_id,kind:link.kind,title:'Linked work unavailable',status:'Unavailable',due:'',accessible:false,missing:true};const d=workspace.result(r);return {id:r.external_id,kind:r.kind,title:d.title||d.name,status:r.kind==='task'?(d.done?'Done':d.status||'To do'):d.status||'Planning',due:d.due||d.end||'',accessible:!portal&&!!user&&workspace.canRead(user.id,r)};});
 const result=(row,user,portal=false)=>{
  const d=parse(row),manage=!portal&&manager(user.id,row.organisation_id,d.unitIds);
  return {...d,id:row.id,organisationId:row.organisation_id,organisationName:one('SELECT name FROM companies WHERE id=?',row.organisation_id).name,brandNames:d.unitIds.map(id=>one('SELECT name FROM business_units WHERE id=? AND organisation_id=?',id,row.organisation_id)?.name||'Archived brand'),requesterId:row.requester_id,requestOwnerName:one('SELECT name FROM users WHERE id=?',d.requestOwnerId)?.name||d.requesterName,deliveryOwnerName:one('SELECT name FROM users WHERE id=?',d.deliveryOwnerId)?.name||'',commercialOwnerName:one('SELECT name FROM users WHERE id=?',d.commercialOwnerId)?.name||'',version:row.version,createdAt:row.created_at,firstResponseAt:row.first_response_at,completedAt:row.completed_at,canManage:manage,canReply:portal||manage||row.requester_id===user.id||d.requestOwnerId===user.id,work:workSummary(row,user,portal),comments:all('SELECT * FROM marketing_request_comments WHERE request_id=?'+(manage?'':' AND internal=0')+' ORDER BY created_at,rowid',row.id).map(c=>({id:c.id,name:c.name,text:c.text,internal:!!c.internal,at:c.created_at})),history:all('SELECT * FROM marketing_request_events WHERE request_id=?'+(manage?'':' AND internal=0')+' ORDER BY created_at,rowid',row.id).map(e=>({id:e.id,action:e.action,name:e.name,at:e.created_at}))};
 };
 const text=(v,name,max=5000,required=false)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())fail(400,'Check '+name+'.');return v.trim();};
 const date=(v)=>{if(v!==''&&!validTaskDate(v))fail(400,'Choose a valid date.');return v;};
 const list=(v)=>{if(!Array.isArray(v)||v.length>50||v.some(x=>typeof x!=='string')||new Set(v).size!==v.length)fail(400,'Choose valid people.');return v;};
 const formResult=row=>({...parse(row),id:row.id,version:row.version});
 const seed=org=>{for(const form of defaultRequestForms){const id=org+':'+form.id;run('INSERT OR IGNORE INTO marketing_request_forms(id,organisation_id,data) VALUES(?,?,?)',id,org,JSON.stringify({...form,id}));}};
 const formData=body=>{
  const name=text(body.name,'form name',120,true),description=text(body.description||'','form description',2000),allowed=[...requestFields.map(f=>f[0]),'requestedDeadline','attachments'];
  if(!Array.isArray(body.required)||body.required.some(k=>!allowed.includes(k)))fail(400,'Choose valid required fields.');
  if(!Array.isArray(body.questions)||body.questions.length>20||new Set(body.questions.map(q=>q?.id)).size!==body.questions.length)fail(400,'Use up to 20 distinct questions.');
  const questions=body.questions.map(q=>{if(!q||!/^[-a-zA-Z0-9_]{1,80}$/.test(q.id)||['__proto__','constructor','prototype'].includes(q.id)||typeof q.required!=='boolean')fail(400,'Choose a valid question identifier and required setting.');return {id:q.id,label:text(q.label,'question',180,true),required:q.required};});
  if(!Number.isInteger(body.responseHours)||body.responseHours<0||body.responseHours>8760||!Number.isInteger(body.turnaroundDays)||body.turnaroundDays<0||body.turnaroundDays>365)fail(400,'Check response hours and turnaround days.');
  if(typeof body.active!=='boolean')fail(400,'Choose whether this form is active.');return {name,description,required:[...new Set(body.required)],questions,responseHours:body.responseHours,turnaroundDays:body.turnaroundDays,active:body.active};
 };
 const attachments=value=>{if(!Array.isArray(value)||value.length>5)fail(400,'Attach up to five files.');return value.map(a=>{if(!a||typeof a!=='object')fail(400,'Choose valid supporting documents.');return {id:randomUUID(),name:text(a.name,'attachment name',180,true),url:(()=>{if(typeof a.url!=='string'||a.url.length>1400000||!/^data:(application\/pdf|image\/(png|jpeg|webp)|text\/plain);base64,[A-Za-z0-9+/=]+$/.test(a.url))fail(400,'Use PDF, image or text files up to 1 MB.');return a.url;})()};});};
 const validatePeople=(org,units,d)=>{for(const id of [d.requestOwnerId,d.deliveryOwnerId,d.commercialOwnerId,...d.contributorIds,...d.approverIds].filter(Boolean))if(!member(id,org)||!workspace.canUnits(id,org,units))fail(400,'Choose people authorised for this organisation and its brands.');};
 const submit=(org,user,portal,body)=>{
  write(org);const f=one('SELECT * FROM marketing_request_forms WHERE id=? AND organisation_id=?',portal?.form_id||body.formId,org);if(!f||!parse(f).active)fail(400,'Choose an active request form.');const form=formResult(f);
  const units=portal?JSON.parse(portal.unit_ids):workspace.validateUnits(user.id,org,body.unitIds||[]);
  if(portal&&units.some(id=>!one('SELECT id FROM business_units WHERE id=? AND organisation_id=? AND archived=0',id,org)))fail(403,'This invitation’s brand is no longer available.');
  const title=text(body.title,'title',180,true),description=text(body.description||'','description',10000,true),fields={},answers={};
  for(const [key,label] of requestFields)fields[key]=text(body.fields?.[key]||'',label,5000,form.required.includes(key));
  for(const q of form.questions)answers[q.id]=text(body.answers?.[q.id]||'',q.label,5000,q.required);
  const requestedDeadline=date(body.requestedDeadline||'');if(form.required.includes('requestedDeadline')&&!requestedDeadline)fail(400,'A requested deadline is required.');
  if(!['Low','Medium','High'].includes(body.requestedPriority))fail(400,'Choose a valid requested priority.');const files=attachments(body.attachments||[]);if(form.required.includes('attachments')&&!files.length)fail(400,'Supporting documents are required.');
  const d={title,description,fields,answers,formId:f.id,formName:form.name,questions:form.questions,unitIds:units,requesterName:user?.name||portal.name,requestOwnerId:user?.id||'',deliveryOwnerId:'',commercialOwnerId:'',contributorIds:[],approverIds:[],requestedDeadline,requestedPriority:body.requestedPriority,agreedDeadline:'',priority:body.requestedPriority,status:'New',attachments:files,converted:false,responseDueAt:form.responseHours?new Date(Date.now()+form.responseHours*3600000).toISOString():null,expectedTurnaroundDays:form.turnaroundDays};
  const id=randomUUID();run('INSERT INTO marketing_requests(id,organisation_id,requester_id,portal_id,data,created_at) VALUES(?,?,?,?,?,?)',id,org,user?.id||null,portal?.id||null,JSON.stringify(d),now());const row=one('SELECT * FROM marketing_requests WHERE id=?',id);event(row,user||{name:portal.name},'Request submitted');notify(row,'new','New request: '+title);return row;
 };
 const revision=(row,body)=>{if(body.version!==row.version)fail(409,'This request changed. Refresh before saving.');};
 const update=(row,d,respond=false)=>{run('UPDATE marketing_requests SET data=?,version=version+1,first_response_at=CASE WHEN ? THEN COALESCE(first_response_at,?) ELSE first_response_at END,completed_at=? WHERE id=?',JSON.stringify(d),Number(respond),now(),d.status==='Completed'?row.completed_at||now():d.status==='Archived'?row.completed_at:null,row.id);return one('SELECT * FROM marketing_requests WHERE id=?',row.id);};
 const reply=(row,actor,body,manage)=>{
  revision(row,body);if(body.internal!==undefined&&typeof body.internal!=='boolean')fail(400,'Choose a valid message visibility.');const d=parse(row);if(['Archived','Declined','Completed'].includes(d.status))fail(409,'This request is closed.');if(body.internal&&!manage)fail(403,'Only Marketing managers can write internal notes.');const comment=text(body.text,'comment',5000,true);if(body.internal&&body.attachments?.length)fail(400,'Internal notes cannot add shared supporting documents.');if(one('SELECT count(*) AS count FROM marketing_request_comments WHERE request_id=?',row.id).count>=500)fail(400,'This request has reached its conversation limit.');
  run('INSERT INTO marketing_request_comments VALUES(?,?,?,?,?,?,?)',randomUUID(),row.id,actor.id||null,actor.name,comment,Number(!!body.internal),now());
  const extra=attachments(body.attachments||[]);if(d.attachments.length+extra.length>5)fail(400,'Use up to five supporting documents per request.');d.attachments.push(...extra);
  if(!body.internal&&d.status==='Awaiting Information'&&!manage)d.status='Under Review';
  const saved=update(row,d,manage&&!body.internal);event(saved,actor,body.internal?'Internal note added':'Information added',!!body.internal);if(!body.internal)notify(saved,'reply:'+saved.version,'Request information updated: '+d.title);return saved;
 };
 const sync=()=>{
  for(const row of all('SELECT * FROM marketing_requests')){const d=parse(row);if(['Archived','Declined'].includes(d.status))continue;
   if(d.status==='Completed'){const tasks=linked(row).filter(w=>w.kind==='task').map(record);if(d.converted&&tasks.some(t=>t?.organisation_id===row.organisation_id&&!parse(t).done)){const saved=update(row,{...d,status:'In Progress'});event(saved,null,'Linked delivery work reopened');notify(saved,'reopened:'+saved.version,'Work reopened: '+d.title);}continue;}
   const tasks=linked(row).filter(w=>w.kind==='task').map(record);if(d.converted&&tasks.length&&tasks.every(t=>t?.organisation_id===row.organisation_id&&parse(t).done)){
    const saved=update(row,{...d,status:'Completed'});event(saved,null,'Linked delivery work completed');notify(saved,'completed:'+saved.version,'Work completed: '+d.title);continue;
   }
   if(d.converted&&['Scheduled','Approved'].includes(d.status)&&tasks.some(t=>t?.organisation_id===row.organisation_id&&!parse(t).done&&parse(t).status==='In progress')){const saved=update(row,{...d,status:'In Progress'});event(saved,null,'Linked delivery work started');notify(saved,'started:'+saved.version,'Work in progress: '+d.title);}
   const deadline=d.agreedDeadline||d.requestedDeadline;if(deadline&&deadline<now().slice(0,10))notify(row,'overdue:'+deadline,'Overdue request: '+d.title);
   if(!row.first_response_at&&d.responseDueAt&&d.responseDueAt<now())notify(row,'response:'+d.responseDueAt,'Overdue response target: '+d.title);
  }
 };
 const portalLimits=new Map();
 const portalFor=req=>{const token=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))fail(404,'Invitation unavailable.');const row=one('SELECT * FROM marketing_request_portals WHERE token_hash=? AND revoked=0 AND expires_at>?',hash(token),now());if(!row||!member(row.created_by,row.organisation_id)||!manager(row.created_by,row.organisation_id,JSON.parse(row.unit_ids)))fail(404,'Invitation unavailable or expired.');return row;};
 async function handle({req,path,user,send,bodyOf}){
  if(!path.startsWith('/api/requests/'))return false;
  const url=new URL(req.url,'http://localhost');const readBody=async(req,limit)=>{const body=await bodyOf(req,limit);if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Use a request object.');return body;};
  if(path.startsWith('/api/requests/portal')){
   const portal=portalFor(req),key=portal.id+':'+(req.socket.remoteAddress||'local'),rate=portalLimits.get(key)||{count:0,until:Date.now()+3600000};if(rate.until<Date.now()){rate.count=0;rate.until=Date.now()+3600000}if(portalLimits.size>5000)for(const [key,value] of portalLimits)if(value.until<Date.now())portalLimits.delete(key);if(++rate.count>(req.method==='GET'?1200:120))fail(429,'Too many portal requests. Try again later.');portalLimits.set(key,rate);sync();
   if(path==='/api/requests/portal'&&req.method==='GET')return send(200,{name:portal.name,organisationName:one('SELECT name FROM companies WHERE id=?',portal.organisation_id).name,form:formResult(one('SELECT * FROM marketing_request_forms WHERE id=?',portal.form_id)),requests:all('SELECT * FROM marketing_requests WHERE portal_id=? ORDER BY created_at DESC',portal.id).map(r=>result(r,null,true))});
   if(path==='/api/requests/portal'&&req.method==='POST'){if(all('SELECT id FROM marketing_requests WHERE portal_id=? AND created_at>?',portal.id,new Date(Date.now()-86400000).toISOString()).length>=10)fail(429,'This invitation allows ten submissions per day.');const body=await readBody(req,8*1024*1024);const row=workspace.transaction(()=>submit(portal.organisation_id,null,portal,body));return send(201,{request:result(row,null,true)});}
   const match=path.match(/^\/api\/requests\/portal\/([^/]+)\/reply$/);if(match&&req.method==='POST'){const row=one('SELECT * FROM marketing_requests WHERE id=? AND portal_id=?',match[1],portal.id);if(!row)fail(404,'Request not found.');write(row.organisation_id);const body=await readBody(req,8*1024*1024),saved=workspace.transaction(()=>reply(row,{name:portal.name},body,false));return send(200,{request:result(saved,null,true)});}
   fail(404,'Portal endpoint not found.');
  }
  if(!user)fail(401,'Sign in to use the Marketing Request Centre.');sync();
  if(path==='/api/requests/notifications'){
   if(req.method==='GET')return send(200,{notifications:all('SELECT * FROM marketing_request_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id).filter(n=>{const row=one('SELECT * FROM marketing_requests WHERE id=?',n.request_id),p=pref(user.id);return row&&access(user,row)&&workspace.notificationReady(user.id,n.created_at)&&p.frequency!=='off'&&p.channel!=='email'&&(!p.types||p.types.includes(notificationType(n.title)))&&(!p.organisationIds?.length||p.organisationIds.includes(row.organisation_id))}).map(n=>({id:n.id,requestId:n.request_id,title:n.title,createdAt:n.created_at,read:!!n.read_at}))});
   if(req.method==='PUT'){const b=await readBody(req);run('UPDATE marketing_request_notifications SET read_at=? WHERE id=? AND user_id=?',now(),b.id,user.id);return send(200,{ok:true});}
  }
  const org=url.searchParams.get('organisationId');
  if(path==='/api/requests/forms'){
   if(!org||!member(user.id,org))fail(403,'Choose an organisation you belong to.');seed(org);
   if(req.method==='GET')return send(200,{forms:all('SELECT * FROM marketing_request_forms WHERE organisation_id=?',org).map(formResult)});
   if(req.method==='POST'||req.method==='PUT'){requireManager(user.id,org,workspace.authorisedUnits(user.id,org,false).map(u=>u.id));write(org);const b=await readBody(req),d=formData(b),existing=b.id?one('SELECT * FROM marketing_request_forms WHERE id=? AND organisation_id=?',b.id,org):null;if(b.id&&!existing)fail(404,'Form not found.');if(existing&&existing.version!==b.version)fail(409,'This form changed. Refresh before saving.');const id=existing?.id||randomUUID();if(existing)run('UPDATE marketing_request_forms SET data=?,version=version+1 WHERE id=?',JSON.stringify(d),id);else run('INSERT INTO marketing_request_forms(id,organisation_id,data) VALUES(?,?,?)',id,org,JSON.stringify(d));return send(existing?200:201,{form:formResult(one('SELECT * FROM marketing_request_forms WHERE id=?',id))});}
  }
  if(path==='/api/requests/invitations'){
   if(!org)fail(400,'Choose an organisation.');requireManager(user.id,org,workspace.authorisedUnits(user.id,org,false).map(u=>u.id));
   if(req.method==='GET')return send(200,{invitations:all('SELECT id,name,expires_at,revoked,unit_ids FROM marketing_request_portals WHERE organisation_id=? ORDER BY expires_at DESC',org).map(i=>({...i,unitIds:JSON.parse(i.unit_ids)}))});
   if(req.method==='POST'){write(org);const b=await readBody(req),units=workspace.validateUnits(user.id,org,b.unitIds||[]),f=one('SELECT * FROM marketing_request_forms WHERE id=? AND organisation_id=?',b.formId,org);if(!f||!parse(f).active)fail(400,'Choose an active form.');const name=text(b.name,'invited requester name',100,true);if(!Number.isInteger(b.days)||b.days<1||b.days>30)fail(400,'Use an expiry between 1 and 30 days.');const token=randomBytes(32).toString('hex'),id=randomUUID();run('INSERT INTO marketing_request_portals VALUES(?,?,?,?,?,?,?,0,?)',id,org,f.id,hash(token),name,JSON.stringify(units),new Date(Date.now()+b.days*86400000).toISOString(),user.id);return send(201,{id,token});}
   if(req.method==='DELETE'){write(org);const b=await readBody(req);run('UPDATE marketing_request_portals SET revoked=1 WHERE id=? AND organisation_id=?',b.id,org);return send(200,{ok:true});}
  }
  if(path==='/api/requests/work'&&req.method==='GET'){
   if(!org||!member(user.id,org))fail(403,'Choose an authorised organisation.');const task=one("SELECT * FROM workspace_records WHERE organisation_id=? AND kind='task' AND external_id=?",org,url.searchParams.get('taskId'));if(!task||!workspace.canRead(user.id,task))fail(404,'Task not found.');return send(200,{requests:all('SELECT marketing_requests.* FROM marketing_requests JOIN marketing_request_work ON marketing_requests.id=marketing_request_work.request_id WHERE marketing_request_work.record_key=?',task.record_key).filter(row=>access(user,row)).map(row=>result(row,user))});
  }
  if(path==='/api/requests/items'){
   if(req.method==='GET'){
    if(org&&!member(user.id,org))fail(403,'Choose an organisation you belong to.');return send(200,{requests:all('SELECT * FROM marketing_requests'+(org?' WHERE organisation_id=?':'')+' ORDER BY created_at DESC',...(org?[org]:[])).filter(row=>access(user,row)).map(row=>result(row,user))});
   }
   if(req.method==='POST'){if(!org||!member(user.id,org))fail(403,'Choose an organisation you belong to.');seed(org);const b=await readBody(req,8*1024*1024),row=workspace.transaction(()=>submit(org,user,null,b));return send(201,{request:result(row,user)});}
  }
  const match=path.match(/^\/api\/requests\/items\/([^/]+)(?:\/(reply|convert))?$/);
  if(match){let row=requireRow(user,match[1]);const d=parse(row),manage=manager(user.id,row.organisation_id,d.unitIds);
   if(req.method==='GET'&&!match[2])return send(200,{request:result(row,user)});
   write(row.organisation_id);const b=await readBody(req,8*1024*1024);
   if(match[2]==='reply'&&req.method==='POST'){if(!manage&&row.requester_id!==user.id&&d.requestOwnerId!==user.id)fail(403,'Only the requester, request owner or Marketing manager can reply.');row=workspace.transaction(()=>reply(row,user,b,manage));return send(200,{request:result(row,user)});}
   requireManager(user.id,row.organisation_id,d.unitIds);revision(row,b);
   if(match[2]==='convert'&&req.method==='POST'){
    if(d.converted)fail(409,'Work has already been generated from this request.');if(!['Approved','Scheduled'].includes(d.status))fail(409,'Approve the request before generating work.');if(!d.deliveryOwnerId||!d.agreedDeadline)fail(400,'Assign a Marketing delivery owner and agree a deadline first.');validatePeople(row.organisation_id,d.unitIds,d);
    if(!['task','campaign','project','template'].includes(b.kind))fail(400,'Choose a supported conversion.');
    row=workspace.transaction(()=>{
     let campaignId='';if(['campaign','project'].includes(b.kind)){campaignId=randomUUID();const campaign=workspace.save(user.id,row.organisation_id,'campaign',campaignId,{id:campaignId,name:d.title,category:b.kind==='project'?'Project':'Marketing campaign',end:d.agreedDeadline,budget:0,status:'Planning',unitIds:d.unitIds},null);run('INSERT INTO marketing_request_work VALUES(?,?,?,?)',row.id,campaign.record_key,'campaign',campaignId);}
     let blueprints=[{}];if(b.kind==='template'){const ids=list(b.templateIds);if(!ids.length||ids.length>20)fail(400,'Choose between one and twenty accessible task templates.');blueprints=ids.map(id=>{const t=one("SELECT * FROM workspace_records WHERE organisation_id=? AND kind='template' AND external_id=?",row.organisation_id,id);if(!t||!workspace.canRead(user.id,t))fail(400,'Choose accessible task templates in this organisation.');return parse(t).blueprint;});}
     for(const blueprint of blueprints){const id=randomUUID(),task=workspace.save(user.id,row.organisation_id,'task',id,{...blueprint,id,title:blueprint.title||d.title,description:'Delivery work for a linked marketing request. Open the source request for the brief and supporting documents.',due:d.agreedDeadline,priority:d.priority,done:false,status:'To do',campaign:campaignId,unitIds:d.unitIds,accountableOwnerId:d.deliveryOwnerId,assigneeIds:[...new Set([d.deliveryOwnerId,...d.contributorIds])],contributorIds:d.contributorIds,plannerAllocated:true,checklist:(blueprint.checklist||[]).map(c=>({...c,id:randomUUID(),done:false}))},null);run('INSERT INTO marketing_request_work VALUES(?,?,?,?)',row.id,task.record_key,'task',id);}
     const saved=update(row,{...d,converted:true,status:'Scheduled'},true);event(saved,user,'Approved request converted to '+(b.kind==='template'?'templated tasks':b.kind+' work'));notify(saved,'converted','Request scheduled: '+d.title);return saved;
    });return send(200,{request:result(row,user)});
   }
   if(!match[2]&&req.method==='PUT'){
    if(!requestStatuses.includes(b.status)||!['Low','Medium','High'].includes(b.priority))fail(400,'Choose a valid status and priority.');
    const next={...d,status:b.status,priority:b.priority,agreedDeadline:date(b.agreedDeadline||''),requestOwnerId:text(b.requestOwnerId||'','request owner',100),deliveryOwnerId:text(b.deliveryOwnerId||'','delivery owner',100),commercialOwnerId:text(b.commercialOwnerId||'','commercial follow-up owner',100),contributorIds:list(b.contributorIds||[]),approverIds:list(b.approverIds||[])};validatePeople(row.organisation_id,d.unitIds,next);
    if(['Scheduled','In Progress'].includes(next.status)&&(!next.agreedDeadline||!next.deliveryOwnerId))fail(400,'Scheduling needs an agreed deadline and Marketing delivery owner.');
    if(next.status==='Completed'&&d.converted){const tasks=linked(row).filter(w=>w.kind==='task').map(record);if(!tasks.length||tasks.some(t=>!t||t.organisation_id!==row.organisation_id||!parse(t).done))fail(409,'Complete the linked delivery tasks first.');}
    row=workspace.transaction(()=>{const saved=update(row,next,true);event(saved,user,d.status!==next.status?'Status: '+next.status:'Triage and responsibilities updated');if(d.agreedDeadline!==next.agreedDeadline)event(saved,user,'Agreed deadline: '+(next.agreedDeadline||'Not agreed'));notify(saved,'review:'+saved.version,next.status==='Declined'?'Request declined: '+d.title:next.status==='Awaiting Information'?'Information required: '+d.title:next.status==='Approved'?'Request approved: '+d.title:next.status==='Completed'?'Work completed: '+d.title:'Request updated: '+d.title);if(d.deliveryOwnerId!==next.deliveryOwnerId&&next.deliveryOwnerId)notify(saved,'assignment:'+saved.version,'Request assignment: '+d.title);return saved;});return send(200,{request:result(row,user)});
   }
  }
  fail(404,'Request Centre endpoint not found.');
 }
 const timer=setInterval(()=>{try{sync()}catch{/* Preserve pending work for the next worker pass. */}},30000);timer.unref();
 return {handle,close:()=>clearInterval(timer)};
}
