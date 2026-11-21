import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createCalendarSubscriptions} from '../server/calendar-subscriptions.mjs';

for(const provider of ['microsoft','google'])test(provider+' change notifications validate secrets/resources, renew before expiry and stop on disconnect',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE calendar_accounts(id TEXT PRIMARY KEY,provider TEXT);');db.prepare('INSERT INTO calendar_accounts VALUES(?,?)').run('account',provider);
 let time=Date.parse('2026-11-21T12:00:00Z'),changes=0,watches=0,renewals=0,stops=0,body;
 const account={id:'account',provider};
 const subscriptions=createCalendarSubscriptions(db,{origin:()=> 'https://theory.example',clock:()=>time,changed:id=>{assert.equal(id,account.id);changes++},request:async(a,url,options)=>{
  assert.equal(a.id,account.id);const payload=options.body?JSON.parse(options.body):null;
  if(url.endsWith('/watch')||url.endsWith('/subscriptions')){watches++;body=payload;return provider==='google'?{id:body.id,resourceId:'resource-'+watches,expiration:String(time+2*86400000)}:{id:'subscription-'+watches,expirationDateTime:body.expirationDateTime}}
  if(options.method==='PATCH'){renewals++;return {expirationDateTime:payload.expirationDateTime}}
  if(options.method==='DELETE'||url.endsWith('/channels/stop')){stops++;return {}}
  throw Error('Unexpected provider request');
 }});
 const webhook=async(headers={},payload,query='')=>{const row=db.prepare('SELECT * FROM calendar_subscriptions ORDER BY expires DESC LIMIT 1').get(),path='/api/calendar/webhooks/'+provider+'/'+row.id,res={headers:{},setHeader(k,v){this.headers[k]=v},end(value){this.body=value}};await subscriptions.webhook({req:{method:'POST',url:path+query,headers},res,path,bodyOf:async()=>payload});return res};
 try{
  await subscriptions.ensure(account,'theory');assert.equal(watches,1);assert.equal(subscriptions.status(account.id).state,'connected');const row=db.prepare('SELECT * FROM calendar_subscriptions').get();assert.ok(!row.token_hash.includes(body.token||body.clientState));
  await subscriptions.ensure(account,'theory');assert.equal(watches,1);
  if(provider==='microsoft'){
   const challenge=await webhook({},undefined,'?validationToken=hello%20Theory');assert.equal(challenge.statusCode,200);assert.equal(challenge.body,'hello Theory');
   assert.equal((await webhook({},{value:[{clientState:'wrong',subscriptionId:row.provider_id}]})).statusCode,403);
   assert.equal((await webhook({},{value:[{clientState:body.clientState,subscriptionId:'other-subscription'}]})).statusCode,403);
   assert.equal((await webhook({},{value:[{clientState:body.clientState,subscriptionId:row.provider_id}]})).statusCode,202);
   assert.equal(changes,1);await webhook({},{value:[{clientState:body.clientState,subscriptionId:row.provider_id}]});assert.equal(changes,1);
   time+=5.5*86400000;await subscriptions.ensure(account,'theory');assert.equal(renewals,1);assert.equal(watches,1);
  }else{
   const headers={'x-goog-channel-id':row.id,'x-goog-channel-token':body.token,'x-goog-resource-id':row.resource_id,'x-goog-resource-state':'exists'};
   assert.equal((await webhook({...headers,'x-goog-channel-token':'wrong'})).statusCode,403);
   assert.equal((await webhook({...headers,'x-goog-resource-id':'other'})).statusCode,403);
   assert.equal((await webhook(headers)).statusCode,204);assert.equal(changes,1);
   time+=1.5*86400000;await subscriptions.ensure(account,'theory');assert.equal(watches,2);assert.equal(stops,1);assert.equal(db.prepare('SELECT count(*) n FROM calendar_subscriptions').get().n,1);
  }
  await subscriptions.disconnect(account);assert.ok(stops>=1);assert.equal(db.prepare('SELECT count(*) n FROM calendar_subscriptions').get().n,0);
 }finally{subscriptions.close();db.close()}
});

test('local preview keeps polling without attempting public push registration',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE calendar_accounts(id TEXT PRIMARY KEY,provider TEXT)');let requests=0;
 const subscriptions=createCalendarSubscriptions(db,{origin:()=> 'http://127.0.0.1:5173',request:()=>{requests++},changed:()=>{}});
 await subscriptions.ensure({id:'test',provider:'microsoft'},'calendar');assert.equal(requests,0);assert.equal(subscriptions.status('test').state,'polling');subscriptions.close();db.close();
});
