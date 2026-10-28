import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,rmdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('company membership, invitations, note privacy, read-only sharing and revocation',async()=>{
 const api=createCompanyApi({databasePath:':memory:'});const server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,method='GET',body,cookie='',requestOrigin=origin)=>{const response=await fetch(origin+'/api/'+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
 const register=(email,extra)=>request('auth/register','POST',{name:email.split('@')[0],email,password:'A test password with 24 chars',...extra});
 try{
  assert.equal((await request('company-notes')).status,401);
  const owner=await register('owner@example.test',{companyName:'Company A'});assert.equal(owner.status,201);assert.match(owner.cookie,/theory_session=/);
  const other=await register('other@example.test',{companyName:'Company B'});assert.equal(other.status,201);
  const invitation=await request('company-invitations','POST',{email:'member@example.test'},owner.cookie);assert.equal(invitation.status,201);
  assert.equal((await register('wrong@example.test',{invite:invitation.body.code})).status,400);
  const member=await register('member@example.test',{invite:invitation.body.code});assert.equal(member.status,201);assert.equal(member.body.user.company.id,owner.body.user.company.id);
  assert.equal((await register('reused@example.test',{invite:invitation.body.code})).status,400);
  assert.equal((await request('company-invitations','POST',{email:'unauthorised@example.test'},member.cookie)).status,403);
  const members=await request('company-members','GET',undefined,owner.cookie);assert.equal(members.body.members.length,2);assert.ok(!members.body.members.some(m=>m.id===other.body.user.id));
  const note={title:'Private strategy',body:'Company A only',category:'Strategy',tags:['planning'],colour:'sage'};
  const created=await request('company-notes','POST',note,owner.cookie);assert.equal(created.status,201);const id=created.body.note.id;
  assert.equal((await request('company-notes','GET',undefined,member.cookie)).body.notes.length,0);
  assert.equal((await request('company-notes/'+id+'/shares','PUT',{memberIds:[other.body.user.id]},owner.cookie)).status,400);
  assert.equal((await request('company-notes/'+id+'/shares','PUT',{memberIds:[member.body.user.id]},other.cookie)).status,404);
  assert.equal((await request('company-notes/'+id+'/shares','PUT',{memberIds:[member.body.user.id]},owner.cookie)).status,200);
  const received=await request('company-notes','GET',undefined,member.cookie);assert.equal(received.body.notes[0].title,note.title);assert.equal(received.body.notes[0].canEdit,false);
  assert.equal((await request('company-notes','GET',undefined,other.cookie)).body.notes.length,0);
  assert.equal((await request('company-notes/'+id,'PUT',{...note,version:1},member.cookie)).status,404);
  assert.equal((await request('company-notes/'+id,'DELETE',{},member.cookie)).status,404);
  assert.equal((await request('company-notes/'+id+'/shares','PUT',{memberIds:[]},member.cookie)).status,404);
  assert.equal((await request('company-notes/'+id,'PUT',{...note,title:'Updated strategy',version:1},owner.cookie)).status,200);
  assert.equal((await request('company-notes/'+id,'PUT',{...note,version:1},owner.cookie)).status,409);
  assert.equal((await request('company-notes','GET',undefined,member.cookie)).body.notes[0].title,'Updated strategy');
  assert.equal((await request('company-notes/'+id+'/shares','PUT',{memberIds:[]},owner.cookie)).status,200);
  assert.equal((await request('company-notes','GET',undefined,member.cookie)).body.notes.length,0);
  assert.equal((await request('company-notes','POST',note,owner.cookie,'https://untrusted.example')).status,403);
  assert.equal((await request('company-notes','POST',{...note,colour:'invalid'},owner.cookie)).status,400);
  assert.equal((await request('company-notes/'+id,'DELETE',{},owner.cookie)).status,200);
  assert.equal((await request('auth/logout','POST',{},owner.cookie)).status,200);
  assert.equal((await request('company-notes','GET',undefined,owner.cookie)).status,401);
  const login=await request('auth/login','POST',{email:'owner@example.test',password:'A test password with 24 chars'});assert.equal(login.status,200);
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});

test('one account can create and join companies while personal and company contexts remain separate',async()=>{
 const api=createCompanyApi({databasePath:':memory:'});const server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,method='GET',body,cookie='',workspace)=>{const response=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...(workspace?{'X-Theory-Workspace':workspace}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
 const register=(email,companyName)=>request('auth/register','POST',{name:email,email,password:'A test password with 24 chars',companyName});
 try{
  const owner=await register('owner@example.test','First company');const first=owner.body.user.company.id;
  const outsider=await register('outsider@example.test','Other company');const otherId=outsider.body.user.company.id;
  const firstNote=await request('company-notes','POST',{title:'First company note',body:'Only here',category:'General',tags:[],colour:'sage'},owner.cookie);
  const created=await request('companies','POST',{name:'Second company'},owner.cookie);assert.equal(created.status,201);const second=created.body.user.company.id;assert.equal(created.body.user.companies.length,2);
  assert.equal((await request('company-notes','GET',undefined,owner.cookie)).body.notes.length,0);
  assert.equal((await request('company-notes/'+firstNote.body.note.id,'DELETE',{},owner.cookie)).status,404);
  assert.equal((await request('workspace','PUT',{companyId:otherId},owner.cookie)).status,403);
  assert.equal((await request('workspace','PUT',{companyId:first},owner.cookie)).status,200);
  assert.equal((await request('session','GET',undefined,owner.cookie)).body.user.company.id,first);
  assert.equal((await request('company-notes','GET',undefined,owner.cookie)).body.notes[0].title,'First company note');
  assert.equal((await request('company-notes','GET',undefined,owner.cookie,second)).status,409);
  const personal=await request('workspace','PUT',{companyId:null},owner.cookie);assert.equal(personal.status,200);assert.equal(personal.body.user.company,null);assert.equal(personal.body.user.companies.length,2);
  assert.equal((await request('company-notes','GET',undefined,owner.cookie)).status,403);
  assert.equal((await request('company-invitations','POST',{email:'member@example.test'},owner.cookie)).status,403);
  assert.equal((await request('workspace','PUT',{companyId:second},owner.cookie)).status,200);
  const invite=await request('company-invitations','POST',{email:'outsider@example.test'},owner.cookie);assert.equal(invite.status,201);
  const joined=await request('companies/join','POST',{invite:invite.body.code},outsider.cookie);assert.equal(joined.status,200);assert.equal(joined.body.user.company.id,second);assert.equal(joined.body.user.role,'member');assert.equal(joined.body.user.companies.length,2);
  assert.equal((await request('companies/join','POST',{invite:invite.body.code},outsider.cookie)).status,400);
  const members=await request('company-members','GET',undefined,owner.cookie);assert.equal(members.body.members.length,2);
  const note=await request('company-notes','POST',{title:'Second company note',body:'Same company',category:'General',tags:[],colour:'sage'},owner.cookie);
  assert.equal((await request('company-notes/'+note.body.note.id+'/shares','PUT',{memberIds:[outsider.body.user.id]},owner.cookie)).status,200);
  assert.equal((await request('company-notes','GET',undefined,outsider.cookie)).body.notes.length,1);
  await request('workspace','PUT',{companyId:otherId},outsider.cookie);assert.equal((await request('company-notes','GET',undefined,outsider.cookie)).body.notes.length,0);
  await request('workspace','PUT',{companyId:second},outsider.cookie);assert.equal((await request('company-notes','GET',undefined,outsider.cookie)).body.notes.length,1);
  const renamed=await request('workspace-names','PUT',{personalNickname:'My desk',companies:[{id:second,nickname:'Client studio'}]},owner.cookie);assert.equal(renamed.status,200);assert.equal(renamed.body.user.personalNickname,'My desk');assert.equal(renamed.body.user.company.nickname,'Client studio');assert.equal(renamed.body.user.company.name,'Second company');
  const teammateProfile=await request('session','GET',undefined,outsider.cookie);assert.equal(teammateProfile.body.user.company.nickname,'');assert.equal(teammateProfile.body.user.personalNickname,'');
  assert.equal((await request('workspace-names','PUT',{personalNickname:'Do not save',companies:[{id:first,nickname:'No access'}]},outsider.cookie)).status,400);
  assert.equal((await request('session','GET',undefined,outsider.cookie)).body.user.personalNickname,'');
  assert.equal((await request('workspace-names','PUT',{personalNickname:'a'.repeat(61),companies:[]},owner.cookie)).status,400);
  await request('workspace','PUT',{companyId:null},owner.cookie);const ownPersonal=await request('session','GET',undefined,owner.cookie);assert.equal(ownPersonal.body.user.personalNickname,'My desk');assert.equal(ownPersonal.body.user.companies.find(c=>c.id===second).nickname,'Client studio');
  await request('workspace','PUT',{companyId:second},owner.cookie);assert.equal((await request('session','GET',undefined,owner.cookie)).body.user.company.nickname,'Client studio');
  const logo='data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  const branded=await request('workspace-names','PUT',{personalNickname:'My desk',personalLogo:logo,companies:[{id:second,nickname:'Client studio',logo}]},owner.cookie);assert.equal(branded.status,200);assert.equal(branded.body.user.personalLogo,logo);assert.equal(branded.body.user.company.logo,logo);
  assert.equal((await request('session','GET',undefined,outsider.cookie)).body.user.company.logo,logo);
  assert.equal((await request('workspace-names','PUT',{personalNickname:'Should not save',companies:[{id:second,nickname:'',logo:''}]},outsider.cookie)).status,403);
  assert.equal((await request('session','GET',undefined,outsider.cookie)).body.user.personalNickname,'');
  assert.equal((await request('workspace-names','PUT',{personalNickname:'My desk',personalLogo:'data:image/svg+xml;base64,PHN2Zz4=',companies:[]},owner.cookie)).status,400);
  assert.equal((await request('workspace-names','PUT',{personalNickname:'My desk',personalLogo:'data:image/webp;base64,AAAA',companies:[]},owner.cookie)).status,400);
  assert.equal((await request('workspace-names','PUT',{personalNickname:'My desk',personalLogo:'data:image/webp;base64,'+'A'.repeat(48000),companies:[]},owner.cookie)).status,400);
  const relogin=await request('auth/login','POST',{email:'owner@example.test',password:'A test password with 24 chars'});assert.equal(relogin.body.user.personalLogo,logo);assert.equal(relogin.body.user.companies.find(c=>c.id===second).logo,logo);
  const cleared=await request('workspace-names','PUT',{personalNickname:'My desk',personalLogo:'',companies:[{id:second,nickname:'Client studio',logo:''}]},owner.cookie);assert.equal(cleared.status,200);assert.equal(cleared.body.user.personalLogo,'');assert.equal(cleared.body.user.company.logo,'');
  const reset=await request('workspace-names','PUT',{personalNickname:'',companies:[{id:second,nickname:''}]},owner.cookie);assert.equal(reset.status,200);assert.equal(reset.body.user.company.nickname,'');assert.equal(reset.body.user.company.name,'Second company');
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});

test('legacy company accounts, sessions and notes survive the membership migration and restart',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'theory-membership-test-'));const path=join(directory,'legacy.sqlite');let api;let server;
 try{
  const legacy=new DatabaseSync(path);legacy.exec(`PRAGMA foreign_keys=ON;CREATE TABLE companies(id TEXT PRIMARY KEY,name TEXT NOT NULL);CREATE TABLE users(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL);CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);INSERT INTO companies VALUES('old-company','Existing company');INSERT INTO users VALUES('old-user','old-company','Existing owner','existing@example.test','fixture-only','owner');`);
  const token='isolated-test-session';legacy.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),'old-user',Date.now()+60000);legacy.exec('CREATE TABLE notes(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),owner_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1)');legacy.prepare('INSERT INTO notes(id,company_id,owner_id,data) VALUES(?,?,?,?)').run('legacy-note','old-company','old-user',JSON.stringify({title:'Original legacy note',body:'Keep this existing note',category:'General',tags:[],colour:'sage',updatedAt:new Date().toISOString()}));legacy.close();
  api=createCompanyApi({databasePath:path});api.close();api=createCompanyApi({databasePath:path});server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(origin+'/api/session',{headers:{Cookie:'theory_session='+token}});const data=await response.json();assert.equal(response.status,200);assert.equal(data.user.company.id,'old-company');assert.equal(data.user.companies.length,1);assert.equal(data.user.role,'owner');
  const created=await fetch(origin+'/api/company-notes',{method:'POST',headers:{Cookie:'theory_session='+token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({title:'Preserved note',body:'Existing membership',category:'General',tags:[],colour:'sage'})});assert.equal(created.status,201);
  await new Promise(resolve=>server.close(resolve));server=null;api.close();api=null;
  api=createCompanyApi({databasePath:path});server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const again=await fetch(`http://127.0.0.1:${server.address().port}/api/company-notes`,{headers:{Cookie:'theory_session='+token}});const restored=(await again.json()).notes;assert.ok(restored.some(n=>n.title==='Original legacy note'));assert.ok(restored.some(n=>n.title==='Preserved note'));
 }finally{if(server)await new Promise(resolve=>server.close(resolve));api?.close();for(const suffix of ['','-wal','-shm'])if(existsSync(path+suffix))rmSync(path+suffix);rmdirSync(directory)}
});
