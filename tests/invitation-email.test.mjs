import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';
test('invitation email is explicit, organisation-bound, expiring and does not claim inbox delivery',async()=>{
 const deliveries=[];let accepted=true,now=Date.now();
 const env={THEORY_PUBLIC_URL:'https://theory.example',THEORY_MAIL_PROVIDER:'resend',THEORY_MAIL_API_KEY:'test-only',THEORY_MAIL_FROM:'Theory <hello@theory.example>'};
 const api=createCompanyApi({databasePath:':memory:',recoveryOptions:{env,now:()=>now,fetchImpl:async(url,options)=>{deliveries.push(JSON.parse(options.body));return {ok:accepted}}}}),server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=async(path,body,cookie='')=>{const r=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 try{
  const owner=await request('auth/register',{name:'Owner',email:'owner@invite.test',password:'Invitation test password',companyName:'Owner company'}),other=await request('auth/register',{name:'Other',email:'other@invite.test',password:'Invitation test password',companyName:'Other company'});
  const invite=await request('company-invitations',{email:'teammate@invite.test'},owner.cookie);assert.equal(deliveries.length,0);
  assert.equal((await request('company-invitations/email',null,owner.cookie)).body.configured,true);
  assert.equal((await request('company-invitations/email',{code:invite.body.code},other.cookie)).status,404);assert.equal(deliveries.length,0);
  assert.deepEqual((await request('company-invitations/email',{code:invite.body.code,email:'wrong@invite.test'},owner.cookie)).body,{accepted:true});assert.deepEqual(deliveries[0].to,['teammate@invite.test']);assert.ok(deliveries[0].text.includes(invite.body.code));
  accepted=false;assert.equal((await request('company-invitations/email',{code:invite.body.code},owner.cookie)).status,503);
  now+=8*86400000;assert.equal((await request('company-invitations/email',{code:invite.body.code},owner.cookie)).status,404);
 }finally{await new Promise(r=>server.close(r));api.close()}
});
