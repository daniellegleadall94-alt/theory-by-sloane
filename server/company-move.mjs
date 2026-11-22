import {createHash,randomUUID} from 'node:crypto';
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const referenceFields=new Set(['campaign','campaignId','groupId','parentId','parentTaskId','occurrenceOf','dependencyIds','taskIds','actionTaskIds','campaignIds','objectiveIds','goals','overviewId','strategyId','objectiveId','kpiId','budgetId','supplierId','resourceId','assetIds','fileIds','accountId','reviewTaskId','reviewEventId']);
function references(value,result=[]){if(!value||typeof value!=='object')return result;for(const [key,item] of Object.entries(value)){if(referenceFields.has(key)){if(typeof item==='string'&&item)result.push(item);else if(Array.isArray(item))result.push(...item.filter(v=>typeof v==='string'))}else if(item&&typeof item==='object')references(item,result)}return result}
const peopleFields=new Set(['accountableOwnerId','accountOwnerId','contributorIds','followerIds','sharedWith','authorisedUserIds','responsibleUserIds','attendeeIds']);
function people(value){return Object.entries(value).filter(([key])=>peopleFields.has(key)).flatMap(([,item])=>Array.isArray(item)?item:typeof item==='string'&&item?[item]:[])}

export function createCompanyMoves(db,workspace,{audit}={}){
 const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args),exists=table=>!!one("SELECT name FROM sqlite_master WHERE type='table' AND name=?",table);
 function inspect(user,source,target,unitId){
  for(const org of [source,target]){const membership=workspace.member(user.id,org);if(!membership||!['owner','admin'].includes(membership.role))fail(403,'You must be an owner or administrator in both organisations.');workspace.assertWritable(org);if(!one('SELECT id FROM companies WHERE id=? AND archived=0',org))fail(400,'Choose active organisations.')}
  if(source===target)fail(400,'Choose a different organisation.');
  const unit=one('SELECT * FROM business_units WHERE id=? AND organisation_id=?',unitId,source);if(!unit)fail(404,'Company not found.');
  const blockers=[];
  if(unit.parent_id||one('SELECT id FROM business_units WHERE parent_id=?',unitId))blockers.push('Remove legacy parent-company links before moving this company.');
  if(one('SELECT id FROM business_units WHERE organisation_id=? AND lower(name)=lower(?) AND archived=0',target,unit.name))blockers.push('The destination already has an active company with this name.');
  const sourceRecords=all('SELECT * FROM workspace_records WHERE organisation_id=? ORDER BY record_key',source),records=sourceRecords.filter(row=>one('SELECT record_key FROM record_units WHERE record_key=? AND unit_id=?',row.record_key,unitId)),keys=new Set(records.map(row=>row.record_key)),ids=new Set(records.map(row=>row.external_id)),groups=[];
  if(records.some(row=>all('SELECT unit_id FROM record_units WHERE record_key=?',row.record_key).some(item=>item.unit_id!==unitId)))blockers.push('Some records belong to multiple companies. Separate those shared records before moving this company.');
  const groupById=new Map(sourceRecords.filter(row=>row.kind==='group').map(row=>[row.external_id,row]));
  const addGroup=id=>{if(!id||ids.has(id)||groups.some(row=>row.external_id===id))return;const row=groupById.get(id);if(!row)return;groups.push(row);addGroup(JSON.parse(row.data).parentId)};
  for(const row of records)if(row.kind==='task')addGroup(JSON.parse(row.data).groupId);
  const movingIds=new Set([...ids,...groups.map(row=>row.external_id)]);
  if(records.some(row=>references(JSON.parse(row.data)).some(id=>!movingIds.has(id)&&sourceRecords.some(record=>record.external_id===id))))blockers.push('Some moving records link to work that is staying in the source organisation. Detach or move those linked records first.');
  if(sourceRecords.some(row=>!keys.has(row.record_key)&&references(JSON.parse(row.data)).some(id=>ids.has(id))))blockers.push('Work remaining in the source organisation links to these records. Resolve those links before moving.');
  for(const row of [...records,...groups])if(one('SELECT record_key FROM workspace_records WHERE scope=? AND kind=? AND external_id=?','org:'+target,row.kind,row.external_id)){blockers.push('A record with the same identifier already exists in the destination.');break}
  const targetMembers=all('SELECT * FROM memberships WHERE company_id=? ORDER BY user_id',target),targetIds=new Set(targetMembers.map(member=>member.user_id)),sourceMembers=all('SELECT * FROM memberships WHERE company_id=? ORDER BY user_id',source);
  const requiredPeople=new Set([...people(JSON.parse(unit.settings||'{}')),...[...records,...groups].flatMap(row=>[row.owner_id,...people(JSON.parse(row.data)),...all('SELECT user_id FROM record_assignments WHERE record_key=?',row.record_key).map(a=>a.user_id)])]);
  if(exists('asset_review_runs'))for(const row of records)for(const review of all('SELECT stages FROM asset_review_runs WHERE record_key=?',row.record_key))for(const stage of JSON.parse(review.stages))requiredPeople.add(stage.approverId);
  const notes=all('SELECT * FROM notes WHERE company_id=? ORDER BY id',source).filter(note=>JSON.parse(note.data).unitIds?.includes(unitId));
  if(notes.some(note=>JSON.parse(note.data).unitIds.some(id=>id!==unitId)))blockers.push('Some notes belong to multiple companies. Separate those associations before moving.');
  for(const note of notes)requiredPeople.add(note.owner_id);
  const missing=[...requiredPeople].filter(id=>!targetIds.has(id));if(missing.length)blockers.push(`${missing.length} record owners, assignees or named collaborators are not members of the destination. Add them there or reassign their work before moving.`);
  if(records.some(row=>JSON.parse(row.data).permissionGroupIds?.length))blockers.push('Some account records use organisation permission groups. Replace those group grants with appropriate named access before moving.');
  if(exists('marketing_request_work')&&records.some(row=>one('SELECT request_id FROM marketing_request_work WHERE record_key=?',row.record_key)))blockers.push('Some work is linked to marketing requests. Request ownership must be resolved before this company can move.');
  if(exists('workflow_task_sources')&&records.some(row=>one("SELECT record_key FROM workflow_task_sources WHERE record_key=? AND source_kind='request'",row.record_key)))blockers.push('Request-linked workflow work must stay with its request.');
  const approvals=exists('workflow_approvals')?all('SELECT * FROM workflow_approvals WHERE organisation_id=? ORDER BY id',source).filter(row=>keys.has(row.record_key)):[];
  if(approvals.some(row=>JSON.parse(row.approver_ids).some(id=>!targetIds.has(id))))blockers.push('An approval names someone outside the destination organisation. Resolve that approval before moving.');
  const sourceAccess=sourceMembers.filter(member=>workspace.canUnits(member.user_id,source,[unitId])).map(member=>member.user_id),retained=sourceAccess.filter(id=>targetIds.has(id)),targetAccess=targetMembers.filter(member=>['owner','admin'].includes(member.role)||member.access_scope==='all'||retained.includes(member.user_id)).map(member=>member.user_id);
  const removedGrants=records.flatMap(row=>all('SELECT user_id FROM record_grants WHERE record_key=?',row.record_key).filter(grant=>!targetIds.has(grant.user_id))),removedShares=notes.flatMap(note=>all('SELECT user_id FROM note_shares WHERE note_id=?',note.id).filter(share=>!targetIds.has(share.user_id)));
  const counts=Object.fromEntries([...new Set(records.map(row=>row.kind))].map(kind=>[kind,records.filter(row=>row.kind===kind).length]));
  const fingerprint={actor:user.id,unit,target,sourceRecords,groups,notes,sourceMembers,targetMembers,approvals,grants:all('SELECT * FROM business_grants WHERE unit_id=? ORDER BY user_id',unitId),assignments:[...records,...groups].map(row=>[row.record_key,all('SELECT user_id FROM record_assignments WHERE record_key=? ORDER BY user_id',row.record_key)]),recordGrants:records.map(row=>[row.record_key,all('SELECT user_id FROM record_grants WHERE record_key=? ORDER BY user_id',row.record_key)]),noteShares:notes.map(note=>[note.id,all('SELECT user_id FROM note_shares WHERE note_id=? ORDER BY user_id',note.id)]),destination:all('SELECT kind,external_id,version FROM workspace_records WHERE organisation_id=? ORDER BY record_key',target)};
  const ticket=createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
  return {unit,records,groups,notes,retained,targetIds,approvals,ticket,preview:{ticket,companyName:unit.name,sourceName:one('SELECT name FROM companies WHERE id=?',source).name,targetName:one('SELECT name FROM companies WHERE id=?',target).name,counts,notes:notes.length,copiedLists:groups.length,losingAccess:sourceAccess.filter(id=>!targetAccess.includes(id)).length,gainingAccess:targetAccess.filter(id=>!sourceAccess.includes(id)).length,removedIndividualShares:removedGrants.length+removedShares.length,blockers:[...new Set(blockers)]}};
 }
 return {async handle({req,path,user,bodyOf,send}){
  const route=path.match(/^\/api\/organisations\/([^/]+)\/units\/([^/]+)\/(move-preview|move)$/);if(!route||req.method!=='POST')return false;
  const [,source,unitId,action]=route,body=await bodyOf(req);if(typeof body.targetOrganisationId!=='string')fail(400,'Choose a destination organisation.');const target=body.targetOrganisationId;
  if(action==='move-preview')return send(200,{preview:inspect(user,source,target,unitId).preview});
  if(body.confirm!==true)fail(400,'Review and confirm the company move first.');
  const outcome=workspace.transaction(()=>{
   const plan=inspect(user,source,target,unitId);if(body.ticket!==plan.ticket)fail(409,'The company, work or permissions changed. Review a fresh move preview.');if(plan.preview.blockers.length)fail(409,plan.preview.blockers.join(' '));
   const at=new Date().toISOString();
   run('DELETE FROM business_grants WHERE unit_id=?',unitId);
   run('UPDATE business_units SET organisation_id=?,parent_id=NULL,sort_order=? WHERE id=?',target,one('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM business_units WHERE organisation_id=?',target).n,unitId);
   for(const id of plan.retained)run('INSERT INTO business_grants(user_id,organisation_id,unit_id) VALUES(?,?,?)',id,target,unitId);
   for(const group of [...plan.groups].reverse()){
    const data={...JSON.parse(group.data),unitIds:[unitId]},key=randomUUID();
    run('INSERT INTO workspace_records(record_key,scope,organisation_id,personal_user_id,kind,external_id,owner_id,data,version,updated_at) VALUES(?,?,?,NULL,?,?,?,?,1,?)',key,'org:'+target,target,group.kind,group.external_id,group.owner_id,JSON.stringify(data),at);
    run('INSERT INTO record_units VALUES(?,?)',key,unitId);for(const assignment of all('SELECT user_id FROM record_assignments WHERE record_key=?',group.record_key))run('INSERT INTO record_assignments VALUES(?,?)',key,assignment.user_id);
    run('INSERT INTO record_versions VALUES(?,?,?,?)',key,1,JSON.stringify(data),at);
   }
   for(const row of plan.records){
    run('UPDATE workspace_records SET organisation_id=?,scope=?,version=version+1,updated_at=? WHERE record_key=?',target,'org:'+target,at,row.record_key);
    const data={...JSON.parse(row.data),organisationId:target};if(row.kind==='account'&&data.associatedOrganisationId===source)data.associatedOrganisationId=target;if(typeof data.workspace==='string'&&data.workspace.endsWith(':'+source))data.workspace=data.workspace.slice(0,-source.length)+target;if(typeof data.strategyLink==='string'&&data.strategyLink.startsWith('/?strategyOrg='+source+'&strategyEntity='+unitId+'&')){const old=data.strategyLink;data.strategyLink=old.replace('/?strategyOrg='+source+'&','/?strategyOrg='+target+'&');for(const field of ['description','notes'])if(typeof data[field]==='string')data[field]=data[field].replaceAll(old,data.strategyLink)}run('UPDATE workspace_records SET data=? WHERE record_key=?',JSON.stringify(data),row.record_key);
    run('INSERT INTO record_versions VALUES(?,?,?,?)',row.record_key,row.version+1,JSON.stringify({...data,unitIds:[unitId],assigneeIds:all('SELECT user_id FROM record_assignments WHERE record_key=?',row.record_key).map(item=>item.user_id)}),at);
    for(const grant of all('SELECT user_id FROM record_grants WHERE record_key=?',row.record_key))if(!plan.targetIds.has(grant.user_id))run('DELETE FROM record_grants WHERE record_key=? AND user_id=?',row.record_key,grant.user_id);
    if(row.kind==='task')run('INSERT INTO task_activity VALUES(?,?,?,?,?,?,?)',randomUUID(),row.record_key,user.id,user.name,'Company moved to another organisation',JSON.stringify(['organisationId']),at);
    if(exists('workflow_approvals'))run('UPDATE workflow_approvals SET organisation_id=? WHERE record_key=?',target,row.record_key);
    if(exists('workflow_task_sources'))run('UPDATE workflow_task_sources SET organisation_id=? WHERE record_key=?',target,row.record_key);
   }
   for(const note of plan.notes){run('UPDATE notes SET company_id=?,version=version+1 WHERE id=?',target,note.id);for(const share of all('SELECT user_id FROM note_shares WHERE note_id=?',note.id))if(!plan.targetIds.has(share.user_id))run('DELETE FROM note_shares WHERE note_id=? AND user_id=?',note.id,share.user_id)}
   audit?.(user.id,source,'Moved company '+unitId+' to organisation '+target);audit?.(user.id,target,'Received company '+unitId+' from organisation '+source);
   return plan.preview;
  });return send(200,{ok:true,moved:outcome});
 }};
}
