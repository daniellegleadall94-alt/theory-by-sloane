import {createTransactionalMail} from './transactional-mail.mjs';

// Messages deliberately contain no task or company content. Opening Theory
// still requires authentication and checks the recipient's current access.
export function createNotificationEmail(db,workspace,options={}){
 const mail=createTransactionalMail(options),now=options.now||Date.now;
 db.exec(`CREATE TABLE IF NOT EXISTS notification_email_delivery(notification_id TEXT PRIMARY KEY,first_attempt INTEGER NOT NULL,last_attempt INTEGER NOT NULL,status TEXT NOT NULL);`);
 let running=false,closed=false,timer;
 const tick=async()=>{
  if(running||closed||!mail.configured())return;
  running=true;
  try{
   const rows=db.prepare(`SELECT n.*,u.email,u.email_confirmed,s.notifications FROM planner_notifications n JOIN users u ON u.id=n.user_id JOIN user_settings s ON s.user_id=u.id LEFT JOIN user_restrictions r ON r.user_id=u.id LEFT JOIN notification_email_delivery d ON d.notification_id=n.id WHERE n.read_at IS NULL AND u.email_confirmed=1 AND COALESCE(r.suspended,0)=0 AND (d.status IS NULL OR d.status='retry') ORDER BY n.created_at`).all();
   let attempts=0;
   for(const n of rows){
    if(closed||attempts>=50)break;
    const pref=JSON.parse(n.notifications),row=db.prepare('SELECT * FROM workspace_records WHERE record_key=?').get(n.record_key);
    if(!['email','both'].includes(pref.channel)||pref.frequency==='off'||!row||!workspace.notificationAllowed(n.user_id,row,workspace.notificationType(n.event_key),'email')||!workspace.notificationReady(n.user_id,n.created_at))continue;
    const prior=db.prepare('SELECT * FROM notification_email_delivery WHERE notification_id=?').get(n.id);
    // Provider idempotency expires after 24 hours. An ambiguous delivery is
    // never retried beyond that window, to avoid duplicate messages.
    if(prior&&now()-prior.first_attempt>=23*3600000){db.prepare("UPDATE notification_email_delivery SET status='unconfirmed' WHERE notification_id=?").run(n.id);continue}
    if(prior&&now()-prior.last_attempt<300000)continue;
    db.prepare("INSERT INTO notification_email_delivery VALUES(?,?,?,'retry') ON CONFLICT(notification_id) DO UPDATE SET last_attempt=excluded.last_attempt").run(n.id,now(),now());
    attempts++;
    try{
     await mail.send({to:n.email,subject:'You have a Theory notification',id:'theory-notification-'+n.id,text:'You have an unread task notification in Theory. Sign in to view your notifications:\n\n'+mail.origin+'/app\n\nYou can change email reminders in Settings > Notifications.'});
     if(!closed)db.prepare("UPDATE notification_email_delivery SET status='accepted' WHERE notification_id=?").run(n.id);
    }catch{/* Retry without logging recipient addresses or notification content. */}
   }
  }finally{running=false}
 };
 return {configured:mail.configured,tick,start(){if(!timer&&mail.configured()){timer=setInterval(()=>void tick().catch(()=>{}),60000);timer.unref()}},close(){closed=true;clearInterval(timer)}};
}
