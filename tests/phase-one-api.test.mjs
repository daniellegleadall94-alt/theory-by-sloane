import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,basename,dirname} from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import ExcelJS from 'exceljs';
import {createCompanyApi} from '../server/company-api.mjs';
import {parseCsv} from '../server/import-parser.mjs';
import {importDate} from '../server/task-import-api.mjs';

test('Phase 1: subtasks, followers, templates, shared views and confirmed schedule cascades preserve permissions and commitments',async()=>{
 const api=createCompanyApi({databasePath:':memory:'}),server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(cookie,path,method='GET',body)=>{const r=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const register=(email,extra={})=>request('','auth/register','POST',{name:email,email,password:'Strong phase one testing password',...extra});
 try{
  const owner=await register('owner@phase.test',{companyName:'Phase One'}),other=await register('other@phase.test',{companyName:'Other'}),cookie=owner.cookie,org=owner.body.user.company.id,root=`organisations/${org}`;
  const invite=await request(cookie,'company-invitations','POST',{email:'member@phase.test'}),member=await register('member@phase.test',{invite:invite.body.code}),uid=member.body.user.id;
  const create=async(id,patch={})=>{const r=await request(cookie,root+'/data/task','POST',{id,title:id,due:'2026-11-02',done:false,campaign:'',...patch});assert.equal(r.status,201,JSON.stringify(r.body));return r.body.record};
  let parent=await create('parent',{visibility:'private'});
  assert.equal((await request(cookie,root+'/data/task','POST',{id:'bad-child',title:'bad',due:'',parentTaskId:parent.id,assigneeIds:[uid]})).status,400);
  let child=await create('child',{parentTaskId:parent.id});assert.equal((await request(member.cookie,root+'/data/task/child')).status,404);assert.equal((await request(cookie,root+'/data/task/child','PUT',{...child,dependencyIds:['parent']})).status,400);
  assert.equal((await request(cookie,root+'/data/task/parent','PUT',{...parent,parentTaskId:child.id})).status,400);
  assert.equal((await request(cookie,root+'/data/task/parent/actions','POST',{version:parent.version,action:'complete'})).status,409);
  assert.equal((await request(cookie,root+'/data/task/parent','DELETE',{version:parent.version})).status,409);
  child=(await request(cookie,root+'/data/task/child/actions','POST',{version:child.version,action:'complete'})).body.records[0];
  assert.equal((await request(cookie,root+'/data/task/parent/actions','POST',{version:parent.version,action:'complete'})).status,200);
  let task=await create('followed');
  const followed=await request(member.cookie,'work-management/follow','POST',{organisationId:org,id:task.id,version:task.version,follow:true});assert.equal(followed.status,200,JSON.stringify(followed.body));task=followed.body.record;
  assert.deepEqual(task.followerIds,[uid]);assert.deepEqual(task.assigneeIds,[owner.body.user.id]);
  assert.equal((await request(cookie,root+'/data/task/followed','PUT',{...task,description:'A significant update'})).status,200);
  assert.ok((await request(member.cookie,'planner/notifications')).body.notifications.some(n=>n.title==='Updated: followed'));
  assert.equal((await request(other.cookie,'work-management/follow','POST',{organisationId:org,id:task.id,version:task.version,follow:true})).status,403);
  assert.equal((await request(cookie,root+'/data/template','POST',{title:'Invalid',visibility:'private',blueprint:{title:'Invalid',customFields:[{id:'x',name:'x',type:'number',value:'bad'}]}})).status,400);
  const template=await request(cookie,root+'/data/template','POST',{title:'Creative brief',visibility:'shared',blueprint:{title:'Prepare creative brief',effortHours:3,customFields:[{id:'audience',name:'Audience',type:'text',value:'Merchants'}],checklist:[{id:'x',title:'Research',done:false}]}});assert.equal(template.status,201,JSON.stringify(template.body));
  assert.equal((await request(member.cookie,root+'/data/template/'+template.body.record.id)).status,200);
  assert.equal((await request(member.cookie,root+'/data/template','POST',{title:'Unauthorised shared',visibility:'shared',blueprint:{title:'x'}})).status,403);
  const view=await request(cookie,root+'/data/view','POST',{title:'In review this month',visibility:'shared',config:{filters:{status:'In review',dueFrom:'2026-11-01',dueTo:'2026-11-30'}}});assert.equal(view.status,201);assert.equal((await request(member.cookie,root+'/data/view/'+view.body.record.id)).status,200);
  assert.equal((await request(member.cookie,root+'/data/view','POST',{title:'No',visibility:'shared',config:{}})).status,403);
  await request(cookie,root+'/data/campaign','POST',{id:'launch',name:'Launch',end:'2026-11-06',budget:0});
  let a=await create('brief',{start:'2026-11-01',due:'2026-11-02'}),b=await create('artwork',{start:'2026-11-03',due:'2026-11-04',dependencyIds:['brief'],publicationDate:'2026-11-06',campaign:'launch'}),c=await create('signoff',{start:'2026-11-05',due:'2026-11-05',dependencyIds:['artwork'],deadlineLocked:true});
  const schedule=(body,who=cookie)=>request(who,'work-management/reschedule','POST',{organisationId:org,...body});
  assert.equal((await schedule({mode:'preview',id:a.id,due:'2026-11-05'})).status,400);
  assert.equal((await request(cookie,root+'/data/task/signoff','PUT',{...c,deadlineLocked:false,due:'2026-11-06'})).status,409);
  c=(await request(cookie,root+'/data/task/signoff','PUT',{...c,deadlineLocked:false})).body.record;
  const plan=await schedule({mode:'preview',id:a.id,due:'2026-11-05'});assert.equal(plan.status,200,JSON.stringify(plan.body));assert.equal(plan.body.changes.length,3);assert.ok(plan.body.changes.some(c=>c.warnings.length));
  assert.equal((await request(cookie,root+'/data/task/brief')).body.record.due,'2026-11-02');
  assert.equal((await schedule({mode:'apply',token:plan.body.token})).status,400);
  const apply=await schedule({mode:'apply',token:plan.body.token,confirmDeadlines:true});assert.equal(apply.status,200,JSON.stringify(apply.body));
  b=(await request(cookie,root+'/data/task/artwork')).body.record;assert.equal(b.start,'2026-11-06');assert.equal(b.due,'2026-11-07');assert.equal(b.publicationDate,'2026-11-06');assert.equal((await request(cookie,root+'/data/campaign/launch')).body.record.end,'2026-11-06');
  assert.equal((await request(cookie,'work-management/undo','POST',{undoId:apply.body.undoId})).status,200);
  const stale=await schedule({mode:'preview',id:a.id,due:'2026-11-05'});a=(await request(cookie,root+'/data/task/brief')).body.record;await request(cookie,root+'/data/task/brief','PUT',{...a,title:'Changed after preview'});
  assert.equal((await schedule({mode:'apply',token:stale.body.token,confirmDeadlines:true})).status,409);
  assert.equal((await schedule({mode:'preview',id:a.id,due:'2026-11-05'},member.cookie)).status,403);
  assert.equal((await request(cookie,`work-management/capacity?organisationId=${org}`)).status,200);
  task=(await request(cookie,root+'/data/task/followed')).body.record;
  const repeating=await create('repeating-followed-work',{followerIds:[uid],recurrence:{mode:'daily',interval:1,unit:'days',days:[]}});
  const restrictedBrand=(await request(cookie,root+'/units','POST',{name:'Selected access',kind:'Brand',channels:[]})).body.unit;
  await request(cookie,root+'/members/'+uid,'PUT',{role:'member',accessScope:'selected',unitIds:[restrictedBrand.id]});
  assert.equal((await request(member.cookie,root+'/data/task/followed')).status,404);
  const updatedAfterRevocation=await request(cookie,root+'/data/task/followed','PUT',{...task,description:'Still editable after follower access revocation'});assert.equal(updatedAfterRevocation.status,200,JSON.stringify(updatedAfterRevocation.body));assert.deepEqual(updatedAfterRevocation.body.record.followerIds,[]);
  assert.equal((await request(member.cookie,'planner/notifications')).body.notifications.some(n=>n.task.id==='followed'),false);
  const repeatCompletion=await request(cookie,root+'/data/task/'+repeating.id+'/actions','POST',{version:repeating.version,action:'complete'});assert.equal(repeatCompletion.status,200,JSON.stringify(repeatCompletion.body));assert.ok(repeatCompletion.body.records.every(t=>!t.followerIds?.length));

  assert.equal((await request(cookie,`work-management/capacity?organisationId=${org}`,'PUT',{capacity:{weeklyHours:37.5,workingDays:[1,2,3,4,5],daysOff:[],allocations:[{dimension:'discipline',key:'Email marketing',percent:60},{dimension:'discipline',key:'PR',percent:50}]}})).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});

test('CSV/XLSX import maps, validates, previews, reports duplicates and errors, prevents overwrites and rechecks access',async()=>{
 assert.deepEqual(parseCsv('\uFEFFTask,Description\r\n"Brief, launch","One\nTwo"\r\n'),[['Task','Description'],['Brief, launch','One\nTwo']]);assert.throws(()=>parseCsv('Task\n"unfinished'));
 assert.equal(importDate('31/10/2026','DMY'),'2026-10-31');assert.throws(()=>importDate('31/02/2026','DMY'));
 const api=createCompanyApi({databasePath:':memory:'}),server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(cookie,path,method='GET',body)=>{const r=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const register=(email,extra={})=>request('','auth/register','POST',{name:email,email,password:'Strong phase one import password',...extra});
 try{
  const owner=await register('owner@import.test',{companyName:'Import company'}),other=await register('other@import.test',{companyName:'Other'}),cookie=owner.cookie,org=owner.body.user.company.id,root=`organisations/${org}`;
  const brand=(await request(cookie,root+'/units','POST',{name:'Brand',kind:'Brand',channels:[]})).body.unit;
  const upload=async(name,bytes,who=cookie)=>request(who,'imports/upload','POST',{name,base64:Buffer.from(bytes).toString('base64')});
  const csv='Task,Deadline,Work date,Owner,Hours\nImported launch,05/11/2026,02/11/2026,owner@import.test,4\nBad date,31/02/2026,,,2\nImported launch,05/11/2026,02/11/2026,owner@import.test,4\n';
  let job=await upload('tasks.csv',csv);assert.equal(job.status,201,JSON.stringify(job.body));assert.equal(job.body.sheets[0].count,3);
  const config={organisationId:org,unitIds:[brand.id],mapping:{title:0,due:1,plannedDate:2,owner:3,effortHours:4},dateFormat:'DMY'};
  assert.equal((await request(other.cookie,`imports/${job.body.id}/preview`,'POST',config)).status,404);
  let preview=await request(cookie,`imports/${job.body.id}/preview`,'POST',config);assert.equal(preview.status,200,JSON.stringify(preview.body));assert.equal(preview.body.valid,1);assert.equal(preview.body.errors,1);assert.equal(preview.body.duplicates,1);
  assert.equal((await request(cookie,root+'/data/task')).body.records.length,0);
  assert.equal((await request(cookie,`imports/${job.body.id}/apply`,'POST',{confirm:true})).status,400);
  const applied=await request(cookie,`imports/${job.body.id}/apply`,'POST',{confirm:true,confirmValidOnly:true});assert.equal(applied.status,200,JSON.stringify(applied.body));assert.equal(applied.body.imported,1);assert.equal(applied.body.skipped,2);
  const task=(await request(cookie,root+'/data/task')).body.records[0];assert.equal(task.title,'Imported launch');assert.equal(task.due,'2026-11-05');assert.equal(task.plannedDate,'2026-11-02');assert.deepEqual(task.unitIds,[brand.id]);assert.equal(task.effortHours,4);
  assert.equal((await request(cookie,`imports/${job.body.id}/apply`,'POST',{confirm:true,confirmValidOnly:true})).status,409);
  job=await upload('again.csv',csv);preview=await request(cookie,`imports/${job.body.id}/preview`,'POST',config);assert.equal(preview.body.valid,0);assert.equal((await request(cookie,root+'/data/task')).body.records[0].version,task.version);
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Work');sheet.addRow(['Task','Due','Hours']);sheet.addRow(['Excel task',new Date('2026-11-09T00:00:00Z'),2]);sheet.getCell('B2').numFmt='yyyy-mm-dd';sheet.addRow(['Formula date',{formula:'TODAY()'},1]);
  const xlsx=await upload('work.xlsx',await book.xlsx.writeBuffer());assert.equal(xlsx.status,201,JSON.stringify(xlsx.body));assert.equal(xlsx.body.sheets[0].rows[0][1],'2026-11-09');
  preview=await request(cookie,`imports/${xlsx.body.id}/preview`,'POST',{organisationId:org,unitIds:[brand.id],mapping:{title:0,due:1,effortHours:2}});assert.equal(preview.body.valid,1);assert.equal(preview.body.errors,1);
  const stale=await upload('stale.csv','Task\nAnother task');await request(cookie,`imports/${stale.body.id}/preview`,'POST',{organisationId:org,unitIds:[brand.id],mapping:{title:0}});await request(cookie,root+'/data/task/'+task.id,'PUT',{...task,title:'Changed manually'});assert.equal((await request(cookie,`imports/${stale.body.id}/apply`,'POST',{confirm:true})).status,409);
  assert.equal((await upload('unsupported.xls','not a workbook')).status,400);
  assert.equal((await upload('fake.xlsx','not a zip')).status,400);
  assert.equal((await request(other.cookie,`imports/${xlsx.body.id}/apply`,'POST',{confirm:true,confirmValidOnly:true})).status,404);
  const secondBrand=(await request(cookie,root+'/units','POST',{name:'Second',kind:'Brand',channels:[]})).body.unit;
  const invitation=await request(cookie,'company-invitations','POST',{email:'member@import.test'}),member=await register('member@import.test',{invite:invitation.body.code}),memberId=member.body.user.id;
  await request(cookie,root+'/members/'+memberId,'PUT',{role:'member',accessScope:'selected',unitIds:[brand.id]});
  const revoked=await upload('member.csv','Task\nMember task one\nMember task two',member.cookie);
  const checked=await request(member.cookie,`imports/${revoked.body.id}/preview`,'POST',{organisationId:org,unitIds:[brand.id],mapping:{title:0}});assert.equal(checked.status,200,JSON.stringify(checked.body));assert.equal(checked.body.valid,2);
  const before=(await request(cookie,root+'/data/task')).body.records.length;
  await request(cookie,root+'/members/'+memberId,'PUT',{role:'member',accessScope:'selected',unitIds:[secondBrand.id]});
  assert.equal((await request(member.cookie,`imports/${revoked.body.id}/apply`,'POST',{confirm:true})).status,403);
  assert.equal((await request(cookie,root+'/data/task')).body.records.length,before);
  assert.equal((await request(other.cookie,'imports/'+revoked.body.id,'DELETE')).status,404);
  assert.equal((await request(member.cookie,'imports/'+revoked.body.id,'DELETE')).status,200);
  const shared=(await request(cookie,root+'/data/view','POST',{title:'Brand view',visibility:'shared',config:{filters:{priority:'High'}},unitIds:[brand.id]})).body.record;
  assert.equal((await request(member.cookie,root+'/data/view/'+shared.id)).status,404);

 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});


test('Phase 1 task fields, templates, capacity and validated import jobs survive a server restart',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'theory-phase-one-')),databasePath=join(directory,'theory.sqlite');let api,server,origin;
 const start=async()=>{api=createCompanyApi({databasePath});server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`};
 const close=async()=>{await new Promise(resolve=>server.close(resolve));api.close();server=null};
 const request=async(cookie,path,method='GET',body)=>{const r=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 try{
  await start();const account=await request('','auth/register','POST',{name:'Persistent',email:'persist@phase.test',password:'Persistent phase one test password',companyName:'Persistent company'}),cookie=account.cookie;
  let r=await request(cookie,'personal/data/task','POST',{id:'persistent-task',title:'Persistent task',due:'2026-11-10',done:false,effortHours:4,actualHours:1.5,customFields:[{id:'brief',name:'Audience',type:'text',value:'Trade'}]});assert.equal(r.status,201);
  r=await request(cookie,'personal/data/template','POST',{title:'Persistent template',blueprint:{title:'Use me',effortHours:2}});assert.equal(r.status,201);assert.equal(r.body.record.visibility,'private');
  assert.equal((await request(cookie,'work-management/capacity','PUT',{capacity:{weeklyHours:20,workingDays:[1,2,3,4],daysOff:['2026-11-05'],allocations:[{dimension:'discipline',key:'PR',percent:50}]}})).status,200);
  const job=await request(cookie,'imports/upload','POST',{name:'persist.csv',base64:Buffer.from('Task,Due\nImported after restart,2026-11-12').toString('base64')});assert.equal(job.status,201);
  assert.equal((await request(cookie,`imports/${job.body.id}/preview`,'POST',{mapping:{title:0,due:1}})).status,200);
  await close();await start();
  const task=(await request(cookie,'personal/data/task/persistent-task')).body.record;assert.equal(task.actualHours,1.5);assert.equal(task.customFields[0].value,'Trade');assert.equal((await request(cookie,'personal/data/template')).body.records.length,1);
  const capacity=(await request(cookie,'work-management/capacity')).body.people[0].capacity;assert.equal(capacity.weeklyHours,20);assert.deepEqual(capacity.daysOff,['2026-11-05']);assert.equal(capacity.allocations[0].percent,50);
  const applied=await request(cookie,`imports/${job.body.id}/apply`,'POST',{confirm:true});assert.equal(applied.status,200,JSON.stringify(applied.body));assert.equal(applied.body.imported,1);assert.equal((await request(cookie,'personal/data/task')).body.records.length,2);
 }finally{if(server)await close();const target=resolve(directory);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('theory-phase-one-'));rmSync(target,{recursive:true,force:true})}
});
