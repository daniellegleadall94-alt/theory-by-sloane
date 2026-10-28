import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createCompanyApi} from '../server/company-api.mjs';

async function fixture(databasePath=':memory:'){
 const api=createCompanyApi({databasePath}),server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const call=async(cookie,path,method='GET',body,token)=>{const r=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||'',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const register=(email,extra={})=>call('','auth/register','POST',{name:email.split('@')[0],email,password:'A strong request centre test password',...extra});
 const close=async()=>{await new Promise(resolve=>server.close(resolve));api.close()};return {call,register,close};
}
const submission=(formId,extra={})=>({formId,title:'Sales customer case study',description:'Turn a successful customer project into a case study.',fields:{department:'Sales',purpose:'Build proof for the product launch',deliverables:'Case study and social extract',details:'Customer and commercial details supplied by Sales',responsibilities:'Sales owns introduction, consent and commercial follow-up.'},answers:{},unitIds:[],requestedDeadline:'2026-11-03',requestedPriority:'High',attachments:[],...extra});

test('Sales request → information → approval → assigned delivery → completion, preserving commercial responsibility and isolation',async()=>{
 const f=await fixture();const {call,register}=f;
 try{
  const marketing=await register('marketing@request.test',{companyName:'Request Company'}),org=marketing.body.user.company.id,cookie=marketing.cookie;
  const join=async email=>{const invite=await call(cookie,'company-invitations','POST',{email});return register(email,{invite:invite.body.code})};
  const sales=await join('sales@request.test'),delivery=await join('delivery@request.test'),unrelated=await join('unrelated@request.test'),other=await register('other@request.test',{companyName:'Other Company'});
  assert.equal((await call(sales.cookie,'organisations/'+org+'/members')).status,200);
  const forms=await call(sales.cookie,'requests/forms?organisationId='+org);assert.equal(forms.status,200);assert.equal(forms.body.forms.length,9);const form=forms.body.forms.find(f=>f.name==='Customer Case Study');
  const missing=await call(sales.cookie,'requests/items?organisationId='+org,'POST',submission(form.id,{fields:{purpose:'x',deliverables:'y'}}));assert.equal(missing.status,400);
  let create=await call(sales.cookie,'requests/items?organisationId='+org,'POST',submission(form.id,{status:'Approved',deliveryOwnerId:delivery.body.user.id,requesterName:'Forged requester',attachments:[{name:'brief.txt',url:'data:text/plain;base64,SGVsbG8='}]}));assert.equal(create.status,201,JSON.stringify(create.body));let r=create.body.request;
  assert.equal(r.status,'New');assert.equal(r.requesterId,sales.body.user.id);assert.equal(r.requesterName,'sales');assert.equal(r.deliveryOwnerId,'');assert.equal(r.firstResponseAt,null);
  assert.equal((await call(unrelated.cookie,'requests/items/'+r.id)).status,404);assert.equal((await call(other.cookie,'requests/items/'+r.id)).status,404);assert.equal((await call(unrelated.cookie,'requests/items?organisationId='+org)).body.requests.length,0);
  assert.equal((await call(sales.cookie,'requests/items/'+r.id,'PUT',{...r,status:'Approved'})).status,403);
  let review=await call(cookie,'requests/items/'+r.id,'PUT',{...r,status:'Awaiting Information'});assert.equal(review.status,200,JSON.stringify(review.body));r=review.body.request;assert.ok(r.firstResponseAt);
  assert.equal((await call(cookie,'requests/items/'+r.id+'/reply','POST',{version:r.version,text:'Internal attachment',internal:true,attachments:[{name:'internal.txt',url:'data:text/plain;base64,SGVsbG8='}]})).status,400);
  assert.equal((await call(cookie,'requests/items/'+r.id+'/reply','POST',{version:r.version,text:'Internal staffing discussion',internal:true})).status,200);
  r=(await call(sales.cookie,'requests/items/'+r.id)).body.request;assert.equal(r.comments.length,0);assert.ok(!JSON.stringify(r).includes('Internal staffing'));
  assert.equal((await call(sales.cookie,'requests/items/'+r.id+'/reply','POST',{version:r.version,text:'Forged internal note',internal:true})).status,403);
  const supplied=await call(sales.cookie,'requests/items/'+r.id+'/reply','POST',{version:r.version,text:'Customer introduction and permission are confirmed.'});assert.equal(supplied.status,200,JSON.stringify(supplied.body));r=supplied.body.request;assert.equal(r.status,'Under Review');assert.equal(r.comments.length,1);
  const saved=await call(cookie,'requests/items/'+r.id,'PUT',{...r,status:'Approved',agreedDeadline:'2026-11-10',requestOwnerId:sales.body.user.id,commercialOwnerId:sales.body.user.id,deliveryOwnerId:delivery.body.user.id,contributorIds:[],approverIds:[marketing.body.user.id]});assert.equal(saved.status,200,JSON.stringify(saved.body));r=saved.body.request;assert.equal(r.requestedDeadline,'2026-11-03');assert.equal(r.agreedDeadline,'2026-11-10');
  assert.equal((await call(cookie,'requests/items/'+r.id+'/convert','POST',{version:r.version-1,kind:'task'})).status,409);
  const conversion=await call(cookie,'requests/items/'+r.id+'/convert','POST',{version:r.version,kind:'project'});assert.equal(conversion.status,200,JSON.stringify(conversion.body));r=conversion.body.request;assert.equal(r.work.length,2);assert.equal(r.status,'Scheduled');assert.equal(r.commercialOwnerId,sales.body.user.id);
  assert.equal((await call(cookie,'requests/items/'+r.id+'/convert','POST',{version:r.version,kind:'task'})).status,409);
  let task=(await call(delivery.cookie,'my-work')).body.tasks.find(t=>t.id===r.work.find(w=>w.kind==='task').id);assert.ok(task);assert.equal(task.accountableOwnerId,delivery.body.user.id);assert.equal(task.due,'2026-11-10');assert.equal(task.attachments,undefined);assert.ok(!task.description.includes('Customer and commercial details'));
  assert.equal((await call(delivery.cookie,'requests/work?organisationId='+org+'&taskId='+task.id)).body.requests[0].id,r.id);
  assert.equal((await call(unrelated.cookie,'requests/work?organisationId='+org+'&taskId='+task.id)).body.requests.length,0);
  assert.equal((await call(cookie,'requests/items/'+r.id,'PUT',{...r,status:'Completed'})).status,409);
  task=(await call(delivery.cookie,`organisations/${org}/data/task/${task.id}`,'PUT',{...task,status:'In progress'})).body.record;assert.equal((await call(sales.cookie,'requests/items/'+r.id)).body.request.status,'In Progress');
  const completed=await call(delivery.cookie,`organisations/${org}/data/task/${task.id}/actions`,'POST',{version:task.version,action:'complete'});assert.equal(completed.status,200,JSON.stringify(completed.body));
  r=(await call(sales.cookie,'requests/items/'+r.id)).body.request;assert.equal(r.status,'Completed');assert.ok(r.completedAt);assert.equal(r.commercialOwnerId,sales.body.user.id);assert.equal(r.requestOwnerId,sales.body.user.id);assert.equal(r.attachments.length,1);
  const notifications=await call(sales.cookie,'requests/notifications');assert.ok(notifications.body.notifications.some(n=>n.title.startsWith('Work completed:')));assert.ok(notifications.body.notifications.some(n=>n.title.startsWith('Information required:')));
  assert.equal((await call(other.cookie,'requests/notifications')).body.notifications.length,0);
  assert.equal((await call(cookie,`organisations/${org}/data/task/${task.id}`,'DELETE',{version:completed.body.records[0].version})).status,409);
  const archived=await call(cookie,'requests/items/'+r.id,'PUT',{...r,status:'Archived'});assert.equal(archived.status,200);assert.equal(archived.body.request.completedAt,r.completedAt);r=archived.body.request;
  const preferences={types:['Marketing requests','Assigned tasks','Overdue tasks'],frequency:'off',channel:'in-app',time:'09:00',timeZone:'Europe/London',organisationIds:[]};assert.equal((await call(sales.cookie,'settings/notifications','PUT',preferences)).status,200);assert.equal((await call(sales.cookie,'requests/notifications')).body.notifications.length,0);
  assert.equal((await call(sales.cookie,'settings/notifications','PUT',{...preferences,frequency:'immediate'})).status,200);
  const brand=(await call(cookie,`organisations/${org}/units`,'POST',{name:'Different brand',kind:'Brand',channels:[]})).body.unit;
  assert.equal((await call(cookie,`organisations/${org}/members/${sales.body.user.id}`,'PUT',{role:'member',accessScope:'selected',unitIds:[brand.id]})).status,200);
  assert.equal((await call(sales.cookie,'requests/items/'+r.id)).status,404);assert.equal((await call(sales.cookie,'requests/notifications')).body.notifications.length,0);
 }finally{await f.close()}
});

test('Configurable forms, brand restriction, external invitation isolation, revocation and one-time template conversion',async()=>{
 const f=await fixture();const {call,register}=f;
 try{
  const owner=await register('owner@portal.test',{companyName:'Portal Company'}),org=owner.body.user.company.id,cookie=owner.cookie,root='organisations/'+org;
  const invite=await call(cookie,'company-invitations','POST',{email:'restricted@portal.test'}),restricted=await register('restricted@portal.test',{invite:invite.body.code});
  const a=(await call(cookie,root+'/units','POST',{name:'Brand A',kind:'Brand',channels:[]})).body.unit,b=(await call(cookie,root+'/units','POST',{name:'Brand B',kind:'Brand',channels:[]})).body.unit;
  await call(cookie,root+'/members/'+restricted.body.user.id,'PUT',{role:'collaborator',accessScope:'selected',unitIds:[a.id]});
  const fd={name:'Launch brief',description:'A structured launch request',required:['purpose','requestedDeadline'],questions:[{id:'reference',label:'Product reference',required:true}],responseHours:12,turnaroundDays:5,active:true};
  const newForm=await call(cookie,'requests/forms?organisationId='+org,'POST',fd);assert.equal(newForm.status,201,JSON.stringify(newForm.body));const form=newForm.body.form;
  assert.equal((await call(cookie,'requests/forms?organisationId='+org,'POST',{...fd,questions:[null]})).status,400);
  assert.equal((await call(cookie,'requests/items?organisationId='+org,'POST',null)).status,400);
  assert.equal((await call(restricted.cookie,'requests/forms?organisationId='+org,'POST',fd)).status,403);
  assert.equal((await call(restricted.cookie,'requests/items?organisationId='+org,'POST',submission(form.id,{unitIds:[b.id],answers:{reference:'SKU-2'}}))).status,403);
  assert.equal((await call(restricted.cookie,'requests/items?organisationId='+org,'POST',submission(form.id,{unitIds:[a.id]}))).status,400);
  const own=await call(restricted.cookie,'requests/items?organisationId='+org,'POST',submission(form.id,{unitIds:[a.id],answers:{reference:'SKU-1'}}));assert.equal(own.status,201,JSON.stringify(own.body));
  const makePortal=()=>call(cookie,'requests/invitations?organisationId='+org,'POST',{name:'Approved external partner',formId:form.id,unitIds:[a.id],days:7});
  const first=await makePortal(),second=await makePortal();assert.equal(first.status,201,JSON.stringify(first.body));assert.ok(first.body.token);const token=first.body.token;
  const portal=(path='',method='GET',body,t=token)=>call('','requests/portal'+path,method,body,t);
  const entry=await portal();assert.equal(entry.status,200);assert.equal(entry.body.requests.length,0);assert.equal(entry.body.organisationName,'Portal Company');assert.equal(entry.body.units,undefined);assert.equal(entry.body.members,undefined);
  assert.equal((await call('','requests/items')).status,401);assert.equal((await portal('','POST',submission(form.id,{answers:{reference:'ABC'},unitIds:[b.id],requesterId:owner.body.user.id}))).status,201);
  let r=(await portal()).body.requests[0];assert.deepEqual(r.unitIds,[a.id]);assert.equal(r.requesterId,null);assert.equal(r.requesterName,'Approved external partner');
  assert.equal((await portal('','GET',undefined,second.body.token)).body.requests.length,0);
  assert.equal((await portal('/'+r.id+'/reply','POST',{version:r.version,text:'Cross invitation',internal:false},second.body.token)).status,404);
  assert.equal((await portal('/'+r.id+'/reply','POST',{version:r.version,text:'Internal attempt',internal:true})).status,403);
  r=(await call(cookie,'requests/items/'+r.id,'PUT',{...r,status:'Approved',deliveryOwnerId:owner.body.user.id,agreedDeadline:'2026-11-15'})).body.request;
  const template=await call(cookie,root+'/data/template','POST',{title:'Launch template',visibility:'shared',unitIds:[a.id],blueprint:{title:'Launch artwork',effortHours:4,checklist:[{id:'brief',title:'Check brief',done:true}]}});assert.equal(template.status,201);
  const converted=await call(cookie,'requests/items/'+r.id+'/convert','POST',{version:r.version,kind:'template',templateIds:[template.body.record.id]});assert.equal(converted.status,200,JSON.stringify(converted.body));r=converted.body.request;
  const task=(await call(cookie,root+'/data/task/'+r.work[0].id)).body.record;assert.equal(task.effortHours,4);assert.equal(task.checklist[0].done,false);assert.deepEqual(task.unitIds,[a.id]);
  const portalView=(await portal()).body.requests[0];assert.ok(portalView.work.every(w=>!w.accessible));
  assert.equal((await call(cookie,'requests/invitations?organisationId='+org,'GET')).body.invitations.some(i=>JSON.stringify(i).includes(token)),false);
  assert.equal((await call(cookie,'requests/invitations?organisationId='+org,'DELETE',{id:first.body.id})).status,200);assert.equal((await portal()).status,404);assert.equal((await portal('/'+r.id+'/reply','POST',{version:r.version,text:'After revocation'})).status,404);
 }finally{await f.close()}
});

test('Requests, form snapshots, audit events and hashed portal invitations persist across restarts; overdue alerts deduplicate',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'theory-request-')),file=join(directory,'test.sqlite');let f;
 try{
  f=await fixture(file);const owner=await f.register('owner@persist.test',{companyName:'Persistent requests'}),org=owner.body.user.company.id,cookie=owner.cookie;
  const forms=(await f.call(cookie,'requests/forms?organisationId='+org)).body.forms,form=forms[8];
  const created=await f.call(cookie,'requests/items?organisationId='+org,'POST',submission(form.id,{requestedDeadline:'2020-01-01'})),id=created.body.request.id;
  const invite=await f.call(cookie,'requests/invitations?organisationId='+org,'POST',{name:'External requester',formId:form.id,unitIds:[],days:1});
  await f.call(cookie,'requests/notifications');await f.call(cookie,'requests/notifications');
  assert.equal((await f.call(cookie,'requests/notifications')).body.notifications.filter(n=>n.title.startsWith('Overdue request:')).length,1);
  await f.close();f=null;
  const db=new DatabaseSync(file);assert.equal(db.prepare('SELECT token_hash FROM marketing_request_portals').get().token_hash.includes(invite.body.token),false);db.close();
  f=await fixture(file);const r=(await f.call(cookie,'requests/items/'+id)).body.request;assert.equal(r.title,'Sales customer case study');assert.equal(r.history[0].action,'Request submitted');
  assert.equal((await f.call('','requests/portal','GET',undefined,invite.body.token)).status,200);
  assert.equal((await f.call(cookie,'requests/forms?organisationId='+org,'PUT',{...form,name:'Changed future form',responseHours:100})).status,200);
  assert.equal((await f.call(cookie,'requests/items/'+id)).body.request.formName,form.name);
 }finally{if(f)await f.close();if(dirname(directory)===tmpdir()&&basename(directory).startsWith('theory-request-'))rmSync(directory,{recursive:true,force:true})}
});
