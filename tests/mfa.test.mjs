import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateSync} from 'otplib';
import {createCompanyApi} from '../server/company-api.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('MFA gates account access, revokes old sessions and consumes recovery codes once',async()=>{
 const api=createCompanyApi({databasePath:':memory:',ownerOptions:{env:{}}}),server=createServer(api.middleware);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,cookie='',body)=>{const r=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const password='Disposable MFA password 2026',email='mfa@example.test',login=()=>request('auth/login','',{email,password});
 try{
  const owner=await request('auth/register','',{name:'MFA test',email,password,companyName:'Test'});assert.equal(owner.status,201);
  const other=await login();
  assert.equal((await request('settings/mfa/setup',owner.cookie,{currentPassword:'wrong'})).status,403);
  const setup=await request('settings/mfa/setup',owner.cookie,{currentPassword:password});assert.equal(setup.status,200);
  const enabled=await request('settings/mfa/enable',owner.cookie,{currentPassword:password,code:generateSync({secret:setup.body.secret})});assert.equal(enabled.status,200);assert.equal(enabled.body.recoveryCodes.length,10);
  assert.equal((await request('session',other.cookie)).body.user,null);
  assert.equal((await request('settings/mfa',owner.cookie)).body.enabled,true);
  const pending=await login();assert.equal(pending.body.user,null);assert.equal((await request('session',pending.cookie)).body.mfaRequired,true);
  assert.equal((await request('settings/mfa',pending.cookie)).status,403);
  assert.equal((await request('auth/mfa/verify',pending.cookie,{code:'wrong'})).status,401);
  const verified=await request('auth/mfa/verify',pending.cookie,{code:enabled.body.recoveryCodes[0]});assert.equal(verified.status,200);assert.equal(verified.body.user.id,owner.body.user.id);assert.notEqual(verified.cookie,pending.cookie);
  assert.equal((await request('session',pending.cookie)).body.user,null);
  const again=await login();assert.equal((await request('auth/mfa/verify',again.cookie,{code:enabled.body.recoveryCodes[0]})).status,401);
  assert.equal((await request('settings/mfa/disable',verified.cookie,{currentPassword:password,code:enabled.body.recoveryCodes[1]})).status,200);
  assert.equal((await request('session',owner.cookie)).body.user,null);
  assert.ok((await login()).body.user);
 }finally{await new Promise(r=>server.close(r));api.close()}
});
test('MFA secrets persist encrypted and owner password sign-in requires a second factor',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'theory-mfa-')),databasePath=join(dir,'test.sqlite');let api,server,origin;
 const start=async()=>{api=createCompanyApi({databasePath,ownerOptions:{env:{}}});server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`};
 const stop=async()=>{await new Promise(r=>server.close(r));api.close()};
 const request=async(path,cookie='',body)=>{const r=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 await start();const email='owner@mfa.test',password='Disposable owner MFA password';
 try{
  const owner=await request('auth/register','',{name:'Owner',email,password,companyName:'Test'});
  execFileSync(process.execPath,['scripts/owner-access.mjs','--database',databasePath,'--email',email,'--grant'],{stdio:'pipe'});
  const previous=await request('owner/auth/login','',{email,password});assert.equal(previous.status,200);
  const setup=await request('settings/mfa/setup',owner.cookie,{currentPassword:password});
  const result=await request('settings/mfa/enable',owner.cookie,{currentPassword:password,code:generateSync({secret:setup.body.secret})});assert.equal(result.status,200);
  assert.equal((await request('owner/users',previous.cookie)).status,401);
  const db=new DatabaseSync(databasePath);try{const stored=db.prepare('SELECT secret FROM user_mfa').get().secret;assert.notEqual(stored,setup.body.secret);assert.ok(!JSON.stringify(db.prepare('SELECT * FROM mfa_recovery').all()).includes(result.body.recoveryCodes[0]))}finally{db.close()}
  assert.equal(readFileSync(join(dir,'mfa-master.key')).length,32);
  await stop();await start();
  assert.equal((await request('owner/auth/login','',{email,password})).status,400);
  assert.equal((await request('owner/auth/login','',{email,password,code:result.body.recoveryCodes[0]})).status,200);
  assert.equal((await request('owner/auth/login','',{email,password,code:result.body.recoveryCodes[0]})).status,401);
  const pending=await request('auth/login','',{email,password});assert.equal((await request('auth/mfa/verify',pending.cookie,{code:result.body.recoveryCodes[1]})).status,200);
 }finally{await stop();rmSync(dir,{recursive:true,force:true})}
});
