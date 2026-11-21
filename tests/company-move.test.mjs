import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';

test('company moves preview access changes and atomically preserve task, plan, strategy and history identities',async()=>{
 const api=createCompanyApi({databasePath:':memory:'}),server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const req=async(cookie,path,method='GET',body)=>{const response=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,Cookie:cookie||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json(),cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')}};
 try{
  const owner=await req('','auth/register','POST',{name:'Owner',email:'owner@companymove.test',password:'Company move test password',companyName:'Source'}),cookie=owner.cookie,source=owner.body.user.company.id;
  await req(cookie,'companies','POST',{name:'Destination',activate:false});const target=(await req(cookie,'organisations')).body.organisations.find(org=>org.name==='Destination').id;
  const invite=await req(cookie,'company-invitations','POST',{email:'colleague@companymove.test'}),colleague=await req('','auth/register','POST',{name:'Colleague',email:'colleague@companymove.test',password:'Company move test password',invite:invite.body.code});assert.equal(colleague.status,201);
  await req(cookie,'workspace','PUT',{companyId:target});const destinationInvite=await req(cookie,'company-invitations','POST',{email:'destination@companymove.test'}),destinationMember=await req('','auth/register','POST',{name:'Destination colleague',email:'destination@companymove.test',password:'Company move test password',invite:destinationInvite.body.code});assert.equal(destinationMember.status,201);await req(cookie,'workspace','PUT',{companyId:source});
  const stranger=await req('','auth/register','POST',{name:'Other',email:'other@companymove.test',password:'Company move test password',companyName:'Unrelated'});
  const unit=(await req(cookie,`organisations/${source}/units`,'POST',{name:'Moving company',kind:'Company',channels:['Email','Website']})).body.unit;
  const create=(kind,body)=>req(cookie,`organisations/${source}/data/${kind}`,'POST',body);
  const group=(await create('group',{name:'Delivery',unitIds:[],parentId:''})).body.record;
  const plan=(await create('strategy',{name:'Channel plan',unitIds:[unit.id],verticals:[{name:'Email',purpose:'Retention',stakeholders:'Customers'}]})).body.record;
  let task=(await create('task',{title:'Keep identity and history',due:'2026-12-01',done:false,unitIds:[unit.id],groupId:group.id,overviewId:plan.id})).body.record;
  const foundation=await req(cookie,`strategies/${source}/${unit.id}/foundations`,'PUT',{answers:{mission:'A useful purpose',vision:'',values:[],brandPromise:'',why:''},reviewMonths:12,action:'save'});assert.equal(foundation.status,200,JSON.stringify(foundation.body));
  const route=`organisations/${source}/units/${unit.id}`;
  const assigned=await req(cookie,`organisations/${source}/data/task/${task.id}`,'PUT',{...task,assigneeIds:[colleague.body.user.id],accountableOwnerId:colleague.body.user.id});assert.equal(assigned.status,200,JSON.stringify(assigned.body));task=assigned.body.record;
  const missingMember=(await req(cookie,route+'/move-preview','POST',{targetOrganisationId:target})).body.preview;assert.ok(missingMember.blockers.some(message=>message.includes('not members')),JSON.stringify({preview:missingMember,assignees:task.assigneeIds,members:(await req(cookie,`organisations/${target}/members`)).body}));
  task=(await req(cookie,`organisations/${source}/data/task/${task.id}`,'PUT',{...task,assigneeIds:[owner.body.user.id],accountableOwnerId:owner.body.user.id})).body.record;
  assert.equal((await req(stranger.cookie,route+'/move-preview','POST',{targetOrganisationId:target})).status,403);
  let preview=(await req(cookie,route+'/move-preview','POST',{targetOrganisationId:target})).body.preview;assert.deepEqual(preview.blockers,[]);assert.equal(preview.counts.task,1);assert.equal(preview.copiedLists,1);assert.equal(preview.losingAccess,1);assert.equal(preview.gainingAccess,1);
  task=(await req(cookie,`organisations/${source}/data/task/${task.id}`,'PUT',{...task,title:'Edited after preview'})).body.record;
  assert.equal((await req(cookie,route+'/move','POST',{targetOrganisationId:target,ticket:preview.ticket,confirm:true})).status,409);
  assert.equal((await req(cookie,`organisations/${source}/data/task/${task.id}`)).status,200);
  preview=(await req(cookie,route+'/move-preview','POST',{targetOrganisationId:target})).body.preview;
  assert.equal((await req(cookie,route+'/move','POST',{targetOrganisationId:target,ticket:preview.ticket,confirm:false})).status,400);
  const moved=await req(cookie,route+'/move','POST',{targetOrganisationId:target,ticket:preview.ticket,confirm:true});assert.equal(moved.status,200,JSON.stringify(moved.body));
  const tree=(await req(cookie,'organisations')).body.organisations;assert.ok(!tree.find(org=>org.id===source).units.some(item=>item.id===unit.id));assert.deepEqual(tree.find(org=>org.id===target).units.find(item=>item.id===unit.id).channels,['Email','Website']);
  assert.equal((await req(cookie,`organisations/${source}/data/task/${task.id}`)).status,404);
  const preserved=(await req(cookie,`organisations/${target}/data/task/${task.id}`)).body.record;assert.equal(preserved.id,task.id);assert.equal(preserved.title,'Edited after preview');assert.equal(preserved.groupId,group.id);assert.equal(preserved.overviewId,plan.id);
  assert.equal((await req(cookie,`organisations/${target}/data/strategy/${plan.id}`)).body.record.verticals[0].purpose,'Retention');
  assert.equal((await req(cookie,`strategies/${target}/${unit.id}/foundations`)).body.record.answers.mission,'A useful purpose');
  assert.equal((await req(cookie,`organisations/${target}/data/task/${task.id}/versions`)).body.versions.length,5);
  assert.equal((await req(cookie,`organisations/${source}/data/group/${group.id}`)).status,200);assert.equal((await req(cookie,`organisations/${target}/data/group/${group.id}`)).status,200);
  assert.equal((await req(stranger.cookie,`organisations/${target}/data/task/${task.id}`)).status,403);
  assert.equal((await req(colleague.cookie,`organisations/${target}/data/task/${task.id}`)).status,403);
  assert.equal((await req(destinationMember.cookie,`organisations/${target}/data/task/${task.id}`)).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});

test('shared-company records and cross-company dependencies block moves without altering ownership',async()=>{
 const api=createCompanyApi({databasePath:':memory:'}),server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let cookie='';const req=async(path,method='GET',body)=>{const response=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(response.headers.get('set-cookie'))cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');return {status:response.status,body:await response.json()}};
 try{
  const owner=await req('auth/register','POST',{name:'Owner',email:'block@companymove.test',password:'Company move test password',companyName:'Source'}),source=owner.body.user.company.id;await req('companies','POST',{name:'Destination',activate:false});const target=(await req('organisations')).body.organisations.find(org=>org.name==='Destination').id;
  const createUnit=async name=>(await req(`organisations/${source}/units`,'POST',{name,kind:'Company',channels:[]})).body.unit;
  const a=await createUnit('A'),b=await createUnit('B');const shared=await req(`organisations/${source}/data/task`,'POST',{title:'Shared work',due:'2026-12-01',done:false,unitIds:[a.id,b.id]});assert.equal(shared.status,201);
  const route=`organisations/${source}/units/${a.id}`,preview=(await req(route+'/move-preview','POST',{targetOrganisationId:target})).body.preview;assert.ok(preview.blockers.some(message=>message.includes('multiple companies')));
  assert.equal((await req(route+'/move','POST',{targetOrganisationId:target,ticket:preview.ticket,confirm:true})).status,409);
  assert.equal((await req(`organisations/${source}/data/task/${shared.body.record.id}`)).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});
