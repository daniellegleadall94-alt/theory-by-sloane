import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,basename,dirname} from 'node:path';
import {createCompanyApi} from '../server/company-api.mjs';
import {initialPlaybooks,proposePlaybook} from '../src/workflows.ts';

async function fixture(databasePath=':memory:'){
 const api=createCompanyApi({databasePath}),server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const call=async(cookie,path,method='GET',body)=>{const r=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const register=(email,extra={})=>call('','auth/register','POST',{name:email.split('@')[0],email,password:'A strong workflow test password',...extra});
 return {api,call,register,close:async()=>{await new Promise(resolve=>server.close(resolve));api.close()}};
}
const rule=(extra={})=>({name:'Creative approval',unitIds:[],enabled:true,trigger:'task.status',conditions:{status:'In review'},daysBefore:3,budgetThreshold:0,scheduledAt:'',actions:[{type:'notify',title:'Ready for review'}],...extra});

test('Rule dry runs roll back; task status → assignment → approval and notification runs once without chaining',async()=>{
 const f=await fixture();const {call,register,api}=f;
 try{
  const owner=await register('owner@workflow.test',{companyName:'Workflows'}),org=owner.body.user.company.id,cookie=owner.cookie,root='organisations/'+org;
  const invitation=await call(cookie,'company-invitations','POST',{email:'approver@workflow.test'}),approver=await register('approver@workflow.test',{invite:invitation.body.code}),aid=approver.body.user.id;
  const other=await register('other@workflow.test',{companyName:'Other'});
  let task=(await call(cookie,root+'/data/task','POST',{id:'artwork',title:'Artwork',due:'2026-12-01',status:'In review',done:false})).body.record;
  const draft=rule({enabled:false,actions:[{type:'assign',userId:aid},{type:'approval',userId:aid,stage:'Creative sign-off'},{type:'notify',userId:aid,title:'Ready for approval'}]});
  const testRule=await call(cookie,'workflows/test?organisationId='+org,'POST',{rule:draft,sourceKind:'task',sourceId:task.id});assert.equal(testRule.status,200,JSON.stringify(testRule.body));assert.equal(testRule.body.result.status,'Succeeded');
  assert.equal((await call(cookie,root+'/data/task/'+task.id)).body.record.version,task.version);assert.equal((await call(cookie,'workflows/approvals?organisationId='+org)).body.approvals.length,0);assert.equal((await call(approver.cookie,'workflows/notifications')).body.notifications.length,0);
  let saved=await call(cookie,'workflows/rules?organisationId='+org,'POST',{...draft,enabled:true});assert.equal(saved.status,201,JSON.stringify(saved.body));const id=saved.body.rule.id;
  const downstream=await call(cookie,'workflows/rules?organisationId='+org,'POST',rule({name:'Must not chain',trigger:'task.assigned',conditions:{},actions:[{type:'createTask',title:'Should not exist'}]}));assert.equal(downstream.status,201);
  task=(await call(cookie,root+'/data/task/'+task.id,'PUT',{...task,status:'To do'})).body.record;task=(await call(cookie,root+'/data/task/'+task.id,'PUT',{...task,status:'In review'})).body.record;api.runWorkflows();api.runWorkflows();
  task=(await call(cookie,root+'/data/task/'+task.id)).body.record;assert.equal(task.accountableOwnerId,aid);assert.equal(task.status,'In review');
  const approvals=await call(approver.cookie,'workflows/approvals?organisationId='+org);assert.equal(approvals.body.approvals.length,1);const approval=approvals.body.approvals[0];assert.equal(approval.canDecide,true);
  assert.ok((await call(approver.cookie,'workflows/notifications')).body.notifications.some(n=>n.title==='Ready for approval'));
  assert.equal((await call(cookie,root+'/data/task')).body.records.length,1);const history=(await call(cookie,'workflows/history?organisationId='+org)).body.runs;assert.equal(history.filter(r=>r.ruleName==='Creative approval'&&r.status==='Succeeded').length,1);
  assert.equal((await call(other.cookie,'workflows/context?organisationId='+org)).status,403);assert.equal((await call(approver.cookie,'workflows/rules?organisationId='+org,'POST',draft)).status,403);
  assert.equal((await call(cookie,'workflows/approvals?organisationId='+org,'PUT',{id:approval.id,outcome:'Granted'})).status,403);
  const grantedRule=await call(cookie,'workflows/rules?organisationId='+org,'POST',rule({name:'Publication notification',trigger:'approval.granted',conditions:{outcome:'Granted'},actions:[{type:'notify',userId:aid,title:'Approved for scheduling'}]}));assert.equal(grantedRule.status,201);
  assert.equal((await call(approver.cookie,'workflows/approvals?organisationId='+org,'PUT',{id:approval.id,outcome:'Granted',reason:'Brand checks complete'})).status,200);api.runWorkflows();assert.ok((await call(approver.cookie,'workflows/notifications')).body.notifications.some(n=>n.title==='Approved for scheduling'));
  assert.equal((await call(approver.cookie,'workflows/approvals?organisationId='+org,'PUT',{id:approval.id,outcome:'Granted'})).status,409);
  const approvedTask=(await call(approver.cookie,root+'/data/task/'+task.id)).body.record;assert.equal((await call(approver.cookie,root+'/data/task/'+task.id+'/actions','POST',{version:approvedTask.version,action:'complete'})).status,200);
  saved=(await call(cookie,'workflows/context?organisationId='+org)).body.rules.find(r=>r.id===id);assert.equal((await call(cookie,'workflows/rules?organisationId='+org,'PUT',{...saved,enabled:false})).status,200);
 }finally{await f.close()}
});

test('Product launch preview filters channels, preserves dependencies, creates canonical assigned tasks once, and supports custom/captured playbooks',async()=>{
 const f=await fixture();const {call,register}=f;
 try{
  const owner=await register('owner@launch.test',{companyName:'Launch Company'}),org=owner.body.user.company.id,cookie=owner.cookie,uid=owner.body.user.id,root='organisations/'+org;
  const brand=(await call(cookie,root+'/units','POST',{name:'Launch brand',kind:'Brand',channels:['Website','Email']})).body.unit;
  const context=await call(cookie,'workflows/context?organisationId='+org);assert.equal(context.status,200);assert.equal(context.body.playbooks.length,12);const book=context.body.playbooks.find(b=>b.name==='Product Launch');
  const config={playbookId:book.id,name:'New product launch',product:'New product',anchor:'2026-12-01',unitIds:[brand.id],channels:['Website','Email'],stages:['Brand sign-off'],roles:Object.fromEntries(book.roles.map(role=>[role,uid]))};
  assert.equal((await call(cookie,'workflows/preview?organisationId='+org,'POST',{...config,channels:['LinkedIn']})).status,400);
  const preview=await call(cookie,'workflows/preview?organisationId='+org,'POST',config);assert.equal(preview.status,200,JSON.stringify(preview.body));assert.ok(!preview.body.rows.some(t=>t.channel==='LinkedIn'||t.channel==='PR'||t.key==='legal'));assert.equal(preview.body.rows.find(t=>t.key==='brief').due,'2026-10-20');
  assert.equal((await call(cookie,root+'/data/task')).body.records.length,0);
  const cycle=structuredClone(preview.body.rows);cycle.find(t=>t.key==='brief').dependsOn=['review'];assert.equal((await call(cookie,'workflows/apply?organisationId='+org,'POST',{token:preview.body.token,rows:cycle})).status,400);assert.equal((await call(cookie,root+'/data/campaign')).body.records.length,0);
  const rows=preview.body.rows.map(t=>t.key==='website'?{...t,title:'Publish the confirmed product page'}:t);
  const applied=await call(cookie,'workflows/apply?organisationId='+org,'POST',{token:preview.body.token,rows});assert.equal(applied.status,201,JSON.stringify(applied.body));assert.equal(applied.body.campaign.end,config.anchor);assert.equal(applied.body.campaign.product,'New product');assert.equal(applied.body.tasks.length,rows.length);assert.ok(applied.body.tasks.every(t=>t.accountableOwnerId===uid&&t.campaign===applied.body.campaign.id&&t.plannerAllocated));
  const parent=applied.body.tasks.find(t=>t.title==='Complete the launch creative package'),child=applied.body.tasks.find(t=>t.title==='Write launch copy and check claims');assert.equal(child.parentTaskId,parent.id);assert.ok(applied.body.tasks.find(t=>t.title==='Publish the confirmed product page').dependencyIds.length);
  assert.equal((await call(cookie,'workflows/apply?organisationId='+org,'POST',{token:preview.body.token,rows})).status,409);assert.equal((await call(cookie,'my-work')).body.tasks.length,rows.length);
  assert.ok((await call(cookie,'workflows/approvals?organisationId='+org)).body.approvals.length);
  const copy=await call(cookie,'workflows/playbooks?organisationId='+org,'POST',{...book,id:undefined,name:'Our launch approach',unitIds:[brand.id]});assert.equal(copy.status,201,JSON.stringify(copy.body));assert.equal((await call(cookie,'workflows/playbooks?organisationId='+org,'PUT',{...copy.body.playbook,description:'Updated approach'})).status,200);
  const capture=await call(cookie,'workflows/capture?organisationId='+org,'POST',{campaignId:applied.body.campaign.id,name:'Repeat this launch'});assert.equal(capture.status,201,JSON.stringify(capture.body));assert.equal(capture.body.playbook.tasks.length,rows.length);assert.ok(capture.body.playbook.tasks.every(t=>!t.description));
  for(const preset of initialPlaybooks){const proposed=proposePlaybook(preset,{anchor:'2026-12-01',channels:preset.channels,stages:[...new Set(preset.tasks.map(t=>t.approvalStage).filter(Boolean))],roles:Object.fromEntries(preset.roles.map(role=>[role,uid])),unitIds:[]},[]);assert.ok(proposed.length>0,preset.name);}
 }finally{await f.close()}
});

test('Failed actions roll back, current permissions and stale approvals are enforced, deadlines deduplicate, recurring history is ignored',async()=>{
 const f=await fixture();const {call,register,api}=f;
 try{
  const owner=await register('owner@safety.test',{companyName:'Safety'}),org=owner.body.user.company.id,cookie=owner.cookie,uid=owner.body.user.id,root='organisations/'+org;
  const invite=await call(cookie,'company-invitations','POST',{email:'member@safety.test'}),member=await register('member@safety.test',{invite:invite.body.code});
  let privateTask=(await call(cookie,root+'/data/task','POST',{id:'private',title:'Private brief',due:'2026-12-01',visibility:'private',done:false})).body.record;
  const unsafe=await call(cookie,'workflows/rules?organisationId='+org,'POST',rule({name:'Atomic failure',trigger:'task.completed',conditions:{},actions:[{type:'createTask',title:'Must roll back'},{type:'notify',userId:member.body.user.id,title:'Must not disclose private brief'}]}));assert.equal(unsafe.status,201);
  privateTask=(await call(cookie,root+'/data/task/'+privateTask.id+'/actions','POST',{version:privateTask.version,action:'complete'})).body.records[0];api.runWorkflows();assert.equal((await call(cookie,root+'/data/task')).body.records.some(t=>t.title==='Must roll back'),false);assert.ok((await call(cookie,'workflows/history?organisationId='+org)).body.runs.some(r=>r.ruleName==='Atomic failure'&&r.status==='Failed'));
  assert.equal((await call(member.cookie,'workflows/notifications')).body.notifications.length,0);
  let t=(await call(cookie,root+'/data/task','POST',{id:'dated',title:'Dated task',due:'2020-01-01',done:false})).body.record;
  assert.equal((await call(cookie,'workflows/rules?organisationId='+org,'POST',rule({name:'Overdue',trigger:'task.overdue',conditions:{},actions:[{type:'notify',userId:uid,title:'Overdue work'}]}))).status,201);api.runWorkflows();api.runWorkflows();assert.equal((await call(cookie,'workflows/notifications')).body.notifications.filter(n=>n.title==='Overdue work').length,1);
  const a=await call(cookie,'workflows/approvals?organisationId='+org,'POST',{taskId:t.id,version:t.version,approverId:member.body.user.id,stage:'Review'});assert.equal(a.status,201);
  t=(await call(cookie,root+'/data/task/'+t.id,'PUT',{...t,title:'Changed after approval request'})).body.record;assert.equal((await call(member.cookie,'workflows/approvals?organisationId='+org,'PUT',{id:a.body.id,outcome:'Granted'})).status,409);
  const brand=(await call(cookie,root+'/units','POST',{name:'Restricted',kind:'Brand',channels:[]})).body.unit;await call(cookie,root+'/members/'+member.body.user.id,'PUT',{role:'member',accessScope:'selected',unitIds:[brand.id]});assert.equal((await call(member.cookie,'workflows/approvals?organisationId='+org)).body.approvals.length,0);
  const recurring=(await call(cookie,root+'/data/task','POST',{id:'repeat',title:'Repeat',due:'2026-12-01',done:false,recurrence:{mode:'daily',interval:1,unit:'days',days:[]}})).body.record;assert.equal((await call(cookie,root+'/data/task/'+recurring.id+'/actions','POST',{version:recurring.version,action:'complete'})).status,200);api.runWorkflows();assert.equal((await call(cookie,root+'/data/task')).body.records.filter(t=>t.occurrenceOf==='repeat').length,1);
 }finally{await f.close()}
});

test('Date, budget, campaign milestone, subtask, request and approval triggers use canonical records and current permissions',async()=>{
 const f=await fixture();const {call,register,api}=f;
 try{
  const owner=await register('owner@triggers.test',{companyName:'Triggers'}),org=owner.body.user.company.id,cookie=owner.cookie,uid=owner.body.user.id,root='organisations/'+org;
  const createRule=async patch=>{const r=await call(cookie,'workflows/rules?organisationId='+org,'POST',rule(patch));assert.equal(r.status,201,JSON.stringify(r.body));return r.body.rule;};
  const makeTask=async(id,patch={})=>{const r=await call(cookie,root+'/data/task','POST',{id,title:id,due:'2026-12-01',done:false,...patch});assert.equal(r.status,201,JSON.stringify(r.body));return r.body.record;};
  const campaign=(await call(cookie,root+'/data/campaign','POST',{id:'launch',name:'Launch',end:'2020-01-01',status:'Planning',budget:100})).body.record;
  await createRule({name:'Launch review',trigger:'campaign.status',conditions:{campaign:campaign.id,status:'Launched'},actions:[{type:'createTask',title:'Launch performance review',days:7}]});
  await createRule({name:'Budget crossing',trigger:'campaign.budget',budgetThreshold:1000,conditions:{campaign:campaign.id},actions:[{type:'notify',userId:uid,title:'Planned allocation threshold'}]});
  assert.equal((await call(cookie,root+'/data/campaign/'+campaign.id,'PUT',{...campaign,status:'Launched',budget:1200})).status,200);api.runWorkflows();
  assert.ok((await call(cookie,root+'/data/task')).body.records.some(t=>t.title==='Launch performance review'&&t.campaign===campaign.id));assert.ok((await call(cookie,'workflows/notifications')).body.notifications.some(n=>n.title==='Planned allocation threshold'));
  await createRule({name:'Exhibition ended',trigger:'campaign.ended',conditions:{campaign:campaign.id},actions:[{type:'createTask',userId:uid,title:'Sales exhibition follow-up',days:1}]});api.runWorkflows();api.runWorkflows();assert.equal((await call(cookie,root+'/data/task')).body.records.filter(t=>t.title==='Sales exhibition follow-up').length,1);
  await createRule({name:'Milestone reminder',trigger:'campaign.milestone',conditions:{campaign:campaign.id},actions:[{type:'notify',userId:uid,title:'Milestone reached'}]});const milestone=await makeTask('milestone',{campaign:campaign.id,milestone:true});await call(cookie,root+'/data/task/milestone/actions','POST',{version:milestone.version,action:'complete'});api.runWorkflows();assert.ok((await call(cookie,'workflows/notifications')).body.notifications.some(n=>n.title==='Milestone reached'));
  const parent=await makeTask('parent'),child=await makeTask('child',{parentTaskId:parent.id});await createRule({name:'All children done',trigger:'task.children',conditions:{},actions:[{type:'reminder',days:1}]});await call(cookie,root+'/data/task/child/actions','POST',{version:child.version,action:'complete'});api.runWorkflows();assert.ok((await call(cookie,root+'/data/task/parent')).body.record.reminderAt);
  await createRule({name:'Scheduled creation',trigger:'scheduled',scheduledAt:new Date(Date.now()-1000).toISOString(),conditions:{},actions:[{type:'createTask',title:'Scheduled responsibility'}]});api.runWorkflows();api.runWorkflows();assert.equal((await call(cookie,root+'/data/task')).body.records.filter(t=>t.title==='Scheduled responsibility').length,1);
  await createRule({name:'Approval requested',trigger:'approval.requested',conditions:{outcome:'Pending'},actions:[{type:'notify',title:'Review requested'}]});await createRule({name:'Approval rejected',trigger:'approval.rejected',conditions:{outcome:'Rejected'},actions:[{type:'notify',title:'Changes required'}]});const review=await makeTask('review');const approval=await call(cookie,'workflows/approvals?organisationId='+org,'POST',{taskId:review.id,version:review.version,approverId:uid,stage:'Editorial review'});api.runWorkflows();assert.equal((await call(cookie,root+'/data/task/review/actions','POST',{version:review.version,action:'complete'})).status,409);
  assert.equal((await call(cookie,'workflows/approvals?organisationId='+org,'PUT',{id:approval.body.id,outcome:'Rejected'})).status,200);api.runWorkflows();assert.ok((await call(cookie,'workflows/notifications')).body.notifications.some(n=>n.title==='Changes required'));
  const forms=(await call(cookie,'requests/forms?organisationId='+org)).body.forms,form=forms.find(f=>f.name==='Customer Case Study');
  await createRule({name:'Case study distribution',trigger:'request.approved',conditions:{requestType:form.id},actions:[{type:'createTask',title:'Website case study'},{type:'createTask',title:'Social case study',days:2}]});
  let request=(await call(cookie,'requests/items?organisationId='+org,'POST',{formId:form.id,title:'Customer story',description:'Create a case study',fields:{purpose:'Customer proof',deliverables:'Story',details:'Sales introduction',responsibilities:'Sales follows up'},answers:{},unitIds:[],requestedDeadline:'2026-12-01',requestedPriority:'Medium',attachments:[]})).body.request;
  const approved=await call(cookie,'requests/items/'+request.id,'PUT',{...request,status:'Approved',deliveryOwnerId:uid,commercialOwnerId:uid,agreedDeadline:'2026-12-01'});assert.equal(approved.status,200,JSON.stringify(approved.body));api.runWorkflows();request=(await call(cookie,'requests/items/'+request.id)).body.request;assert.equal(request.work.filter(w=>w.kind==='task').length,2);assert.equal(request.converted,true);assert.equal(request.commercialOwnerId,uid);assert.equal((await call(cookie,'requests/items/'+request.id+'/convert','POST',{version:request.version,kind:'task'})).status,409);
  const invite=await call(cookie,'company-invitations','POST',{email:'restricted@triggers.test'}),restricted=await register('restricted@triggers.test',{invite:invite.body.code}),brand=(await call(cookie,root+'/units','POST',{name:'Selected brand',kind:'Brand',channels:['Website']})).body.unit;await call(cookie,root+'/members/'+restricted.body.user.id,'PUT',{role:'member',accessScope:'selected',unitIds:[brand.id]});
  const library=await call(restricted.cookie,'workflows/context?organisationId='+org);assert.equal(library.status,200);assert.equal(library.body.playbooks.length,12);assert.equal(library.body.canUsePlaybooks,true);assert.equal(library.body.canManage,false);
  await call(cookie,root+'/members/'+restricted.body.user.id,'PUT',{role:'manager',accessScope:'selected',unitIds:[brand.id]});
  const scheduledDraft=rule({name:'Scoped timer dry run',unitIds:[brand.id],trigger:'scheduled',scheduledAt:new Date(Date.now()+86400000).toISOString(),conditions:{},actions:[{type:'notify',userId:restricted.body.user.id,title:'Scoped timer'}]});assert.equal((await call(restricted.cookie,'workflows/test?organisationId='+org,'POST',{rule:scheduledDraft,sourceKind:'organisation',sourceId:org})).status,200);
  const protectedRule=await call(restricted.cookie,'workflows/rules?organisationId='+org,'POST',rule({name:'Recheck executor authority',unitIds:[brand.id],trigger:'task.created',conditions:{},actions:[{type:'createTask',title:'Must not run after demotion'}]}));assert.equal(protectedRule.status,201);
  await call(cookie,root+'/members/'+restricted.body.user.id,'PUT',{role:'member',accessScope:'selected',unitIds:[brand.id]});await makeTask('after-demotion',{unitIds:[brand.id]});api.runWorkflows();assert.equal((await call(cookie,root+'/data/task')).body.records.some(t=>t.title==='Must not run after demotion'),false);assert.equal((await call(cookie,'workflows/pause?organisationId='+org,'POST',{id:protectedRule.body.rule.id,version:protectedRule.body.rule.version})).status,200);
  const preset=library.body.playbooks.find(b=>b.name==='Product Launch');const preview=await call(restricted.cookie,'workflows/preview?organisationId='+org,'POST',{playbookId:preset.id,name:'Brand launch',anchor:'2026-12-01',unitIds:[brand.id],channels:['Website'],stages:[],roles:Object.fromEntries(preset.roles.map(role=>[role,restricted.body.user.id]))});assert.equal(preview.status,200,JSON.stringify(preview.body));
 }finally{await f.close()}
});

test('Task mutation actions reuse list, assignment, status, reminder and template systems without cascading occurrences',async()=>{
 const f=await fixture();const {call,register,api}=f;
 try{
  const owner=await register('owner@actions.test',{companyName:'Actions'}),org=owner.body.user.company.id,cookie=owner.cookie,uid=owner.body.user.id,root='organisations/'+org;
  const invite=await call(cookie,'company-invitations','POST',{email:'worker@actions.test'}),worker=await register('worker@actions.test',{invite:invite.body.code}),wid=worker.body.user.id;
  const group=(await call(cookie,root+'/data/group','POST',{id:'delivery',name:'Delivery list',parentId:'',visibility:'shared'})).body.record;
  const template=(await call(cookie,root+'/data/template','POST',{title:'Follow-up',visibility:'shared',blueprint:{title:'Template follow-up',effortHours:2,checklist:[{id:'item',title:'Confirm next action',done:true}]}})).body.record;
  const saved=await call(cookie,'workflows/rules?organisationId='+org,'POST',rule({name:'Prepare delivery',trigger:'task.created',conditions:{priority:'High'},actions:[{type:'assign',userId:wid},{type:'contributor',userId:uid},{type:'list',listId:group.id},{type:'status',status:'In progress'},{type:'reminder',days:0},{type:'template',templateId:template.id,userId:wid,days:2}]}));assert.equal(saved.status,201,JSON.stringify(saved.body));
  const task=(await call(cookie,root+'/data/task','POST',{id:'source',title:'Delivery source',due:new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'}),done:false,priority:'High'})).body.record;
  api.runWorkflows();api.runWorkflows();let updated=(await call(cookie,root+'/data/task/'+task.id)).body.record;assert.equal(updated.accountableOwnerId,wid);assert.deepEqual(updated.contributorIds,[uid]);assert.equal(updated.groupId,group.id);assert.equal(updated.status,'In progress');assert.ok(updated.reminderAt);
  const tasks=(await call(cookie,root+'/data/task')).body.records;assert.equal(tasks.length,2);const follow=tasks.find(t=>t.title==='Template follow-up');assert.equal(follow.accountableOwnerId,wid);assert.equal(follow.effortHours,2);assert.equal(follow.checklist[0].done,false);
  assert.ok((await call(worker.cookie,'planner/notifications')).body.notifications.some(n=>n.title==='Reminder: Delivery source'));
  assert.equal((await call(cookie,'workflows/rules?organisationId='+org,'POST',rule({name:'Approaching deadline',trigger:'task.due',daysBefore:0,conditions:{},actions:[{type:'notify',title:'Due today'}]}))).status,201);api.runWorkflows();api.runWorkflows();assert.equal((await call(worker.cookie,'workflows/notifications')).body.notifications.filter(n=>n.title==='Due today').length,1);
  assert.equal((await call(cookie,'workflows/rules?organisationId='+org,'POST',rule({name:'Assignment observed',trigger:'task.assigned',conditions:{ownerId:uid},actions:[{type:'notify',userId:uid,title:'Assignment changed'}]}))).status,201);
  assert.equal((await call(cookie,root+'/data/task/'+task.id,'PUT',{...updated,assigneeIds:updated.assigneeIds,accountableOwnerId:uid,contributorIds:[wid]})).status,200);api.runWorkflows();assert.ok((await call(cookie,'workflows/notifications')).body.notifications.some(n=>n.title==='Assignment changed'));
 }finally{await f.close()}
});

test('Durable unprocessed events execute after restart and stay deduplicated',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'theory-workflow-')),file=join(directory,'test.sqlite');let f;
 try{
  f=await fixture(file);const owner=await f.register('owner@durable.test',{companyName:'Durable'}),org=owner.body.user.company.id,cookie=owner.cookie;
  assert.equal((await f.call(cookie,'workflows/rules?organisationId='+org,'POST',rule({name:'Created follow-up',trigger:'task.created',conditions:{priority:'High'},actions:[{type:'createTask',title:'Durable follow-up',days:2}]}))).status,201);
  await f.call(cookie,'organisations/'+org+'/data/task','POST',{id:'source',title:'Source',due:'2026-12-01',priority:'High',done:false});await f.close();f=null;
  f=await fixture(file);f.api.runWorkflows();f.api.runWorkflows();const tasks=(await f.call(cookie,'organisations/'+org+'/data/task')).body.records;assert.equal(tasks.filter(t=>t.title==='Durable follow-up').length,1);assert.equal((await f.call(cookie,'workflows/history?organisationId='+org)).body.runs.filter(r=>r.status==='Succeeded').length,1);
 }finally{if(f)await f.close();if(dirname(directory)===tmpdir()&&basename(directory).startsWith('theory-workflow-'))rmSync(directory,{recursive:true,force:true})}
});
