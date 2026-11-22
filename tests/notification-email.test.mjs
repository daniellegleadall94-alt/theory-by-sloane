import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createNotificationEmail} from '../server/notification-email.mjs';
test('task emails require consent, verified address and current access; retry is bounded and idempotent',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id TEXT,email TEXT,email_confirmed INTEGER);CREATE TABLE user_settings(user_id TEXT,notifications TEXT);CREATE TABLE user_restrictions(user_id TEXT,suspended INTEGER);CREATE TABLE workspace_records(record_key TEXT);CREATE TABLE planner_notifications(id TEXT,user_id TEXT,record_key TEXT,event_key TEXT,created_at TEXT,read_at TEXT);INSERT INTO users VALUES('u','user@example.test',0);INSERT INTO user_settings VALUES('u','{"channel":"email","frequency":"daily"}');INSERT INTO workspace_records VALUES('r');INSERT INTO planner_notifications VALUES('n','u','r','mention:x','2026-01-01',NULL);`);
 let allowed=true,ready=true,ok=true,now=1000000;const sent=[];
 const workspace={notificationAllowed:()=>allowed,notificationReady:()=>ready,notificationType:()=> 'Comments & mentions'};
 const options={env:{THEORY_PUBLIC_URL:'https://theory.example',THEORY_MAIL_PROVIDER:'resend',THEORY_MAIL_API_KEY:'test',THEORY_MAIL_FROM:'test@theory.example'},now:()=>now,fetchImpl:async(url,o)=>{sent.push(o);return {ok}}};
 const worker=createNotificationEmail(db,workspace,options);
 try{
  await worker.tick();assert.equal(sent.length,0);
  db.exec('UPDATE users SET email_confirmed=1');allowed=false;await worker.tick();assert.equal(sent.length,0);
  allowed=true;ready=false;await worker.tick();assert.equal(sent.length,0);ready=true;
  db.exec("UPDATE user_settings SET notifications='{}'");await worker.tick();assert.equal(sent.length,0);
  db.exec(`UPDATE user_settings SET notifications='{"channel":"both","frequency":"daily"}'`);
  db.exec("INSERT INTO user_restrictions VALUES('u',1)");await worker.tick();assert.equal(sent.length,0);db.exec('DELETE FROM user_restrictions');
  ok=false;await worker.tick();assert.equal(sent.length,1);await worker.tick();assert.equal(sent.length,1);
  now+=300000;ok=true;await worker.tick();assert.equal(sent.length,2);assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);
  await worker.tick();assert.equal(sent.length,2);assert.equal(db.prepare('SELECT read_at FROM planner_notifications').get().read_at,null);
  assert.equal(JSON.parse(sent[1].body).text.includes('mention:x'),false);
  db.exec("INSERT INTO planner_notifications VALUES('retry','u','r','assignment:x','2026-01-01',NULL)");ok=false;await worker.tick();now+=24*3600000;await worker.tick();assert.equal(sent.length,3);assert.equal(db.prepare("SELECT status FROM notification_email_delivery WHERE notification_id='retry'").get().status,'unconfirmed');
 }finally{worker.close();db.close()}
});
