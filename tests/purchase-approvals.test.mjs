import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';
test('purchase approval requires a different authorised reviewer and current financial details',async()=>{
 const api=createCompanyApi({databasePath:':memory:'}),server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=async(cookie,path,method='GET',body)=>{const r=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const register=(email,extra)=>request('','auth/register','POST',{name:email,email,password:'Purchase test password',...extra});
 try{
  const owner=await register('owner@purchase.test',{companyName:'Purchases'}),other=await register('other@purchase.test',{companyName:'Other'}),org=owner.body.user.company.id,root='organisations/'+org;
  const invite=await request(owner.cookie,'company-invitations','POST',{email:'reviewer@purchase.test'}),reviewer=await register('reviewer@purchase.test',{invite:invite.body.code});
  await request(owner.cookie,root+'/members/'+reviewer.body.user.id,'PUT',{role:'manager',accessScope:'all',unitIds:[]});
  const spend={id:'design',financialEntry:true,title:'Design work',amount:100,currency:'GBP',stage:'Planned',date:'2026-12-01',supplier:'Studio',channel:'Design',unitIds:[],spendAllocations:[{unitId:'',campaignId:'',amount:100}]};
  assert.equal((await request(owner.cookie,root+'/data/expense','POST',spend)).status,201);const endpoint=root+'/expenses/design/approval';
  assert.equal((await request(other.cookie,endpoint)).status,404);
  assert.equal((await request(owner.cookie,endpoint,'POST',{version:1,approverId:owner.body.user.id})).status,400);
  assert.equal((await request(owner.cookie,endpoint,'POST',{version:1,approverId:reviewer.body.user.id})).status,201);
  let detail=(await request(reviewer.cookie,endpoint)).body;assert.equal(detail.expense.purchaseApprovalRequired,true);const approval=detail.history[0].id;
  assert.equal((await request(owner.cookie,endpoint,'PUT',{version:2,approvalId:approval,outcome:'Granted',reason:''})).status,403);
  assert.equal((await request(owner.cookie,root+'/data/expense/design','PUT',{...detail.expense,stage:'Committed'})).status,400);
  assert.equal((await request(owner.cookie,root+'/data/expense/design','PUT',{...detail.expense,purchaseApprovalRequired:false})).status,400);
  assert.equal((await request(reviewer.cookie,endpoint,'PUT',{version:2,approvalId:approval,outcome:'Granted',reason:'Budget checked'})).status,200);
  assert.equal((await request(owner.cookie,root+'/data/expense/design','PUT',{...detail.expense,stage:'Committed',amount:120,spendAllocations:[{unitId:'',campaignId:'',amount:120}]})).status,400);
  assert.equal((await request(owner.cookie,root+'/data/expense/design','PUT',{...detail.expense,stage:'Committed'})).status,200);
  detail=(await request(owner.cookie,endpoint)).body;assert.equal(detail.history[0].stale,false);
  assert.equal((await request(owner.cookie,root+'/data/expense/design','PUT',{...detail.expense,stage:'Actual'})).status,200);
  detail=(await request(owner.cookie,endpoint)).body;
  assert.equal((await request(owner.cookie,root+'/data/expense/design','PUT',{...detail.expense,stage:'Planned'})).status,200);
  detail=(await request(owner.cookie,endpoint)).body;
  assert.equal((await request(owner.cookie,endpoint,'POST',{version:detail.expense.version,approverId:reviewer.body.user.id})).status,201);
  detail=(await request(owner.cookie,endpoint)).body;
  assert.equal((await request(owner.cookie,root+'/data/expense/design','PUT',{...detail.expense,stage:'Committed'})).status,400,'A new pending review supersedes an earlier approval');
  const notices=(await request(reviewer.cookie,'workflows/notifications')).body.notifications;assert.ok(notices.some(n=>n.expenseId==='design'));
  await request(owner.cookie,root+'/members/'+reviewer.body.user.id,'PUT',{role:'member',accessScope:'all',unitIds:[]});
  assert.equal((await request(reviewer.cookie,endpoint,'PUT',{version:detail.expense.version,approvalId:detail.history[0].id,outcome:'Granted',reason:''})).status,403);
 }finally{await new Promise(r=>server.close(r));api.close()}
});
