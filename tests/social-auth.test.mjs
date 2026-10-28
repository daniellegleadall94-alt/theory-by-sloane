import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPairSync,sign} from 'node:crypto';
import * as oidc from 'openid-client';
import {createCompanyApi} from '../server/company-api.mjs';

test('social sign-in validates signed OIDC tokens, binds browser state, links explicitly and isolates personal accounts',async()=>{
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
 let nonce='',subject='social-one',address='social@signin.test',verified=true,badSignature=false,badNonce=false;const exchanges=[];
 const jwt=()=>{const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const content=encode({alg:'RS256',kid:'test-key'})+'.'+encode({iss:'https://accounts.google.com',aud:'test-client',sub:subject,nonce:badNonce?'wrong-nonce':nonce,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300});return content+'.'+(badSignature?Buffer.from('invalid-signature').toString('base64url'):sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url'))};
 const fakeFetch=async(url,options)=>{const endpoint=String(url);if(endpoint.endsWith('/token')){exchanges.push(String(options.body));return Response.json({access_token:'test-access-token',token_type:'Bearer',id_token:jwt(),expires_in:300})}if(endpoint.endsWith('/jwks'))return Response.json({keys:[jwk]});if(endpoint.endsWith('/userinfo'))return Response.json({sub:subject,email:address,email_verified:verified,name:'Social user'});throw Error('Unexpected provider endpoint')};
 const client={...oidc,discovery:async()=>{const config=new oidc.Configuration({issuer:'https://accounts.google.com',authorization_endpoint:'https://accounts.google.com/auth',token_endpoint:'https://accounts.google.com/token',jwks_uri:'https://accounts.google.com/jwks',userinfo_endpoint:'https://accounts.google.com/userinfo',id_token_signing_alg_values_supported:['RS256'],response_types_supported:['code']},'test-client','test-secret');config[oidc.customFetch]=fakeFetch;return config}};
 const env={THEORY_PUBLIC_URL:'',THEORY_GOOGLE_CLIENT_ID:'test-client',THEORY_GOOGLE_CLIENT_SECRET:'test-secret'};
 const api=createCompanyApi({databasePath:':memory:',socialOptions:{env,client}}),server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;env.THEORY_PUBLIC_URL=origin;
 const request=async(path,method='GET',body,cookie='')=>{const response=await fetch(origin+'/api/'+path,{method,redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});const text=await response.text();return {status:response.status,body:text?JSON.parse(text):null,location:response.headers.get('location'),cookies:response.headers.getSetCookie()}};
 const start=async(cookie='',intent='signin')=>{const result=await request('auth/social/google/start','POST',{intent},cookie);assert.equal(result.status,200);const url=new URL(result.body.url);nonce=url.searchParams.get('nonce');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('scope'),'openid profile email');return {state:url.searchParams.get('state'),cookie:result.cookies[0].split(';')[0]}};
 const callback=(flow,cookie=flow.cookie)=>request(`auth/social/google/callback?state=${flow.state}&code=test-code`,'GET',undefined,cookie);
 const sessionCookie=result=>result.cookies.find(cookie=>cookie.startsWith('theory_session='))?.split(';')[0];
 try{
  const providers=(await request('auth/social/providers')).body.providers;assert.equal(providers.find(p=>p.id==='google').enabled,true);assert.equal(providers.find(p=>p.id==='microsoft').enabled,false);
  assert.equal((await request('auth/social/microsoft/start','POST',{})).status,503);
  assert.equal((await request('auth/social/google/start','POST',{intent:'link'})).status,401);
  const original=await start();assert.match(original.cookie,/theory_oauth=/);assert.match((await callback(original,'')).location,/expired/);assert.equal(exchanges.length,0);
  const created=await callback(original);assert.match(created.location,/created/);assert.equal(created.status,303);assert.ok(exchanges[0].includes('code_verifier='));const cookie=sessionCookie(created);assert.ok(cookie);assert.equal(created.cookies.length,2);assert.match(created.cookies[0],/Max-Age=0/);
  let user=(await request('session','GET',undefined,cookie)).body.user;assert.equal(user.company,null);assert.equal(user.companies.length,0);const id=user.id;
  assert.match((await callback(original)).location,/expired/);
  assert.equal((await request('auth/login','POST',{email:address,password:'not a usable password'})).status,401);
  assert.match((await request('auth/social/google/start','POST',{intent:'signin'},cookie)).body.error,/Link account/);
  assert.equal((await request('auth/logout','POST',{},cookie)).status,200);const repeat=await callback(await start());assert.match(repeat.location,/success/);assert.equal((await request('session','GET',undefined,sessionCookie(repeat))).body.user.id,id);
  subject='bad-nonce';address='nonce@signin.test';let flow=await start();badNonce=true;assert.match((await callback(flow)).location,/failed/);badNonce=false;
  flow=await start();badSignature=true;assert.match((await callback(flow)).location,/failed/);badSignature=false;
  const existing=await request('auth/register','POST',{name:'Existing user',email:'existing@signin.test',password:'Existing account password',companyName:'Existing company'});const existingCookie=sessionCookie(existing);subject='provider-existing';address='existing@signin.test';
  assert.match((await callback(await start())).location,/link-required/);
  const linked=await callback(await start(existingCookie,'link'));assert.match(linked.location,/linked/);const linkedCookie=sessionCookie(linked);assert.equal((await request('session','GET',undefined,linkedCookie)).body.user.id,existing.body.user.id);
  subject='social-one';address='social@signin.test';assert.match((await callback(await start(linkedCookie,'link'))).location,/already-linked/);
  // Logging out the initiating session invalidates an outstanding account-link attempt.
  subject='unlinked-provider';flow=await start(linkedCookie,'link');await request('auth/logout','POST',{},linkedCookie);assert.match((await callback(flow)).location,/expired/);
  // No extra organisation memberships are created for a personal social account.
  assert.equal((await request('organisations','GET',undefined,sessionCookie(repeat))).body.organisations.length,0);
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});
