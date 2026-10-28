import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';

test('organisation isolation, restricted business access, shared budgets, personal assignments and version conflicts',async()=>{
 const api=createCompanyApi({databasePath:':memory:'}),server=createServer(api.middleware);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(cookie,path,method='GET',body)=>{const response=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
 const register=(email,extra)=>request('','auth/register','POST',{name:email,email,password:'Workspace testing password 2026',...extra});
 try{
  const owner=await register('owner@workspace.test',{companyName:'Organisation One'}),outsider=await register('outsider@workspace.test',{companyName:'Organisation Two'});
  const org=owner.body.user.company.id,otherOrg=outsider.body.user.company.id,base=`organisations/${org}`;
  const invitation=await request(owner.cookie,'company-invitations','POST',{email:'member@workspace.test'});
  const member=await register('member@workspace.test',{invite:invitation.body.code});const memberId=member.body.user.id;
  const first=(await request(owner.cookie,base+'/units','POST',{name:'First business',kind:'Brand',channels:['Email']})).body.unit;
  const second=(await request(owner.cookie,base+'/units','POST',{name:'Second business',kind:'Division',channels:['Website']})).body.unit;
  assert.ok(first.id&&second.id);
  assert.equal((await request(outsider.cookie,base+'/records')).status,403);
  assert.equal((await request(owner.cookie,`organisations/${otherOrg}/records`)).status,403);
  const campaign={id:'shared-campaign',name:'Shared launch',end:'2026-11-30',budget:300,unitIds:[first.id,second.id],allocations:[{unitId:first.id,amount:100},{unitId:second.id,amount:200}]};
  assert.equal((await request(owner.cookie,base+'/data/campaign','POST',campaign)).status,201);
  assert.equal((await request(owner.cookie,base+'/data/campaign','POST',{...campaign,id:'bad-budget',allocations:[{unitId:first.id,amount:1}]})).status,400);
  const summary=(await request(owner.cookie,base+'/summary')).body;assert.equal(summary.campaigns,1);assert.equal(summary.budget,300);assert.equal(summary.units.reduce((sum,u)=>sum+u.allocatedBudget,0),300);
  assert.equal((await request(owner.cookie,base+'/members/'+memberId,'PUT',{role:'member',accessScope:'selected',unitIds:[first.id]})).status,200);
  assert.equal((await request(member.cookie,base+'/data/campaign/shared-campaign')).status,404);
  assert.equal((await request(member.cookie,base+'/summary')).body.budget,0);
  assert.deepEqual((await request(member.cookie,'organisations')).body.organisations[0].units.map(u=>u.id),[first.id]);
  const task={id:'first-task',title:'Assigned task',due:'2026-11-01',start:'2026-10-28',done:false,unitIds:[first.id],assigneeIds:[memberId],campaign:'shared-campaign'};
  assert.equal((await request(owner.cookie,base+'/data/task','POST',task)).status,201);
  assert.equal((await request(owner.cookie,base+'/data/task','POST',{...task,id:'invalid-assignee',unitIds:[second.id]})).status,400);
  const mine=(await request(member.cookie,'my-work')).body.tasks;assert.equal(mine.length,1);assert.equal(mine[0].campaignName,'');assert.equal(mine[0].organisationId,org);
  assert.equal((await request(member.cookie,base+'/data/task/first-task','PUT',{...task,done:true,version:1})).status,200);
  assert.equal((await request(owner.cookie,base+'/data/task/first-task')).body.record.done,true);
  assert.equal((await request(owner.cookie,base+'/data/task/first-task','PUT',{...task,version:1})).status,409);
  assert.equal((await request(owner.cookie,base+'/data/task/first-task','DELETE',{version:1})).status,409);
  assert.equal((await request(member.cookie,base+'/data/task','POST',{...task,id:'wrong-unit',unitIds:[second.id]})).status,403);
  assert.equal((await request(member.cookie,base+'/data/task','POST',{...task,id:'org-wide',unitIds:[]})).status,403);
  // A per-record grant can expose a shared campaign without exposing other records in its businesses.
  assert.equal((await request(owner.cookie,base+'/data/campaign/shared-campaign/grants','PUT',{memberIds:[memberId]})).status,200);
  assert.equal((await request(member.cookie,base+'/data/campaign/shared-campaign')).status,200);
  assert.equal((await request(owner.cookie,base+'/data/campaign/shared-campaign/grants','PUT',{memberIds:[]})).status,200);
  assert.equal((await request(member.cookie,base+'/data/campaign/shared-campaign')).status,404);
  // The same account owns another organisation, with independent IDs and scope.
  const next=(await request(owner.cookie,'companies','POST',{name:'Independent organisation'})).body.user.company.id;
  assert.equal((await request(owner.cookie,`organisations/${next}/data/task`,'POST',{...task,campaign:'',unitIds:[],assigneeIds:[owner.body.user.id]})).status,201);
  assert.equal((await request(owner.cookie,base+'/data/task/first-task')).body.record.done,true);
  const movable=(await request(owner.cookie,`organisations/${next}/data/task/first-task`)).body.record;
  assert.equal((await request(owner.cookie,`organisations/${next}/data/task/first-task/move`,'POST',{version:movable.version,targetOrganisationId:otherOrg,task:{...movable,campaign:'',unitIds:[]}})).status,403);
  assert.equal((await request(owner.cookie,`organisations/${next}/data/task/first-task`)).status,200);
  const moved=await request(owner.cookie,`organisations/${next}/data/task/first-task/move`,'POST',{version:movable.version,targetOrganisationId:null,task:{...movable,campaign:'',unitIds:[]}});assert.equal(moved.status,200);assert.equal(moved.body.record.organisationId,null);
  assert.equal((await request(owner.cookie,`organisations/${next}/data/task/first-task`)).status,404);
  const personal={id:'private-task',title:'Personal work',due:'2026-11-02',done:false,unitIds:[]};
  assert.equal((await request(owner.cookie,'personal/data/task','POST',personal)).status,201);
  assert.equal((await request(member.cookie,'personal/data/task/private-task')).status,404);
  const ownTasks=(await request(owner.cookie,'my-work')).body.tasks;assert.equal(ownTasks.length,2);assert.ok(!ownTasks.some(t=>t.id==='first-task'&&t.organisationId===org));
  // Additive legacy imports never replace an existing server record.
  const imported=await request(owner.cookie,base+'/import','POST',{records:[{...task,kind:'task',title:'Do not replace',assigneeIds:[owner.body.user.id],campaign:''}]});assert.equal(imported.body.imported,0);
  assert.equal((await request(owner.cookie,base+'/data/task/first-task')).body.record.title,'Assigned task');
  // Stable unit IDs survive renames and archive, and existing associations stay readable.
  assert.equal((await request(owner.cookie,base+'/units/'+first.id,'PUT',{name:'Renamed business',kind:'Brand',archived:true,channels:[]})).status,200);
  assert.deepEqual((await request(owner.cookie,base+'/data/task/first-task')).body.record.unitIds,[first.id]);
  assert.equal((await request(owner.cookie,base+'/data/task','POST',{...task,id:'archived-new',campaign:'',assigneeIds:[owner.body.user.id]})).status,400);
  assert.equal((await request(owner.cookie,base+'/members/'+memberId,'PUT',{role:'viewer',accessScope:'all',unitIds:[]})).status,200);
  const latest=(await request(member.cookie,base+'/data/task/first-task')).body.record;
  assert.equal((await request(member.cookie,base+'/data/task/first-task','PUT',{...latest,title:'Read only'})).status,403);
  const file=await request(owner.cookie,base+'/data/file','POST',{id:'file',title:'Shared guide',unitIds:[],content:'YQ=='});assert.equal(file.status,201);
  assert.equal((await request(owner.cookie,base+'/data/file/file','PUT',{...file.body.record,content:'Yg=='})).status,200);
  assert.equal((await request(owner.cookie,base+'/data/file/file/versions')).body.versions.length,2);
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});
