import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const hash=value=>createHash('sha256').update(String(value||'')).digest();
export function createCalendarSubscriptions(db,{request,origin,changed,clock=()=>Date.now()}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS calendar_subscriptions(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES calendar_accounts(id) ON DELETE CASCADE,provider_id TEXT,resource_id TEXT,token_hash TEXT NOT NULL,expires INTEGER NOT NULL,last_notification INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '');CREATE INDEX IF NOT EXISTS calendar_subscription_account ON calendar_subscriptions(account_id);`);
 const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 let stopped=false;const locks=new Map();
 const call=(account,url,method,body)=>request(account,url,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 const publicOrigin=()=>{try{const url=new URL(origin());return url.protocol==='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)?url.origin:null}catch{return null}};
 const removeRemote=async(account,row)=>{if(!row.provider_id)return;try{if(account.provider==='google')await call(account,'https://www.googleapis.com/calendar/v3/channels/stop','POST',{id:row.id,resourceId:row.resource_id});else await call(account,'https://graph.microsoft.com/v1.0/subscriptions/'+encodeURIComponent(row.provider_id),'DELETE')}catch{/* The provider subscription expires even if its account grant was revoked. */}};
 async function ensure(account,calendar){
  if(stopped||!publicOrigin())return;if(locks.has(account.id))return locks.get(account.id);
  const work=(async()=>{
   run('DELETE FROM calendar_subscriptions WHERE account_id=? AND provider_id IS NULL AND expires<?',account.id,clock());
   const rows=all('SELECT * FROM calendar_subscriptions WHERE account_id=? ORDER BY expires DESC',account.id),current=rows[0],expires=clock()+6*86400000;
   if(current?.provider_id&&current.expires>clock()+86400000)return;
   if(account.provider==='microsoft'&&current?.provider_id&&current.expires>clock()){
    try{const result=await call(account,'https://graph.microsoft.com/v1.0/subscriptions/'+encodeURIComponent(current.provider_id),'PATCH',{expirationDateTime:new Date(expires).toISOString()});if(stopped)return;run("UPDATE calendar_subscriptions SET expires=?,error='' WHERE id=?",Date.parse(result.expirationDateTime)||expires,current.id);return}catch(error){if(error.providerStatus!==404)throw error}
   }
   const id=randomUUID(),token=randomBytes(32).toString('base64url'),address=publicOrigin()+'/api/calendar/webhooks/'+account.provider+'/'+id;
   run('INSERT INTO calendar_subscriptions(id,account_id,token_hash,expires) VALUES(?,?,?,?)',id,account.id,hash(token).toString('hex'),expires);
   try{
    const result=account.provider==='google'?await call(account,'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendar)+'/events/watch','POST',{id,type:'web_hook',address,token,expiration:String(expires)}):await call(account,'https://graph.microsoft.com/v1.0/subscriptions','POST',{changeType:'created,updated,deleted',notificationUrl:address,lifecycleNotificationUrl:address,resource:'me/events',expirationDateTime:new Date(expires).toISOString(),clientState:token});
    if(stopped)return;
    if(!result.id||account.provider==='google'&&!result.resourceId)throw Error('The provider did not establish change notifications.');
    run("UPDATE calendar_subscriptions SET provider_id=?,resource_id=?,expires=?,error='' WHERE id=?",result.id,result.resourceId||null,account.provider==='google'?Number(result.expiration)||expires:Date.parse(result.expirationDateTime)||expires,id);
    for(const old of rows){await removeRemote(account,old);if(stopped)return;run('DELETE FROM calendar_subscriptions WHERE id=?',old.id)}
   }catch(error){if(!stopped)run('UPDATE calendar_subscriptions SET expires=?,error=? WHERE id=?',clock()+60000,'Push connection failed; polling remains active.',id);throw error}
  })();locks.set(account.id,work);try{return await work}finally{locks.delete(account.id)}
 }
 return {
  ensure,
  status(accountId){const row=one('SELECT * FROM calendar_subscriptions WHERE account_id=? ORDER BY expires DESC LIMIT 1',accountId);return !publicOrigin()?{state:'polling',message:'Polling is active. Push notifications need a public HTTPS address.'}:row?.provider_id&&row.expires>clock()?{state:'connected',expiresAt:new Date(row.expires).toISOString(),message:row.error||'Provider change notifications connected.'}:{state:'polling',message:row?.error||'Polling is active while push notifications connect.'}},
  async disconnect(account){if(locks.has(account.id))await locks.get(account.id).catch(()=>{});for(const row of all('SELECT * FROM calendar_subscriptions WHERE account_id=?',account.id)){await removeRemote(account,row);if(!stopped)run('DELETE FROM calendar_subscriptions WHERE id=?',row.id)}},
  close(){stopped=true},
  async webhook({req,res,path,bodyOf}){
   const match=path.match(/^\/api\/calendar\/webhooks\/(microsoft|google)\/([a-f0-9-]{36})$/);if(!match)return false;
   const finish=status=>{res.statusCode=status;res.setHeader('Cache-Control','no-store');res.end();return true};
   if(req.method!=='POST')return finish(405);
   const row=one('SELECT s.*,a.provider FROM calendar_subscriptions s JOIN calendar_accounts a ON a.id=s.account_id WHERE s.id=?',match[2]);if(!row||row.provider!==match[1]||row.expires<clock())return finish(404);
   const challenge=new URL(req.url,'http://localhost').searchParams.get('validationToken');
   if(row.provider==='microsoft'&&challenge!==null){if(challenge.length>4096)return finish(400);res.statusCode=200;res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.end(challenge);return true}
   const matches=value=>timingSafeEqual(hash(value),Buffer.from(row.token_hash,'hex'));
   let accepted=false,renew=false;
   if(row.provider==='google'){
    if(!matches(req.headers['x-goog-channel-token'])||req.headers['x-goog-channel-id']!==row.id)return finish(403);
    // Google's initial sync message can arrive before watch() returns the resource ID.
    if(!row.resource_id&&req.headers['x-goog-resource-state']==='sync')return finish(204);
    if(req.headers['x-goog-resource-id']!==row.resource_id)return finish(403);accepted=true;
   }else{
    const body=await bodyOf(req,65536);if(!Array.isArray(body.value)||body.value.length>1000)return finish(400);
    for(const item of body.value)if(matches(item.clientState)&&item.subscriptionId===row.provider_id&&row.provider_id){accepted=true;if(['subscriptionRemoved','reauthorizationRequired','missed'].includes(item.lifecycleEvent))renew=true}
    if(!accepted)return finish(403);
   }
   if(renew)run('UPDATE calendar_subscriptions SET expires=0 WHERE id=?',row.id);
   if(accepted&&row.last_notification<=clock()-10000){run('UPDATE calendar_subscriptions SET last_notification=? WHERE id=?',clock(),row.id);changed(row.account_id)}
   return finish(row.provider==='google'?204:202);
  }
 };
}
