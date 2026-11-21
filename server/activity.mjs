// Operational presence only: no URLs, record IDs, content, IPs or user-agent strings.
export function createActivity(db){
 db.exec(`CREATE TABLE IF NOT EXISTS user_activity(user_id TEXT PRIMARY KEY REFERENCES users(id),last_seen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS user_activity_days(user_id TEXT NOT NULL REFERENCES users(id),day TEXT NOT NULL,PRIMARY KEY(user_id,day));`);
 let cleaned=0;
 return {touch(userId,now=Date.now()){
  const previous=db.prepare('SELECT last_seen FROM user_activity WHERE user_id=?').get(userId);
  if(previous&&now-previous.last_seen<60000)return;
  db.prepare('INSERT INTO user_activity VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen=excluded.last_seen').run(userId,now);
  db.prepare('INSERT OR IGNORE INTO user_activity_days VALUES(?,?)').run(userId,new Date(now).toISOString().slice(0,10));
  if(now-cleaned>86400000){db.prepare('DELETE FROM user_activity_days WHERE day<?').run(new Date(now-366*86400000).toISOString().slice(0,10));cleaned=now;}
 }};
}
