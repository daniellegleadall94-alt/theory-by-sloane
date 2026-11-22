import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';
test('password reset emails use one-time expiring links, generic responses and session revocation',async()=>{
 let now=Date.now();const deliveries=[];const env={THEORY_PUBLIC_URL:'https://theory.example',THEORY_MAIL_PROVIDER:'resend',THEORY_MAIL_API_KEY:'test-only',THEORY_MAIL_FROM:'Theory <hello@theory.example>'};
 const api=createCompanyApi({databasePath:':memory:',recoveryOptions:{env,now:()=>now,fetchImpl:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');deliveries.push(JSON.parse(options.body));return {ok:true}}}}),server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=async(path,body,cookie='',originHeader=origin)=>{const response=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:originHeader,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
 try{
  const registered=await request('auth/register',{name:'Recovery tester',email:'recovery@example.test',password:'Original test password',companyName:'Recovery company'});assert.equal(registered.status,201);
  const known=await request('auth/recovery/request',{email:'recovery@example.test'}),unknown=await request('auth/recovery/request',{email:'unknown@example.test'});assert.deepEqual(known.body,unknown.body);assert.equal(known.status,200);assert.ok(!JSON.stringify(known.body).includes('reset='));await api.flushRecovery();assert.equal(deliveries.length,1);
  const token=deliveries[0].text.match(/#reset=([a-f0-9]{64})/)[1];
  assert.equal((await request('auth/recovery/reset',{token,password:'Changed test password'},'','https://evil.test')).status,403);
  assert.equal((await request('auth/recovery/reset',{token,password:'short'})).status,400);
  assert.equal((await request('auth/recovery/reset',{token,password:'Changed test password'})).status,200);
  assert.equal((await request('auth/recovery/reset',{token,password:'Another test password'})).status,400);
  assert.equal((await request('session',null,registered.cookie)).body.user,null);
  assert.equal((await request('auth/login',{email:'recovery@example.test',password:'Original test password'})).status,401);
  assert.equal((await request('auth/login',{email:'recovery@example.test',password:'Changed test password'})).status,200);
  await request('auth/recovery/request',{email:'recovery@example.test'});await api.flushRecovery();const expired=deliveries.at(-1).text.match(/#reset=([a-f0-9]{64})/)[1];now+=1800001;
  assert.equal((await request('auth/recovery/reset',{token:expired,password:'Another test password'})).status,400);
  for(let i=0;i<5;i++)assert.equal((await request('auth/recovery/request',{email:'limit@example.test'})).status,200);
  assert.equal((await request('auth/recovery/request',{email:'limit@example.test'})).status,429);
 }finally{await api.flushRecovery();await new Promise(r=>server.close(r));api.close()}
});
test('unconfigured recovery does not claim email delivery',async()=>{
 const api=createCompanyApi({databasePath:':memory:',recoveryOptions:{env:{}}}),server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{assert.deepEqual(await (await fetch(origin+'/api/auth/recovery/status')).json(),{configured:false});assert.equal((await fetch(origin+'/api/auth/recovery/request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.test'})})).status,503)}finally{await new Promise(r=>server.close(r));api.close()}
});
test('email changes require current password, possession of the new inbox and the same signed-in account',async()=>{
 const emails=[];const env={THEORY_PUBLIC_URL:'https://theory.example',THEORY_MAIL_PROVIDER:'resend',THEORY_MAIL_API_KEY:'test',THEORY_MAIL_FROM:'Theory <hello@theory.example>'};
 const api=createCompanyApi({databasePath:':memory:',recoveryOptions:{env,fetchImpl:async(_url,options)=>{emails.push(JSON.parse(options.body));return {ok:true}}}}),server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=async(path,body,cookie='')=>{const r=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const register=email=>request('auth/register',{name:'Email test',email,password:'Current testing password',companyName:'Email company'});
 try{
  const owner=await register('old@email.test'),other=await register('other@email.test');
  assert.equal((await request('settings/email/request',{email:'new@email.test',currentPassword:'wrong'},owner.cookie)).status,403);
  assert.equal((await request('settings/email/request',{email:'new@email.test',currentPassword:'Current testing password'},owner.cookie)).status,200);assert.equal(emails[0].to[0],'new@email.test');
  assert.equal((await request('session',null,owner.cookie)).body.user.email,'old@email.test');
  const token=emails[0].text.match(/#verify-email=([a-f0-9]{64})/)[1];
  assert.equal((await request('settings/email/confirm',{token},other.cookie)).status,400);
  assert.equal((await request('settings/email/confirm',{token},owner.cookie)).status,200);
  assert.equal((await request('session',null,owner.cookie)).body.user,null);
  assert.equal((await request('auth/login',{email:'old@email.test',password:'Current testing password'})).status,401);
  const login=await request('auth/login',{email:'new@email.test',password:'Current testing password'});assert.equal(login.status,200);
  assert.equal((await request('settings/email/status',null,login.cookie)).body.verified,true);
  assert.equal((await request('settings/email/confirm',{token},login.cookie)).status,400);
  assert.equal((await request('settings/email/request',{email:'other@email.test',currentPassword:'Current testing password'},login.cookie)).status,409);
 }finally{await new Promise(r=>server.close(r));api.close()}
});
