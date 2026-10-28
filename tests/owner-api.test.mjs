import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createCompanyApi} from '../server/company-api.mjs';

test('Owner Console requires a separate MFA identity, enforces platform roles and exposes metadata only',async()=>{
 let api,claims={sub:'staff-owner',iss:'https://staff-id.test/',amr:['pwd','mfa'],auth_time:Math.floor(Date.now()/1000)},grants=0;
 const server=createServer((req,res)=>api.middleware(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const client={discovery:async()=>({}),enableNonRepudiationChecks:()=>{},randomState:randomUUID,randomNonce:randomUUID,randomPKCECodeVerifier:randomUUID,calculatePKCECodeChallenge:async v=>v,buildAuthorizationUrl:(_c,p)=>new URL('https://staff-id.test/authorize?'+new URLSearchParams(p)),authorizationCodeGrant:async(_c,url,checks)=>{grants++;assert.equal(url.searchParams.get('state'),checks.expectedState);assert.ok(checks.expectedNonce);assert.ok(checks.pkceCodeVerifier);assert.equal(checks.idTokenExpected,true);return {claims:()=>claims}}};
 const env={THEORY_OWNER_URL:origin,THEORY_OWNER_ISSUER:'https://staff-id.test/',THEORY_OWNER_CLIENT_ID:'isolated-test',THEORY_OWNER_CLIENT_SECRET:'not-a-real-client-secret',THEORY_OWNER_STAFF:JSON.stringify([{subject:'staff-owner',name:'Platform operator',roles:['Platform Owner']},{subject:'support',name:'Support operator',roles:['Customer Support']},{subject:'technical',name:'Technical operator',roles:['Technical Administrator']}])};
 api=createCompanyApi({databasePath:':memory:',ownerOptions:{env,client}});
 const request=async(path,{cookie='',method='GET',body,originHeader=origin}={})=>{const response=await fetch(origin+'/api/'+path,{method,redirect:'manual',headers:{Origin:originHeader,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:response.status,body:response.headers.get('content-type')?.includes('json')?await response.json():null,cookies:response.headers.getSetCookie(),location:response.headers.get('location')}};
 const login=async()=>{const start=await request('owner/auth/start',{method:'POST',body:{}});assert.equal(start.status,200);const state=new URL(start.body.url).searchParams.get('state'),cookie=start.cookies[0].split(';')[0];return {result:await request('owner/auth/callback?state='+state+'&code=test-code',{cookie}),state,cookie}};
 try{
  const customer=await request('auth/register',{method:'POST',body:{name:'Customer owner',email:'customer@owner.test',password:'Customer test password only',companyName:'Customer organisation'}});assert.equal(customer.status,201);const customerCookie=customer.cookies[0].split(';')[0],id=customer.body.user.id,org=customer.body.user.company.id;
  assert.equal((await request('owner/overview',{cookie:customerCookie})).status,401);assert.equal((await request('owner/session',{cookie:customerCookie})).body.staff,null);
  await request('personal/data/task',{cookie:customerCookie,method:'POST',body:{title:'PRIVATE TASK MUST NOT LEAK',due:'2026-11-01'}});
  claims={...claims,amr:['pwd']};assert.match((await login()).result.location,/denied/);
  claims={...claims,amr:['mfa'],sub:'not-approved'};assert.match((await login()).result.location,/denied/);
  claims={...claims,sub:'staff-owner',auth_time:Math.floor(Date.now()/1000)-400};assert.match((await login()).result.location,/denied/);
  claims={...claims,auth_time:Math.floor(Date.now()/1000)};const accepted=await login();assert.match(accepted.result.location,/success/);const ownerCookie=accepted.result.cookies.find(c=>c.startsWith('theory_owner=')).split(';')[0];assert.match(accepted.result.cookies.join(';'),/HttpOnly/);assert.match(accepted.result.cookies.join(';'),/Path=\/api\/owner/);
  const grantCount=grants;assert.match((await request('owner/auth/callback?state='+accepted.state,{cookie:accepted.cookie})).location,/expired/);assert.equal(grants,grantCount);
  const summary=(await request('owner/overview?range=7',{cookie:ownerCookie})).body;assert.equal(summary.metrics.find(m=>m.id==='users').value,1);assert.equal(summary.metrics.find(m=>m.id==='organisations').value,1);assert.equal(summary.metrics.find(m=>m.label==='Monthly recurring revenue').value,null);assert.ok(!JSON.stringify(summary).includes('PRIVATE TASK'));
  assert.equal((await request('owner/overview?range=custom&from=wrong&to=wrong',{cookie:ownerCookie})).status,400);
  for(const path of ['users','organisations','billing','technical','audit']){const result=await request('owner/'+path,{cookie:ownerCookie});assert.equal(result.status,200,path);assert.ok(!JSON.stringify(result.body).includes('PRIVATE TASK'));assert.ok(!JSON.stringify(result.body).includes('Customer test password'))}
  const details=(await request('owner/users/'+id,{cookie:ownerCookie})).body;assert.equal(details.memberships[0].id,org);assert.ok(!('password' in details.user));
  const organisation=(await request('owner/organisations/'+org,{cookie:ownerCookie})).body;assert.equal(organisation.members[0].role,'owner');assert.ok(!JSON.stringify(organisation).includes('PRIVATE TASK'));
  assert.equal((await request('owner/users/'+id+'/suspend',{cookie:ownerCookie,method:'POST',body:{confirmation:'wrong'}})).status,400);
  assert.equal((await request('owner/users/'+id+'/suspend',{cookie:ownerCookie,method:'POST',body:{confirmation:'customer@owner.test'},originHeader:'https://evil.test'})).status,403);
  assert.equal((await request('owner/users/'+id+'/suspend',{cookie:ownerCookie,method:'POST',body:{confirmation:'customer@owner.test'}})).status,200);assert.equal((await request('settings/account',{cookie:customerCookie})).status,401);
  const signIn=()=>request('auth/login',{method:'POST',body:{email:'customer@owner.test',password:'Customer test password only'}});assert.equal((await signIn()).status,403);
  assert.equal((await request('owner/users/'+id+'/reactivate',{cookie:ownerCookie,method:'POST',body:{confirmation:'customer@owner.test'}})).status,200);assert.equal((await signIn()).status,200);
  assert.equal((await request('owner/layout',{cookie:ownerCookie,method:'PUT',body:{layout:[{id:'users',hidden:true}]}})).status,200);assert.equal((await request('owner/layout',{cookie:ownerCookie})).body.layout[0].hidden,true);
  assert.equal((await request('owner/export',{cookie:ownerCookie,method:'POST',body:{confirmation:'EXPORT METRICS'}})).status,200);
  claims={...claims,sub:'support'};const supportCookie=(await login()).result.cookies.find(c=>c.startsWith('theory_owner=')).split(';')[0];assert.equal((await request('owner/users',{cookie:supportCookie})).status,200);for(const path of ['overview','billing','technical','audit'])assert.equal((await request('owner/'+path,{cookie:supportCookie})).status,403);assert.equal((await request('owner/users/'+id+'/suspend',{cookie:supportCookie,method:'POST',body:{confirmation:'customer@owner.test'}})).status,403);
  claims={...claims,sub:'technical'};const techCookie=(await login()).result.cookies.find(c=>c.startsWith('theory_owner=')).split(';')[0];assert.equal((await request('owner/users',{cookie:techCookie})).status,403);assert.equal((await request('owner/technical',{cookie:techCookie})).status,200);
  const events=(await request('owner/audit',{cookie:ownerCookie})).body.events;assert.ok(events.some(e=>e.action==='suspend'));assert.ok(events.some(e=>e.action==='export-aggregate-metrics'));assert.ok(!JSON.stringify(events).includes('Customer test password'));
  await request('owner/logout',{cookie:ownerCookie,method:'POST',body:{}});assert.equal((await request('owner/users',{cookie:ownerCookie})).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});

test('unconfigured staff authentication stays closed',async()=>{const api=createCompanyApi({databasePath:':memory:',ownerOptions:{env:{}}}),server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;try{const session=await fetch(origin+'/api/owner/session');assert.deepEqual(await session.json(),{configured:false,staff:null});const start=await fetch(origin+'/api/owner/auth/start',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(start.status,503)}finally{await new Promise(resolve=>server.close(resolve));api.close()}});
