import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';

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
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});
