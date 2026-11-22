import {randomUUID,createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function createNotificationDigest(db,{mail,eligible,load=id=>db.prepare('SELECT * FROM planner_notifications WHERE id=?').get(id),now,closed}){
 db.exec(`CREATE TABLE IF NOT EXISTS notification_email_batches(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,recipient_hash TEXT NOT NULL,frequency TEXT NOT NULL,notification_ids TEXT NOT NULL,first_attempt INTEGER NOT NULL,last_attempt INTEGER NOT NULL,status TEXT NOT NULL);`);
 const finish=(batch,status)=>{
  db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE notification_email_batches SET status=? WHERE id=?').run(status,batch.id);for(const id of JSON.parse(batch.notification_ids))db.prepare('UPDATE notification_email_delivery SET status=? WHERE notification_id=?').run(status,id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 };
 return async rows=>{
  const grouped=new Map();
  for(const n of rows){
   if(db.prepare('SELECT 1 FROM notification_email_delivery WHERE notification_id=?').get(n.id))continue;
   const current=eligible(n);if(!current||!['daily','weekly','custom'].includes(current.pref.frequency))continue;
   if(!grouped.has(n.user_id))grouped.set(n.user_id,{current,items:[]});grouped.get(n.user_id).items.push(n);
  }
  for(const [userId,{current,items}] of grouped){
   const id=randomUUID();db.exec('BEGIN IMMEDIATE');try{
    db.prepare("INSERT INTO notification_email_batches VALUES(?,?,?,?,?,?,0,'retry')").run(id,userId,hash(current.email),current.pref.frequency,JSON.stringify(items.map(n=>n.id)),now());
    for(const n of items)db.prepare("INSERT INTO notification_email_delivery VALUES(?,?,?,'batched')").run(n.id,now(),now());
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e}
  }
  for(const batch of db.prepare("SELECT * FROM notification_email_batches WHERE status='retry' ORDER BY first_attempt LIMIT 50").all()){
   if(closed())return;
   if(now()-batch.first_attempt>=23*3600000){finish(batch,'unconfirmed');continue}
   if(batch.last_attempt&&now()-batch.last_attempt<300000)continue;
   const ids=JSON.parse(batch.notification_ids),items=ids.map(load);
   const recipients=items.map(n=>n&&!n.read_at&&eligible(n));
   // If access, address or preferences changed, never replay a stale briefing.
   if(recipients.some(r=>!r||hash(r.email)!==batch.recipient_hash||r.pref.frequency!==batch.frequency)){finish(batch,'unconfirmed');continue}
   db.prepare('UPDATE notification_email_batches SET last_attempt=? WHERE id=?').run(now(),batch.id);
   try{
    await mail.send({to:recipients[0].email,id:'theory-digest-'+batch.id,subject:'Your Theory briefing',text:'You have '+ids.length+' unread notification'+(ids.length===1?'':'s')+' in this briefing. Sign in to view the details:\n\n'+mail.origin+'/app\n\nChange your delivery preferences in Settings > Notifications.'});
    if(!closed())finish(batch,'accepted');
   }catch{/* The stable batch and provider key are retained for a bounded retry. */}
  }
 };
}
