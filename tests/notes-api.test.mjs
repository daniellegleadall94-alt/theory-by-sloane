import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';
import {DatabaseSync} from 'node:sqlite';
import {allowPersonalNotes} from '../server/personal-notes.mjs';

test('personal-note migration retains company notes, shares and personal display preferences',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE companies(id TEXT PRIMARY KEY);CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE notes(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),owner_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);CREATE TABLE note_shares(note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id));CREATE TABLE note_preferences(note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id),pinned INTEGER);INSERT INTO companies VALUES('org');INSERT INTO users VALUES('owner'),('reader');INSERT INTO notes VALUES('note','org','owner','{}',3);INSERT INTO note_shares VALUES('note','reader');INSERT INTO note_preferences VALUES('note','reader',1);`);
  allowPersonalNotes(db);allowPersonalNotes(db);
  assert.equal(db.prepare('SELECT version FROM notes').get().version,3);
  assert.equal(db.prepare('SELECT user_id FROM note_shares').get().user_id,'reader');
  assert.equal(db.prepare('SELECT pinned FROM note_preferences').get().pinned,1);
  db.exec("INSERT INTO notes VALUES('private',NULL,'owner','{}',1)");
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 }finally{db.close()}
});

test('account notes span authorised organisations and keep pins and archives personal',async()=>{
 const api=createCompanyApi({databasePath:':memory:'}),server=createServer(api.middleware);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(cookie,path,method='GET',body)=>{const response=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
 const register=(email,extra)=>request('','auth/register','POST',{name:email,email,password:'Notes regression password 2026',...extra});
 try{
  const owner=await register('owner@notes.test',{companyName:'First organisation'}),outsider=await register('outside@notes.test',{companyName:'Unrelated organisation'});const first=owner.body.user.company.id;
  const invite=await request(owner.cookie,'company-invitations','POST',{email:'reader@notes.test'}),reader=await register('reader@notes.test',{invite:invite.body.code});
  const draft={organisationId:first,title:'Marketing thoughts',body:'An idea',category:'General',tags:['Marketing ideas','My custom tag'],colour:'rose',unitIds:[]};
  const created=await request(owner.cookie,'notes','POST',draft);assert.equal(created.status,201);const id=created.body.note.id;
  assert.equal(created.body.note.organisationName,'First organisation');assert.equal(created.body.note.pinned,false);assert.equal(created.body.note.archived,false);
  const second=(await request(owner.cookie,'companies','POST',{name:'Second organisation'})).body.user.company.id;
  assert.equal((await request(owner.cookie,'notes','POST',{...draft,title:'Another organisation',organisationId:second})).status,201);
  assert.equal((await request(owner.cookie,'notes')).body.notes.length,2);
  assert.equal((await request(outsider.cookie,'notes')).body.notes.length,0);
  assert.equal((await request(outsider.cookie,`notes/${id}/preferences`,'PUT',{pinned:true,archived:false})).status,404);
  assert.equal((await request(outsider.cookie,'notes','POST',draft)).status,403);
  assert.equal((await request(reader.cookie,`notes/${id}/preferences`,'PUT',{pinned:true,archived:false})).status,404);
  // Share from a different active workspace without switching the session.
  assert.equal((await request(owner.cookie,`notes/${id}/shares`,'PUT',{memberIds:[reader.body.user.id]})).status,200);
  const received=(await request(reader.cookie,'notes')).body.notes;assert.equal(received.length,1);assert.equal(received[0].canEdit,false);
  const organised=await request(reader.cookie,`notes/${id}/preferences`,'PUT',{pinned:true,archived:true});assert.equal(organised.status,200);assert.equal(organised.body.note.pinned,true);assert.equal(organised.body.note.archived,true);assert.equal(organised.body.note.version,1);
  const owners=(await request(owner.cookie,'notes')).body.notes.find(n=>n.id===id);assert.equal(owners.pinned,false);assert.equal(owners.archived,false);
  assert.equal((await request(reader.cookie,`notes/${id}`,'PUT',{...draft,title:'Not allowed',version:1})).status,404);
  const changed=await request(owner.cookie,`notes/${id}`,'PUT',{...draft,title:'Updated idea',colour:'lavender',version:1});assert.equal(changed.status,200);assert.deepEqual(changed.body.note.tags,['Marketing ideas','My custom tag']);assert.equal(changed.body.note.colour,'lavender');
  assert.equal((await request(reader.cookie,'notes')).body.notes[0].pinned,true);
  assert.equal((await request(owner.cookie,`notes/${id}/preferences`,'PUT',{pinned:'true',archived:false})).status,400);
  assert.equal((await request(reader.cookie,`notes/${id}/preferences`,'PUT',{pinned:true,archived:false})).body.note.archived,false);
  assert.equal((await request(owner.cookie,`notes/${id}/shares`,'PUT',{memberIds:[]})).status,200);
  assert.equal((await request(reader.cookie,'notes')).body.notes.length,0);
  assert.equal((await request(reader.cookie,`notes/${id}/preferences`,'PUT',{pinned:false,archived:false})).status,404);
  assert.equal((await request(owner.cookie,`notes/${id}`,'DELETE',{})).status,200);
  assert.equal((await request(owner.cookie,'notes')).body.notes.length,1);
  const personal=await request(reader.cookie,'notes','POST',{...draft,organisationId:undefined,personal:true,title:'Private personal note'});assert.equal(personal.status,201);const privateId=personal.body.note.id;assert.equal(personal.body.note.organisationId,null);
  assert.equal((await request(owner.cookie,'notes')).body.notes.some(n=>n.id===privateId),false);
  assert.equal((await request(owner.cookie,'notes/'+privateId)).status,404);
  assert.equal((await request(reader.cookie,'notes/'+privateId+'/shares','PUT',{memberIds:[owner.body.user.id]})).status,400);
  assert.equal((await request(reader.cookie,'notes/'+privateId,'PUT',{...draft,version:1})).status,400);
  assert.equal((await request(reader.cookie,'notes/'+privateId+'/preferences','PUT',{pinned:true,archived:true})).status,200);
  assert.equal((await request(reader.cookie,'settings/organisations/'+first+'/leave','POST',{confirmation:'First organisation',currentPassword:'Notes regression password 2026'})).status,200);
  const kept=(await request(reader.cookie,'notes')).body.notes.find(n=>n.id===privateId);assert.ok(kept);assert.equal(kept.pinned,true);assert.equal(kept.archived,true);
  assert.equal((await request(reader.cookie,'notes/'+privateId,'PUT',{...personal.body.note,title:'Still mine',version:1})).status,200);
  assert.equal((await request(reader.cookie,'notes/'+privateId,'PUT',{...personal.body.note,title:'Stale',version:1})).status,409);
  assert.equal((await request(outsider.cookie,'notes/'+privateId,'DELETE',{})).status,404);
  assert.ok((await request(reader.cookie,'settings/export','POST',{})).body.ownedNotes.some(n=>n.id===privateId));
  await request(reader.cookie,'notes/'+privateId+'/preferences','PUT',{pinned:true,archived:false});
  assert.ok((await request(reader.cookie,'search?q=Still&kind=note&organisationId=personal')).body.results.some(n=>n.id===privateId));
  assert.equal((await request(owner.cookie,'search?q=Still&kind=note')).body.results.some(n=>n.id===privateId),false);
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});
