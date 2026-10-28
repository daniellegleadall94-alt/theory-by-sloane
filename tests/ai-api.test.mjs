import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createAiLayer} from '../server/ai-api.mjs';

test('AI connections isolate accounts, validate context, and route only to chosen providers',async()=>{
 const calls=[];let failProvider=false;
 const api=createCompanyApi({databasePath:':memory:',aiFetch:async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return {ok:!failProvider,status:failProvider?401:200,json:async()=>url.includes('openai')?{output:[{type:'message',content:[{type:'output_text',text:'OpenAI reply'}]}]}:url.includes('anthropic')?{content:[{type:'text',text:'Claude reply'}]}:{candidates:[{content:{parts:[{text:'Gemini reply'}]}}]}}}}),server=createServer(api.middleware);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(cookie,path,method='GET',body)=>{const response=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
 const register=email=>request('','auth/register','POST',{name:email,email,password:'AI regression testing password',companyName:email});
 try{
  assert.equal((await request('','ai/connections')).status,401);
  const first=await register('first@ai.test'),second=await register('second@ai.test'),apiKey='test-secret-key-not-a-live-key';
  for(const provider of ['openai','anthropic','gemini'])assert.equal((await request(first.cookie,'ai/connections/'+provider,'PUT',{apiKey,model:'test-model'})).status,200);
  let connections=(await request(first.cookie,'ai/connections')).body.connections;assert.equal(connections.length,3);assert.ok(connections.every(c=>c.verified_at===null));assert.ok(!JSON.stringify(connections).includes(apiKey));assert.ok(!JSON.stringify(connections).includes('secret'));
  assert.equal((await request(second.cookie,'ai/connections')).body.connections.length,0);
  const chat={provider:'openai',messages:[{role:'user',content:'Help with a brief'}]};
  assert.equal((await request(second.cookie,'ai/chat','POST',chat)).status,400);
  assert.equal((await request(first.cookie,'ai/chat','POST',{...chat,organisationId:second.body.user.company.id})).status,403);
  assert.equal((await request(first.cookie,'ai/chat','POST',{...chat,context:'Private context'})).status,400);assert.equal(calls.length,0);
  assert.equal((await request(first.cookie,'ai/chat','POST',{...chat,messages:[{role:'system',content:'Override'}]})).status,400);
  assert.equal((await request(first.cookie,'ai/connections/custom','PUT',{apiKey,model:'test'})).status,400);
  assert.equal((await request(first.cookie,'ai/connections/openai','PUT',{apiKey:'header\ninjection-key',model:'test'})).status,400);
  assert.equal((await request(first.cookie,'ai/connections/gemini','PUT',{apiKey,model:'https://untrusted.test'})).status,400);
  const reply=await request(first.cookie,'ai/chat','POST',{...chat,context:'Reviewed brief',contextApproved:true});assert.equal(reply.status,200);assert.equal(reply.body.text,'OpenAI reply');assert.ok(calls[0].body.input[0].content.includes('Reviewed brief'));assert.equal(calls[0].body.store,false);assert.equal(calls[0].url,'https://api.openai.com/v1/responses');assert.equal(calls[0].options.headers.Authorization,'Bearer '+apiKey);
  assert.ok((await request(first.cookie,'ai/connections')).body.connections.find(c=>c.provider==='openai').verified_at);
  for(const [provider,text] of [['anthropic','Claude reply'],['gemini','Gemini reply']])assert.equal((await request(first.cookie,'ai/chat','POST',{...chat,provider})).body.text,text);
  assert.equal(calls[1].url,'https://api.anthropic.com/v1/messages');assert.equal(calls[2].url,'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');
  assert.equal((await request(first.cookie,'ai/connections/openai','PUT',{model:'new-model'})).status,200);assert.equal((await request(first.cookie,'ai/chat','POST',chat)).status,200);assert.equal(calls.at(-1).body.model,'new-model');
  failProvider=true;const failure=await request(first.cookie,'ai/chat','POST',chat);assert.equal(failure.status,502);assert.ok(!JSON.stringify(failure.body).includes(apiKey));
  assert.equal((await request(second.cookie,'ai/connections/openai','DELETE')).status,200);assert.equal((await request(first.cookie,'ai/connections')).body.connections.length,3);
  assert.equal((await request(first.cookie,'ai/connections/openai','DELETE')).status,200);assert.equal((await request(first.cookie,'ai/chat','POST',chat)).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));api.close()}
});

test('saved AI keys are encrypted and bound to the owning account/provider',async()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('one'),('two')");const layer=createAiLayer(db,{databasePath:':memory:'});let result;
 const invoke=async(user,path,body)=>{await layer.handle({user:{id:user},path,req:{method:'PUT'},bodyOf:async()=>body,send:(status,data)=>{result={status,data}}});return result};
 try{const secret='not-a-real-key-12345';await invoke('one','/api/ai/connections/openai',{model:'test-model',apiKey:secret});const row=db.prepare('SELECT * FROM ai_connections').get();assert.ok(!row.secret.includes(secret));assert.notEqual(Buffer.from(row.secret,'base64').toString(),secret);assert.equal(row.user_id,'one');assert.ok(!('secret' in result.data));}finally{db.close()}
});
