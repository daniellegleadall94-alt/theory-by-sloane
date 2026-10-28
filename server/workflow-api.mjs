import {randomUUID} from 'node:crypto';
import {workflowTriggers,workflowActions,initialPlaybooks,proposePlaybook,shiftedDate} from '../src/workflows.ts';
import {validTaskDate} from '../src/work.ts';
import {completionCycle} from '../src/workManagement.ts';

export function createWorkflowLayer(db,w,requests){
 const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a),now=()=>new Date().toISOString(),parse=r=>JSON.parse(r.data);
 const fail=(status,message)=>{throw Object.assign(new Error(message),{status})},dateToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});
 db.exec(`CREATE TABLE IF NOT EXISTS workflow_rules(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES companies(id),executor_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,enabled_at TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS workflow_events(id TEXT PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,organisation_id TEXT NOT NULL,trigger TEXT NOT NULL,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0,target_rule TEXT);
 CREATE TABLE IF NOT EXISTS workflow_runs(id TEXT PRIMARY KEY,rule_id TEXT NOT NULL REFERENCES workflow_rules(id),event_id TEXT NOT NULL REFERENCES workflow_events(id),status TEXT NOT NULL,message TEXT NOT NULL,actions TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(rule_id,event_id));
 CREATE TABLE IF NOT EXISTS workflow_approvals(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL,record_key TEXT NOT NULL REFERENCES workspace_records(record_key) ON DELETE CASCADE,source_version INTEGER NOT NULL,requested_by TEXT NOT NULL REFERENCES users(id),approver_ids TEXT NOT NULL,stage TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pending',decision_by TEXT,reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,decided_at TEXT);
 CREATE TABLE IF NOT EXISTS workflow_notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),organisation_id TEXT NOT NULL,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,event_key TEXT NOT NULL,title TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,UNIQUE(user_id,event_key));
 CREATE TABLE IF NOT EXISTS marketing_playbooks(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES companies(id),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS playbook_previews(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),organisation_id TEXT NOT NULL,playbook_id TEXT NOT NULL REFERENCES marketing_playbooks(id),playbook_version INTEGER NOT NULL,config TEXT NOT NULL,rows TEXT NOT NULL,expires_at TEXT NOT NULL,applied_campaign TEXT);
 CREATE TABLE IF NOT EXISTS workflow_task_sources(record_key TEXT PRIMARY KEY REFERENCES workspace_records(record_key) ON DELETE CASCADE,organisation_id TEXT NOT NULL,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,label TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS workflow_pending ON workflow_events(processed,created_at);
 CREATE INDEX IF NOT EXISTS workflow_rules_org ON workflow_rules(organisation_id);`);
 const member=(id,org)=>w.member(id,org),manage=(id,org,units=[])=>['owner','admin','manager'].includes(member(id,org)?.role)&&w.canUnits(id,org,units);
 const canCreateWork=(id,org,units)=>['owner','admin','manager','member'].includes(member(id,org)?.role)&&w.canUnits(id,org,units);
 const requireManage=(id,org,units=[])=>{if(!manage(id,org,units))fail(403,'A Marketing manager with access to every selected brand is required.');};
 const rowFor=(org,kind,id)=>one('SELECT * FROM workspace_records WHERE organisation_id=? AND kind=? AND external_id=?',org,kind,id);
 const source=(org,kind,id)=>{
  if(kind==='organisation')return {organisationId:org,unitIds:(()=>{const rule=one('SELECT data FROM workflow_rules WHERE id=? AND organisation_id=?',id,org);return rule?parse(rule).unitIds:[];})(),title:one('SELECT name FROM companies WHERE id=?',org)?.name||'Organisation',version:1};
  if(kind==='request'){const row=one('SELECT * FROM marketing_requests WHERE organisation_id=? AND id=?',org,id);return row?{...parse(row),id,organisationId:org,version:row.version,_row:row}:null;}
  if(kind==='approval'){const approval=one('SELECT * FROM workflow_approvals WHERE organisation_id=? AND id=?',org,id),r=approval?one('SELECT * FROM workspace_records WHERE record_key=?',approval.record_key):null;return r?{...w.result(r),outcome:approval.status,approvalId:approval.id,_row:r,_approval:approval}:null;}
  const r=rowFor(org,kind,id);return r?{...w.result(r),_row:r}:null;
 };
 const canSource=(id,org,kind,value)=>!!value&&!!member(id,org)&&(kind==='organisation'?w.canUnits(id,org,value.unitIds||[]):kind==='request'?requests.canRead({id},value._row):w.canRead(id,value._row));
 const cleanSource=value=>{if(!value)return null;const {_row,_approval,...data}=value;return data;};
 const emit=(org,trigger,kind,id,key,data={},targetRule=null)=>{const brief=value=>value?Object.fromEntries(['id','status','done','budget','assigneeIds','accountableOwnerId','campaign','unitIds'].filter(k=>value[k]!==undefined).map(k=>[k,value[k]])):undefined;data={before:brief(data.before),after:brief(data.after)};run('INSERT OR IGNORE INTO workflow_events VALUES(?,?,?,?,?,?,?,?,0,?)',randomUUID(),key,org,trigger,kind,id,JSON.stringify(data),now(),targetRule);};
 const notificationAllowed=(id,org)=>{const p=JSON.parse(one('SELECT notifications FROM user_settings WHERE user_id=?',id)?.notifications||'{}');return p.frequency!=='off'&&p.channel!=='email'&&(!p.types||p.types.includes('Workflow automations'))&&(!p.organisationIds?.length||p.organisationIds.includes(org));};
 const notify=(id,org,kind,sourceId,key,title)=>{if(!canSource(id,org,kind,source(org,kind,sourceId)))fail(403,'Notification recipients must already have access to the source.');if(notificationAllowed(id,org))run('INSERT OR IGNORE INTO workflow_notifications VALUES(?,?,?,?,?,?,?,?,NULL)',randomUUID(),id,org,kind,sourceId,key,title,now());};
 const ruleResult=row=>({...parse(row),id:row.id,version:row.version,executorName:one('SELECT name FROM users WHERE id=?',row.executor_id)?.name||'Former member'});
 const bookResult=row=>({...parse(row),id:row.id,version:row.version});
 const text=(v,label,max=180)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(400,'Check '+label+'.');return v.trim();};
 const strings=(v,max=50)=>{if(!Array.isArray(v)||v.length>max||v.some(x=>typeof x!=='string'||x.length>180))fail(400,'Choose valid values.');return [...new Set(v)];};
 const unitScope=(rule,units)=>!rule.unitIds.length||units.length>0&&units.every(id=>rule.unitIds.includes(id));
 const taskStatus=t=>t.done?'Done':t.status||'To do';
 w.setWorkflowSink(({row,before,origin})=>{
  if(origin||!row.organisation_id||!['task','campaign'].includes(row.kind))return;const d=w.result(row),org=row.organisation_id,key=row.record_key+':'+row.version;
  if(row.kind==='task'){
   if(d.occurrenceOf)return;
   if(!before)emit(org,'task.created','task',d.id,key+':created',{after:d});
   if(before&&taskStatus(before)!==taskStatus(d))emit(org,'task.status','task',d.id,key+':status',{before,after:d});
   if(before&&!before.done&&d.done)emit(org,'task.completed','task',d.id,key+':done',{before,after:d});
   if(before&&(JSON.stringify(before.assigneeIds)!==JSON.stringify(d.assigneeIds)||(before.accountableOwnerId||before.assigneeIds?.[0])!==(d.accountableOwnerId||d.assigneeIds?.[0])))emit(org,'task.assigned','task',d.id,key+':assigned',{before,after:d});
   if(d.done&&!before?.done&&d.milestone&&d.campaign)emit(org,'campaign.milestone','task',d.id,key+':milestone',{after:d});
   if(d.done&&!before?.done&&d.parentTaskId){const parent=rowFor(org,'task',d.parentTaskId),children=all("SELECT * FROM workspace_records WHERE organisation_id=? AND kind='task'",org).filter(r=>parse(r).parentTaskId===d.parentTaskId);if(parent&&children.length&&children.every(r=>parse(r).done))emit(org,'task.children','task',parent.external_id,key+':children',{after:w.result(parent)});}
  }else{
   if(before&&before.status!==d.status)emit(org,'campaign.status','campaign',d.id,key+':status',{before,after:d});
   if(before&&before.budget!==d.budget)emit(org,'campaign.budget','campaign',d.id,key+':budget',{before,after:d});
  }
 });
 requests.setWorkflowSink((before,row)=>{if(parse(before).status!=='Approved'&&parse(row).status==='Approved')emit(row.organisation_id,'request.approved','request',row.id,'request:'+row.id+':'+row.version,{after:parse(row)});});
 const validateRule=(body,user,org)=>{if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Use a valid rule definition.');
  const units=w.validateUnits(user.id,org,body.unitIds||[]);requireManage(user.id,org,units);const name=text(body.name,'rule name');if(!workflowTriggers.some(t=>t[0]===body.trigger)||typeof body.enabled!=='boolean')fail(400,'Choose a supported trigger and enabled setting.');
  const c=body.conditions;if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['campaign','discipline','ownerId','priority','status','requestType','outcome'].includes(k))||Object.values(c).some(v=>typeof v!=='string'||v.length>180))fail(400,'Check rule conditions.');
  if(c.campaign){const r=rowFor(org,'campaign',c.campaign);if(!r||!w.canRead(user.id,r))fail(400,'Choose an accessible campaign.');}if(c.ownerId&&!member(c.ownerId,org))fail(400,'Choose an organisation member.');
  if(c.requestType&&!one('SELECT id FROM marketing_request_forms WHERE organisation_id=? AND id=?',org,c.requestType))fail(400,'Choose a request form in this organisation.');
  const daysBefore=body.daysBefore??3,budgetThreshold=body.budgetThreshold??0;if(!Number.isInteger(daysBefore)||daysBefore<0||daysBefore>365||!Number.isFinite(budgetThreshold)||budgetThreshold<0||budgetThreshold>1e12)fail(400,'Check date and budget thresholds.');
  const scheduledAt=body.scheduledAt||'';if(body.trigger==='campaign.budget'&&budgetThreshold<=0)fail(400,'Use a positive planned budget threshold.');
  if(body.trigger==='scheduled'&&(!Number.isFinite(Date.parse(scheduledAt))||Date.parse(scheduledAt)<Date.now()-60000))fail(400,'Choose a future scheduled time.');
  if(!Array.isArray(body.actions)||!body.actions.length||body.actions.length>10)fail(400,'Use between one and ten actions.');
  const taskTriggers=body.trigger.startsWith('task.')||body.trigger.startsWith('approval.')||body.trigger==='campaign.milestone';
  const actions=body.actions.map(a=>{
   if(!a||!workflowActions.some(t=>t[0]===a.type)||Object.keys(a).some(k=>!['type','title','userId','status','days','listId','templateId','stage'].includes(k)))fail(400,'Choose supported rule actions.');
   if(['assign','status','reminder','contributor','list','approval'].includes(a.type)&&!taskTriggers)fail(400,'This action needs a task or task approval trigger.');
   if(a.userId!==undefined&&typeof a.userId!=='string'||a.userId&&!member(a.userId,org))fail(400,'Choose an authorised organisation member.');
   if(['assign','contributor','approval'].includes(a.type)&&!a.userId)fail(400,'Choose the responsible person for this action.');
   if(a.title!==undefined&&(typeof a.title!=='string'||a.title.length>180)||a.days!==undefined&&(!Number.isInteger(a.days)||a.days<0||a.days>365))fail(400,'Check action text and relative days.');
   if(a.type==='status'&&!['To do','In progress','In review','Done'].includes(a.status))fail(400,'Choose a supported task status.');
   if(a.type==='list'){const list=rowFor(org,'group',a.listId);if(!list||!w.canRead(user.id,list)||parse(list).archived)fail(400,'Choose an accessible active list.');}
   if(a.type==='template'){const t=rowFor(org,'template',a.templateId);if(!t||!w.canRead(user.id,t))fail(400,'Choose an accessible task template.');}
   if(a.stage!==undefined&&(typeof a.stage!=='string'||a.stage.length>100))fail(400,'Use an approval stage up to 100 characters.');return {...a};
  });
  return {name,unitIds:units,enabled:body.enabled,trigger:body.trigger,conditions:{...c},actions,daysBefore,budgetThreshold,scheduledAt};
 };
 const matches=(rule,event,s)=>{
  if(!s||s.archived||s.occurrenceOf||!unitScope(rule,s.unitIds||[]))return false;const c=rule.conditions;
  if(c.campaign&&c.campaign!==(event.source_kind==='campaign'?s.id:s.campaign)||c.discipline&&c.discipline!==s.discipline||c.ownerId&&c.ownerId!==(s.accountableOwnerId||s.deliveryOwnerId||s.assigneeIds?.[0])||c.priority&&c.priority!==s.priority||c.status&&c.status!==(event.source_kind==='request'?s.status:s.done?'Done':s.status)||c.requestType&&c.requestType!==s.formId||c.outcome&&c.outcome!==s.outcome)return false;
  const snapshot=JSON.parse(event.data);
  if(event.trigger==='task.completed'&&!s.done||event.trigger==='task.status'&&snapshot.after&&taskStatus(snapshot.after)!==taskStatus(s)||event.trigger==='task.assigned'&&snapshot.after&&(JSON.stringify(snapshot.after.assigneeIds)!==JSON.stringify(s.assigneeIds)||(snapshot.after.accountableOwnerId||snapshot.after.assigneeIds?.[0])!==(s.accountableOwnerId||s.assigneeIds?.[0])))return false;
  if(event.trigger==='task.children'){const children=all("SELECT data FROM workspace_records WHERE organisation_id=? AND kind='task'",event.organisation_id).map(parse).filter(t=>t.parentTaskId===s.id);if(!children.length||children.some(t=>!t.done))return false;}
  if(event.trigger==='campaign.status'&&snapshot.after?.status!==s.status)return false;
  if(event.trigger==='campaign.budget'&&!(snapshot.before?.budget<rule.budgetThreshold&&snapshot.after?.budget>=rule.budgetThreshold))return false;
  if(event.trigger==='request.approved'&&!['Approved','Scheduled','In Progress','Completed'].includes(s.status))return false;
  if(event.trigger.startsWith('approval.')&&s.outcome!==(event.trigger==='approval.requested'?'Pending':event.trigger.slice(9).replace(/^./,c=>c.toUpperCase())))return false;
  if(['task.due','task.overdue'].includes(event.trigger)&&(s.done||!s.due))return false;
  return true;
 };
 const approval=(actor,task,approverId,stage,key)=>{
  if(!w.canWrite(actor,task)||!w.canRead(approverId,task)||!member(approverId,task.organisation_id))fail(403,'An approver must already have access to this task.');
  const current=one("SELECT * FROM workflow_approvals WHERE record_key=? AND source_version=? AND stage=? AND status='Pending'",task.record_key,task.version,stage);if(current){if(!JSON.parse(current.approver_ids).includes(approverId))fail(409,'This stage already has a different approver.');return current;}
  const id=randomUUID();run('INSERT INTO workflow_approvals(id,organisation_id,record_key,source_version,requested_by,approver_ids,stage,created_at) VALUES(?,?,?,?,?,?,?,?)',id,task.organisation_id,task.record_key,task.version,actor,JSON.stringify([approverId]),stage,now());notify(approverId,task.organisation_id,'task',task.external_id,key+':approval','Approval requested: '+stage);return one('SELECT * FROM workflow_approvals WHERE id=?',id);
 };
 const executeActions=(row,event,dry=false)=>{
  const rule=parse(row),org=row.organisation_id,actor=row.executor_id;requireManage(actor,org,rule.unitIds);w.assertWritable(org);let s=source(org,event.source_kind,event.source_id);
  if(!canSource(actor,org,event.source_kind,s))fail(403,'The rule executor no longer has access to the source.');if(!matches(rule,event,s))return {status:'Skipped',message:'Current source no longer matches the conditions.',actions:[]};
  const summaries=[],created=[];let requestWork=false;
  for(const [index,a] of rule.actions.entries()){
   s=source(org,event.source_kind,event.source_id);const task=s._row?.kind==='task'?s._row:null,recipient=a.userId||s.accountableOwnerId||s.deliveryOwnerId||s.assigneeIds?.[0]||actor;
   if(!canSource(recipient,org,event.source_kind,s))fail(403,'The chosen person does not already have source access.');
   const message=a.title||('Workflow: '+rule.name);summaries.push({action:a.type,title:message,recipient:one('SELECT name FROM users WHERE id=?',recipient)?.name||'Member'});
   if(['createTask','template'].includes(a.type)){
    if(event.source_kind==='request'&&s.converted)fail(409,'This request already has delivery work. Use a task or campaign follow-up rule instead.');if(event.source_kind==='request'&&(!s.deliveryOwnerId||!s.agreedDeadline))fail(400,'Save a Marketing delivery owner and agreed request deadline before generating automated delivery work.');
    let blueprint={};if(a.type==='template'){const t=rowFor(org,'template',a.templateId);if(!t||!w.canRead(actor,t)||!w.canRead(recipient,t))fail(403,'The task template is not accessible to the executor and recipient.');const templateUnits=w.result(t).unitIds,targetUnits=s.unitIds?.length?s.unitIds:rule.unitIds;if(templateUnits.length&&(!targetUnits.length||targetUnits.some(id=>!templateUnits.includes(id))))fail(403,'The template does not cover every destination brand.');blueprint=parse(t).blueprint;}
    const id=randomUUID(),data={...blueprint,id,title:a.title||blueprint.title||'Follow up: '+(s.title||s.name),description:blueprint.description||'Created by workflow '+rule.name,due:shiftedDate(dateToday(),a.days||0),done:false,status:'To do',priority:s.priority||'Medium',discipline:blueprint.discipline||s.discipline||'Marketing',campaign:event.source_kind==='campaign'?s.id:s.campaign||'',unitIds:s.unitIds?.length?s.unitIds:rule.unitIds,assigneeIds:[recipient],accountableOwnerId:recipient,visibility:'private',sharedWith:[recipient],plannerAllocated:true,checklist:(blueprint.checklist||[]).map(c=>({...c,id:randomUUID(),done:false}))};
    w.validateData(data,'task',org,actor,null);if(!dry){const saved=w.save(actor,org,'task',id,data,null,{workflowOrigin:row.id});created.push(saved);run('INSERT INTO workflow_task_sources VALUES(?,?,?,?,?)',saved.record_key,org,event.source_kind,event.source_id,'Workflow: '+rule.name);if(event.source_kind==='request'){run('INSERT INTO marketing_request_work VALUES(?,?,?,?)',s.id,saved.record_key,'task',id);requestWork=true;}}continue;
   }
   if(a.type==='notify'){if(!dry)notify(recipient,org,event.source_kind,event.source_id,event.id+':'+row.id+':'+index,message);continue;}
   if(!task)fail(400,'This action requires a live task.');if(!w.canWrite(actor,task))fail(403,'The rule executor cannot edit the task.');let d=w.result(task);
   if(a.type==='approval'){if(!dry)approval(actor,task,recipient,a.stage||'Marketing review',event.id+':'+row.id+':'+index);continue;}
   if(a.type==='assign')d={...d,assigneeIds:[...new Set([recipient,...(d.contributorIds||[]).filter(id=>id!==recipient)])],accountableOwnerId:recipient,contributorIds:(d.contributorIds||[]).filter(id=>id!==recipient)};
   if(a.type==='contributor')d={...d,assigneeIds:[...new Set([...d.assigneeIds,recipient])],contributorIds:[...new Set([...(d.contributorIds||[]),recipient])].filter(id=>id!==d.accountableOwnerId)};
   if(a.type==='status'){if(d.recurrence&&d.recurrence.mode!=='none'&&a.status==='Done')fail(400,'Complete recurring occurrences through the existing planner recurrence controls.');d={...d,status:a.status,done:a.status==='Done',completedAt:a.status==='Done'?now():undefined};}
   if(a.type==='reminder')d={...d,reminderAt:new Date(Date.now()+(a.days||0)*86400000).toISOString(),reminderTimeZone:d.reminderTimeZone||'Europe/London'};
   if(a.type==='list')d={...d,groupId:a.listId};
   w.validateData(d,'task',org,actor,task);if(!dry)w.save(actor,org,'task',d.id,d,task,{workflowOrigin:row.id});
  }
  if(!dry&&requestWork){const request=one('SELECT * FROM marketing_requests WHERE id=?',event.source_id),d=parse(request);run('UPDATE marketing_requests SET data=?,version=version+1 WHERE id=?',JSON.stringify({...d,converted:true,status:'Scheduled'}),request.id);run('INSERT INTO marketing_request_events VALUES(?,?,?,?,?,?,?)',randomUUID(),request.id,actor,one('SELECT name FROM users WHERE id=?',actor).name,'Delivery work generated by workflow: '+rule.name,0,now());requests.notifyUpdate(one('SELECT * FROM marketing_requests WHERE id=?',request.id),'workflow:'+event.id+':'+row.id,'Request scheduled: '+d.title);}
  return {status:'Succeeded',message:dry?'Dry run: no work or notifications were saved.':'Actions completed atomically.',actions:summaries};
 };
 const execute=(rule,event)=>{
  if(one('SELECT id FROM workflow_runs WHERE rule_id=? AND event_id=?',rule.id,event.id))return;
  try{w.transaction(()=>{const fresh=one('SELECT * FROM workflow_rules WHERE id=?',rule.id);if(!parse(fresh).enabled||fresh.enabled_at>event.created_at)return;const result=executeActions(fresh,event);run('INSERT INTO workflow_runs VALUES(?,?,?,?,?,?,?)',randomUUID(),rule.id,event.id,result.status,result.message,JSON.stringify(result.actions),now());});}
  catch(error){run('INSERT OR IGNORE INTO workflow_runs VALUES(?,?,?,?,?,?,?)',randomUUID(),rule.id,event.id,'Failed',error.status?error.message:'The workflow could not complete. No actions were saved.','[]',now());}
 };
 let processing=false;
 const tick=()=>{if(processing)return;processing=true;try{
  const rules=all('SELECT * FROM workflow_rules').filter(r=>parse(r).enabled);
  for(const row of rules){const rule=parse(row),org=row.organisation_id;if(rule.trigger==='scheduled'&&Date.parse(rule.scheduledAt)<=Date.now())emit(org,'scheduled','organisation',row.id,'schedule:'+row.id+':'+rule.scheduledAt,{},row.id);
   if(['task.due','task.overdue','campaign.ended'].includes(rule.trigger)){const kind=rule.trigger==='campaign.ended'?'campaign':'task';for(const r of all('SELECT * FROM workspace_records WHERE organisation_id=? AND kind=?',org,kind)){const d=w.result(r);if(d.archived||d.done||d.occurrenceOf||d.recurrence?.paused||!unitScope(rule,d.unitIds))continue;const due=kind==='task'?d.due:d.end;if(!due)continue;const ready=rule.trigger==='task.overdue'?due<dateToday():rule.trigger==='task.due'?due>=dateToday()&&due<=shiftedDate(dateToday(),rule.daysBefore):due<=dateToday();if(ready)emit(org,rule.trigger,kind,d.id,'due:'+row.id+':'+r.record_key+':'+due,{after:d},row.id);}}
  }
  for(const event of all('SELECT * FROM workflow_events WHERE processed=0 ORDER BY created_at,rowid LIMIT 100')){for(const row of rules)if(row.organisation_id===event.organisation_id&&parse(row).trigger===event.trigger&&(!event.target_rule||event.target_rule===row.id)&&row.enabled_at<=event.created_at)execute(row,event);run('UPDATE workflow_events SET processed=1 WHERE id=?',event.id);}
 }finally{processing=false}};
 const validateBook=(body,user,org)=>{if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Use a valid playbook.');
  const unitIds=w.validateUnits(user.id,org,body.unitIds||[]);requireManage(user.id,org,unitIds);const name=text(body.name,'playbook name',120),description=text(body.description,'playbook description',2000),brief=text(body.brief,'brief',5000),roles=strings(body.roles,20),phases=strings(body.phases,20),channels=strings(body.channels,30);
  if(!roles.length||!phases.length||!Array.isArray(body.tasks)||!body.tasks.length||body.tasks.length>80)fail(400,'Define roles, phases and between 1 and 80 tasks.');
  const keys=new Set(body.tasks.map(t=>t?.key));if(keys.size!==body.tasks.length)fail(400,'Use distinct task keys.');
  const tasks=body.tasks.map(t=>{if(!t||!/^[-a-zA-Z0-9_]{1,80}$/.test(t.key)||!Number.isInteger(t.offset)||t.offset< -730||t.offset>730||!roles.includes(t.role)||!phases.includes(t.phase)||t.channel&&!channels.includes(t.channel)||typeof t.milestone!=='boolean')fail(400,'Check task roles, phases, channels and relative days.');const dependsOn=strings(t.dependsOn,80);if(dependsOn.some(k=>!keys.has(k)||k===t.key)||t.parentKey&&(!keys.has(t.parentKey)||t.parentKey===t.key))fail(400,'Choose valid parent tasks and prerequisites.');return {key:t.key,title:text(t.title,'task title'),description:typeof t.description==='string'&&t.description.length<=5000?t.description:'',phase:t.phase,role:t.role,channel:t.channel||'',discipline:typeof t.discipline==='string'?t.discipline.slice(0,100):'Marketing',offset:t.offset,parentKey:t.parentKey||'',dependsOn,milestone:t.milestone,approvalStage:typeof t.approvalStage==='string'?t.approvalStage.slice(0,100):'',checklist:strings(t.checklist||[],30)};});
  const graphs=tasks.map(t=>({id:t.key,title:t.title,due:'',done:false,dependencyIds:t.dependsOn,parentTaskId:t.parentKey}));if(graphs.some(t=>completionCycle(graphs,t)))fail(400,'Task and parent dependencies cannot contain a cycle.');
  return {name,description,brief,unitIds,roles,phases,channels,tasks,objectives:strings(body.objectives||[],20),documents:strings(body.documents||[],30),kpis:strings(body.kpis||[],30),active:body.active!==false};
 };
 const seed=org=>{for(const b of initialPlaybooks){const id=org+':'+b.id;run('INSERT OR IGNORE INTO marketing_playbooks VALUES(?,?,?,1)',id,org,JSON.stringify({...b,id}));}};
 const validateRows=(rows,org,actor,config)=>{
  if(!Array.isArray(rows)||!rows.length||rows.length>80||rows.some(t=>!t||typeof t!=='object'))fail(400,'Preview between 1 and 80 tasks.');const selected=rows.filter(t=>t.include!==false),keys=new Set(selected.map(t=>t.key));if(!selected.length||keys.size!==selected.length)fail(400,'Include distinct task rows.');
  const byKey=new Map(rows.map(t=>[t.key,t])),resolve=(key,seen=new Set())=>{if(seen.has(key))fail(400,'Dependencies contain a cycle.');if(keys.has(key))return [key];seen.add(key);return (byKey.get(key)?.dependsOn||[]).flatMap(id=>resolve(id,new Set(seen)));};
  const normal=selected.map(t=>{
   if(!/^[-a-zA-Z0-9_]{1,80}$/.test(t.key)||!validTaskDate(t.due)||!member(t.ownerId,org))fail(400,'Check task dates and owners.');const unitIds=w.validateUnits(actor,org,t.unitIds||[]);if(unitIds.some(id=>!config.unitIds.includes(id))||!w.canUnits(t.ownerId,org,unitIds))fail(403,'A task owner lacks the selected brand access.');
   if(t.channel&&(!config.channels.includes(t.channel)||config.unitIds.length&&unitIds.some(id=>!JSON.parse(one('SELECT channels FROM business_units WHERE id=?',id).channels).includes(t.channel))))fail(400,'Do not include work for inactive or unselected channels.');
   return {...t,title:text(t.title,'task title'),unitIds,dependsOn:[...new Set(strings(t.dependsOn||[],80).flatMap(id=>resolve(id)))],parentKey:keys.has(t.parentKey)?t.parentKey:'',checklist:strings(t.checklist||[],30)};
  });
  const graphs=normal.map(t=>({id:t.key,title:t.title,done:false,due:t.due,parentTaskId:t.parentKey,dependencyIds:t.dependsOn}));if(graphs.some(t=>completionCycle(graphs,t)))fail(400,'Dependencies and subtasks contain a cycle.');
  for(const t of normal){for(const key of t.dependsOn){const p=normal.find(row=>row.key===key);if(!p)fail(400,'Choose existing preview prerequisites.');if(p.due>t.due)fail(400,'A prerequisite finishes after its dependent task. Adjust the preview dates.');}if(t.parentKey){const p=normal.find(row=>row.key===t.parentKey);if(p.unitIds.length!==t.unitIds.length||p.unitIds.some(id=>!t.unitIds.includes(id)))fail(400,'A subtask must use the same brands as its parent.');}}
  const ordered=[],pending=[...normal];while(pending.length){const index=pending.findIndex(t=>(!t.parentKey||ordered.some(p=>p.key===t.parentKey))&&t.dependsOn.every(id=>ordered.some(p=>p.key===id)));if(index<0)fail(400,'Tasks cannot be created in a safe dependency order.');ordered.push(...pending.splice(index,1));}return ordered;
 };
 async function handle({req,path,user,send,bodyOf}){
  if(!path.startsWith('/api/workflows/'))return false;if(!user)fail(401,'Sign in to use workflows.');tick();const url=new URL(req.url,'http://localhost'),org=url.searchParams.get('organisationId');
  const read=async()=>{const b=await bodyOf(req,1024*1024);if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Use a workflow object.');return b;};
  if(path==='/api/workflows/notifications'){
   if(req.method==='GET')return send(200,{notifications:all('SELECT * FROM workflow_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id).filter(n=>notificationAllowed(user.id,n.organisation_id)&&w.notificationReady(user.id,n.created_at)&&canSource(user.id,n.organisation_id,n.source_kind,source(n.organisation_id,n.source_kind,n.source_id))).map(n=>({id:n.id,title:n.title,createdAt:n.created_at,read:!!n.read_at,sourceKind:n.source_kind,sourceId:n.source_id,organisationId:n.organisation_id}))});
   if(req.method==='PUT'){const b=await read();run('UPDATE workflow_notifications SET read_at=? WHERE id=? AND user_id=?',now(),b.id,user.id);return send(200,{ok:true});}
  }
  if(!org||!member(user.id,org))fail(403,'Choose an organisation you belong to.');
  if(path==='/api/workflows/context'&&req.method==='GET'){
   requests.ensureForms(org);return send(200,{rules:all('SELECT * FROM workflow_rules WHERE organisation_id=?',org).filter(r=>manage(user.id,org,parse(r).unitIds)).map(ruleResult),playbooks:(seed(org),all('SELECT * FROM marketing_playbooks WHERE organisation_id=?',org).filter(r=>!parse(r).unitIds.length||w.canUnits(user.id,org,parse(r).unitIds)).map(bookResult)),members:all('SELECT users.id,users.name FROM memberships JOIN users ON users.id=memberships.user_id WHERE memberships.company_id=?',org),records:w.permittedRows(user.id,org).filter(r=>['task','campaign','template','group'].includes(r.kind)).map(r=>({kind:r.kind,...w.result(r)})),requestForms:all('SELECT id,data FROM marketing_request_forms WHERE organisation_id=?',org).map(f=>({id:f.id,name:parse(f).name})),canUsePlaybooks:canCreateWork(user.id,org,w.authorisedUnits(user.id,org,false).map(u=>u.id)),canManage:manage(user.id,org,w.authorisedUnits(user.id,org,false).map(u=>u.id))});
  }
  if(path==='/api/workflows/rules'&&['POST','PUT'].includes(req.method)){
   const b=await read(),d=validateRule(b,user,org);w.assertWritable(org);const existing=b.id?one('SELECT * FROM workflow_rules WHERE id=? AND organisation_id=?',b.id,org):null;if(b.id&&!existing)fail(404,'Rule not found.');if(existing){requireManage(user.id,org,parse(existing).unitIds);if(b.version!==existing.version)fail(409,'The rule changed. Refresh before saving.');}
   const id=existing?.id||randomUUID(),at=now();if(existing)run('UPDATE workflow_rules SET data=?,executor_id=?,version=version+1,enabled_at=? WHERE id=?',JSON.stringify(d),user.id,at,id);else run('INSERT INTO workflow_rules VALUES(?,?,?,?,1,?,?)',id,org,user.id,JSON.stringify(d),at,at);return send(existing?200:201,{rule:ruleResult(one('SELECT * FROM workflow_rules WHERE id=?',id))});
  }
  if(path==='/api/workflows/pause'&&req.method==='POST'){const b=await read(),row=one('SELECT * FROM workflow_rules WHERE id=? AND organisation_id=?',b.id,org);if(!row)fail(404,'Rule not found.');requireManage(user.id,org,parse(row).unitIds);w.assertWritable(org);if(row.version!==b.version)fail(409,'This rule changed. Refresh before pausing it.');run('UPDATE workflow_rules SET data=?,version=version+1 WHERE id=?',JSON.stringify({...parse(row),enabled:false}),row.id);return send(200,{ok:true});}
  if(path==='/api/workflows/test'&&req.method==='POST'){
   const b=await read(),d=validateRule(b.rule,user,org),kind=b.sourceKind,id=b.sourceId;if(!['task','campaign','request','approval','organisation'].includes(kind))fail(400,'Choose a source to test.');const s=source(org,kind,id);if(kind==='organisation'&&s)s.unitIds=d.unitIds;if(!canSource(user.id,org,kind,s))fail(404,'Test source not found.');
   const event={id:'test',organisation_id:org,trigger:d.trigger,source_kind:kind,source_id:id,data:JSON.stringify({before:{budget:0},after:cleanSource(s)})};let result;
   // Run the real action chain inside an unconditional rollback. Validation sees earlier test actions.
   db.exec('BEGIN IMMEDIATE');try{const testId=randomUUID();if(kind==='organisation'){run('INSERT INTO workflow_rules VALUES(?,?,?,?,1,?,?)',testId,org,user.id,JSON.stringify(d),now(),now());event.source_id=testId;}result=executeActions({id:testId,organisation_id:org,executor_id:user.id,data:JSON.stringify(d)},event);result.message='Dry run: no work, approvals, messages or logs were saved.';}finally{db.exec('ROLLBACK');}return send(200,{result});
  }
  if(path==='/api/workflows/history'&&req.method==='GET')return send(200,{runs:all('SELECT workflow_runs.*,workflow_events.source_kind,workflow_events.source_id,workflow_events.organisation_id FROM workflow_runs JOIN workflow_events ON workflow_events.id=workflow_runs.event_id WHERE workflow_events.organisation_id=? ORDER BY workflow_runs.created_at DESC LIMIT 200',org).filter(r=>{const rule=one('SELECT * FROM workflow_rules WHERE id=?',r.rule_id);return manage(user.id,org,parse(rule).unitIds)&&canSource(user.id,org,r.source_kind,source(org,r.source_kind,r.source_id));}).map(r=>({id:r.id,ruleName:parse(one('SELECT data FROM workflow_rules WHERE id=?',r.rule_id)).name,status:r.status,message:r.message,actions:JSON.parse(r.actions),at:r.created_at}))});
  if(path==='/api/workflows/approvals'){
   if(req.method==='GET')return send(200,{approvals:all('SELECT * FROM workflow_approvals WHERE organisation_id=? ORDER BY created_at DESC LIMIT 200',org).filter(a=>{const r=one('SELECT * FROM workspace_records WHERE record_key=?',a.record_key);return r&&w.canRead(user.id,r)&&(a.requested_by===user.id||JSON.parse(a.approver_ids).includes(user.id)||manage(user.id,org,w.result(r).unitIds));}).map(a=>{const r=one('SELECT * FROM workspace_records WHERE record_key=?',a.record_key);return {id:a.id,taskId:r.external_id,title:parse(r).title,stage:a.stage,status:a.status,reason:a.reason,approverNames:JSON.parse(a.approver_ids).map(id=>one('SELECT name FROM users WHERE id=?',id)?.name||'Former member'),canDecide:a.status==='Pending'&&r.version===a.source_version&&JSON.parse(a.approver_ids).includes(user.id),stale:r.version!==a.source_version,createdAt:a.created_at};})});
   if(req.method==='POST'){const b=await read(),task=rowFor(org,'task',b.taskId);if(!task||!w.canRead(user.id,task))fail(404,'Task not found.');w.assertWritable(org);if(task.version!==b.version)fail(409,'The task changed. Refresh before requesting approval.');const a=w.transaction(()=>approval(user.id,task,b.approverId,text(b.stage,'approval stage',100),'manual:'+randomUUID()));emit(org,'approval.requested','approval',a.id,'approval:'+a.id+':requested');return send(201,{id:a.id});}
   if(req.method==='PUT'){const b=await read(),a=one('SELECT * FROM workflow_approvals WHERE id=? AND organisation_id=?',b.id,org),task=a?one('SELECT * FROM workspace_records WHERE record_key=?',a.record_key):null;if(!a||!task||!w.canRead(user.id,task)||!JSON.parse(a.approver_ids).includes(user.id))fail(403,'Only a named approver with current task access can decide.');w.assertWritable(org);if(!['Granted','Rejected'].includes(b.outcome)||a.status!=='Pending'||task.version!==a.source_version)fail(409,'The approval or task changed. Request a new approval for the current task.');const reason=typeof b.reason==='string'&&b.reason.length<=2000?b.reason:'';w.transaction(()=>{run('UPDATE workflow_approvals SET status=?,decision_by=?,reason=?,decided_at=? WHERE id=?',b.outcome,user.id,reason,now(),a.id);emit(org,'approval.'+b.outcome.toLowerCase(),'approval',a.id,'approval:'+a.id+':'+b.outcome);});return send(200,{ok:true});}
  }
  if(path==='/api/workflows/playbooks'&&['POST','PUT'].includes(req.method)){
   const b=await read(),d=validateBook(b,user,org);w.assertWritable(org);const old=b.id?one('SELECT * FROM marketing_playbooks WHERE id=? AND organisation_id=?',b.id,org):null;if(b.id&&!old)fail(404,'Playbook not found.');if(old){requireManage(user.id,org,parse(old).unitIds);if(old.version!==b.version)fail(409,'This playbook changed. Refresh before saving.');}const id=old?.id||randomUUID();if(old)run('UPDATE marketing_playbooks SET data=?,version=version+1 WHERE id=?',JSON.stringify(d),id);else run('INSERT INTO marketing_playbooks VALUES(?,?,?,1)',id,org,JSON.stringify(d));return send(old?200:201,{playbook:bookResult(one('SELECT * FROM marketing_playbooks WHERE id=?',id))});
  }
  if(path==='/api/workflows/capture'&&req.method==='POST'){
   const b=await read(),campaign=rowFor(org,'campaign',b.campaignId);if(!campaign||!w.canRead(user.id,campaign))fail(404,'Campaign not found.');const c=w.result(campaign);requireManage(user.id,org,c.unitIds);w.assertWritable(org);
   const tasks=w.permittedRows(user.id,org,'task').map(w.result).filter(t=>t.campaign===c.id&&!t.occurrenceOf&&!t.archived);if(!tasks.length||tasks.length>80)fail(400,'Capture a campaign containing between one and eighty accessible tasks.');const ids=new Map(tasks.map((t,i)=>[t.id,'task-'+i])),roles=[...new Set(tasks.map(t=>t.accountableOwnerId||t.assigneeIds[0]))].map((id,i)=>({id,role:'Owner role '+(i+1)}));
   const dayOffset=d=>Math.round((Date.parse(d+'T12:00:00Z')-Date.parse(c.end+'T12:00:00Z'))/86400000);
   const book=validateBook({name:b.name||c.name+' playbook',description:'Reusable workflow captured from '+c.name,brief:'Adapt the original campaign purpose, audience and objectives before creating new work.',unitIds:c.unitIds,objectives:c.objectives||[],channels:[...new Set(tasks.map(t=>t.channel).filter(Boolean))],phases:['Delivery'],roles:roles.map(r=>r.role),documents:[],kpis:[],active:true,tasks:tasks.map(t=>({key:ids.get(t.id),title:t.title,description:'',phase:'Delivery',role:roles.find(r=>r.id===(t.accountableOwnerId||t.assigneeIds[0])).role,channel:t.channel||'',discipline:t.discipline||'Marketing',offset:t.due?dayOffset(t.due):0,parentKey:ids.get(t.parentTaskId)||'',dependsOn:(t.dependencyIds||[]).map(id=>ids.get(id)).filter(Boolean),milestone:!!t.milestone,approvalStage:'',checklist:(t.checklist||[]).map(c=>c.title)}))},user,org);
   const id=randomUUID();run('INSERT INTO marketing_playbooks VALUES(?,?,?,1)',id,org,JSON.stringify(book));return send(201,{playbook:bookResult(one('SELECT * FROM marketing_playbooks WHERE id=?',id))});
  }
  if(path==='/api/workflows/preview'&&req.method==='POST'){
   const b=await read(),book=one('SELECT * FROM marketing_playbooks WHERE id=? AND organisation_id=?',b.playbookId,org);if(!book||!parse(book).active||parse(book).unitIds.length&&!w.canUnits(user.id,org,parse(book).unitIds))fail(404,'Playbook not found.');const units=w.validateUnits(user.id,org,b.unitIds||[]);if(!canCreateWork(user.id,org,units))fail(403,'Your role cannot create work for these brands.');w.assertWritable(org);if(parse(book).unitIds.length&&(!units.length||units.some(id=>!parse(book).unitIds.includes(id))))fail(403,'Choose brands covered by this playbook.');
   const channels=strings(b.channels||[],30),stages=strings(b.stages||[],20),roles=b.roles;if(!roles||typeof roles!=='object'||Array.isArray(roles)||Object.values(roles).some(id=>typeof id!=='string'||!member(id,org)))fail(400,'Assign each role to an organisation member.');
   const active=w.authorisedUnits(user.id,org,false);if(channels.some(c=>!parse(book).channels.includes(c)||units.length&&!units.some(id=>active.find(u=>u.id===id)?.channels.includes(c))))fail(400,'Choose channels active for the selected brands.');if(stages.some(s=>!parse(book).tasks.some(t=>t.approvalStage===s)))fail(400,'Choose approval stages from this playbook.');
   const config={name:text(b.name,'campaign name'),product:typeof b.product==='string'?b.product.slice(0,180):'',anchor:b.anchor,unitIds:units,channels,stages,roles};let proposed;try{proposed=proposePlaybook(bookResult(book),config,active)}catch(error){fail(400,error.message)}const rows=validateRows(proposed,org,user.id,config),id=randomUUID();run('DELETE FROM playbook_previews WHERE expires_at<? AND applied_campaign IS NULL',now());run('INSERT INTO playbook_previews VALUES(?,?,?,?,?,?,?,?,NULL)',id,user.id,org,book.id,book.version,JSON.stringify(config),JSON.stringify(rows),new Date(Date.now()+30*60000).toISOString());return send(200,{token:id,rows,config});
  }
  if(path==='/api/workflows/apply'&&req.method==='POST'){
   const b=await read();const result=w.transaction(()=>{const plan=one('SELECT * FROM playbook_previews WHERE id=? AND user_id=? AND organisation_id=?',b.token,user.id,org);if(!plan||plan.expires_at<now()||plan.applied_campaign)fail(409,'This preview expired or has already been applied.');const book=one('SELECT * FROM marketing_playbooks WHERE id=?',plan.playbook_id);if(!book||book.version!==plan.playbook_version||!parse(book).active)fail(409,'The playbook changed. Preview it again.');const config=JSON.parse(plan.config);if(!canCreateWork(user.id,org,config.unitIds))fail(403,'Your role cannot create work for these brands.');w.validateUnits(user.id,org,config.unitIds);if(parse(book).unitIds.length&&!w.canUnits(user.id,org,parse(book).unitIds))fail(403,'Playbook access changed.');w.assertWritable(org);
    const rows=validateRows(b.rows,org,user.id,config),campaignId=randomUUID(),ids=new Map(rows.map(t=>[t.key,randomUUID()])),metadata=parse(book);
    const campaign=w.save(user.id,org,'campaign',campaignId,{id:campaignId,name:config.name,category:'Playbook · '+metadata.name,status:'Planning',budget:0,end:config.anchor,unitIds:config.unitIds,brief:metadata.brief,objectives:metadata.objectives,kpis:metadata.kpis,requiredDocuments:metadata.documents,product:config.product,playbookId:book.id},null);
    const created=[];for(const t of rows){const id=ids.get(t.key),task=w.save(user.id,org,'task',id,{id,title:t.title,description:t.description||'',due:t.due,done:false,status:'To do',campaign:campaignId,unitIds:t.unitIds,assigneeIds:[t.ownerId],accountableOwnerId:t.ownerId,parentTaskId:ids.get(t.parentKey)||'',dependencyIds:t.dependsOn.map(k=>ids.get(k)),discipline:t.discipline||'Marketing',channel:t.channel||'',priority:'Medium',milestone:!!t.milestone,plannerAllocated:true,checklist:t.checklist.map(title=>({id:randomUUID(),title,done:false})),customFields:[{id:'phase',name:'Playbook phase',type:'text',value:t.phase},{id:'role',name:'Recommended role',type:'text',value:t.role}]},null);created.push(w.result(task));run('INSERT INTO workflow_task_sources VALUES(?,?,?,?,?)',task.record_key,org,'campaign',campaignId,'Playbook: '+metadata.name);if(t.approvalStage)approval(user.id,task,t.ownerId,t.approvalStage,'playbook:'+plan.id+':'+id);}
    run('UPDATE playbook_previews SET applied_campaign=? WHERE id=?',campaignId,plan.id);return {campaign:w.result(campaign),tasks:created};});return send(201,result);
  }
  if(path==='/api/workflows/task'&&req.method==='GET'){
   const task=rowFor(org,'task',url.searchParams.get('taskId'));if(!task||!w.canRead(user.id,task))fail(404,'Task not found.');return send(200,{source:one('SELECT source_kind,source_id,label FROM workflow_task_sources WHERE record_key=?',task.record_key)||null,approvals:all('SELECT id,stage,status,source_version FROM workflow_approvals WHERE record_key=? ORDER BY created_at DESC',task.record_key).map(a=>({...a,stale:a.source_version!==task.version}))});
  }
  fail(404,'Workflow endpoint not found.');
 }
 const timer=setInterval(()=>{try{tick()}catch{/* Pending durable events are retried by the next worker pass. */}},15000);timer.unref();
 return {handle,tick,close:()=>clearInterval(timer)};
}
