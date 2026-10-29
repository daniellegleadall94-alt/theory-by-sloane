import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createCompanyApi} from '../server/company-api.mjs';

test('Theory password owner sign-in requires an explicit grant and revokes access on account or permission changes',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'theory-owner-password-')),databasePath=join(directory,'test.sqlite');let api=createCompanyApi({databasePath,ownerOptions:{env:{}}}),server=createServer(api.middleware);
 const listen=async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`};let origin=await listen();
 const request=async(path,{cookie='',method='GET',body,originHeader=origin}={})=>{const res=await fetch(origin+'/api/'+path,{method,headers:{Origin:originHeader,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0],setCookie:res.headers.get('set-cookie')}};
 const password='Test owner password 2026',nextPassword='New owner password 2026',email='owner@password.test';
 const login=(address=email,secret=password)=>request('owner/auth/login',{method:'POST',body:{email:address,password:secret}});
 const edit=fn=>{const db=new DatabaseSync(databasePath);try{return fn(db)}finally{db.close()}};
 const grant=(address,flag)=>execFileSync(process.execPath,['scripts/owner-access.mjs','--database',databasePath,'--email',address,flag],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 try{
  const register=address=>request('auth/register',{method:'POST',body:{name:address,email:address,password,companyName:address}});
  const owner=await register(email),other=await register('other@password.test');assert.equal(owner.status,201);
  assert.equal((await login()).status,401);assert.equal((await request('owner/users',{cookie:owner.cookie})).status,401);
  grant(email,'--grant');assert.equal((await request('owner/session')).body.passwordLogin,true);
  assert.equal((await login('other@password.test')).status,401);assert.equal((await login(email,'Wrong password')).status,401);
  const signedIn=await login();assert.equal(signedIn.status,200);assert.equal(signedIn.body.staff.method,'password');assert.deepEqual(signedIn.body.staff.roles,['Platform Owner']);assert.match(signedIn.setCookie,/HttpOnly/);assert.match(signedIn.setCookie,/SameSite=Strict/);assert.match(signedIn.setCookie,/Path=\/api\/owner/);let cookie=signedIn.cookie;
  assert.equal((await request('owner/users',{cookie})).status,200);assert.equal((await request('owner/users',{cookie:other.cookie})).status,401);
  const forged=await request('owner/auth/login',{method:'POST',originHeader:'https://evil.test',body:{email,password}});assert.equal(forged.status,403);
  // A new password login rotates this browser's owner cookie.
  const rotated=await request('owner/auth/login',{cookie,method:'POST',body:{email,password}});assert.equal(rotated.status,200);assert.equal((await request('owner/users',{cookie})).status,401);cookie=rotated.cookie;
  edit(db=>db.prepare("UPDATE owner_sessions SET authenticated_at=? WHERE method='password'").run(Date.now()-360000));
  assert.equal((await request('owner/users/'+other.body.user.id+'/suspend',{cookie,method:'POST',body:{confirmation:'other@password.test'}})).status,403);
  cookie=(await login()).cookie;
  assert.equal((await request('owner/users/'+owner.body.user.id+'/suspend',{cookie,method:'POST',body:{confirmation:email}})).status,400);
  assert.equal((await request('settings/security/password',{cookie:owner.cookie,method:'PUT',body:{currentPassword:password,newPassword:nextPassword}})).status,200);
  assert.equal((await request('owner/users',{cookie})).status,401);assert.equal((await login()).status,401);cookie=(await login(email,nextPassword)).cookie;
  // Explicit grants and independent owner sessions survive restarts.
  await new Promise(r=>server.close(r));api.close();api=createCompanyApi({databasePath,ownerOptions:{env:{}}});server=createServer(api.middleware);origin=await listen();
  assert.equal((await request('owner/users',{cookie})).status,200);
  grant(email,'--revoke');assert.equal((await request('owner/users',{cookie})).status,401);assert.equal((await login(email,nextPassword)).status,401);
  grant(email,'--grant');cookie=(await login(email,nextPassword)).cookie;
  assert.throws(()=>grant('other@password.test','--grant'));
  edit(db=>db.prepare('INSERT INTO user_restrictions VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET suspended=1').run(owner.body.user.id));assert.equal((await request('owner/users',{cookie})).status,401);assert.equal((await login(email,nextPassword)).status,401);
  edit(db=>db.prepare('UPDATE user_restrictions SET suspended=0 WHERE user_id=?').run(owner.body.user.id));await login(email,nextPassword);
  for(let i=0;i<5;i++)assert.equal((await login(email,'bad password')).status,401);assert.equal((await login(email,nextPassword)).status,429);
  const audit=edit(db=>JSON.stringify(db.prepare('SELECT actor,action,target FROM owner_audit').all()));assert.ok(audit.includes('password-owner-access-granted'));assert.ok(!audit.includes(password));assert.ok(!audit.includes(nextPassword));assert.ok(!audit.includes('bad password'));
 }finally{await new Promise(r=>server.close(r));api.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+'\\theory-owner-password-'));rmSync(directory,{recursive:true,force:true})}
});
