export function createCalendarLayer(db){
 db.exec("CREATE TABLE IF NOT EXISTS calendar_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL DEFAULT '{}')");
 return {async handle({req,path,user,bodyOf,send}){
  if(path!=='/api/calendar/preferences')return false;
  if(req.method==='GET')return send(200,{preferences:JSON.parse(db.prepare('SELECT data FROM calendar_preferences WHERE user_id=?').get(user.id)?.data||'{}')});
  if(req.method==='PUT'){
   const data=await bodyOf(req);const fail=()=>{throw Object.assign(Error('Choose valid calendar preferences.'),{status:400})};
   if(!['Day','Week','Month','Year','List'].includes(data.view)||!Array.isArray(data.hidden)||data.hidden.length>1000||data.hidden.some(k=>typeof k!=='string'||k.length>150)||!data.colours||typeof data.colours!=='object'||Array.isArray(data.colours)||Object.keys(data.colours).length>1000||Object.entries(data.colours).some(([k,v])=>k.length>150||typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v)))fail();
   db.prepare('INSERT INTO calendar_preferences VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(user.id,JSON.stringify({view:data.view,hidden:[...new Set(data.hidden)],colours:data.colours}));return send(200,{ok:true});
  }
  throw Object.assign(Error('Method not allowed.'),{status:405});
 }};
}
