import {randomUUID} from 'node:crypto';
export function createOwnerSupport(db,audit){
 db.exec(`CREATE TABLE IF NOT EXISTS support_cases(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),subject TEXT NOT NULL,status TEXT NOT NULL,priority TEXT NOT NULL,assigned_to TEXT,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS support_case_notes(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES support_cases(id),actor TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);`);
 const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
 const statuses=['Open','In progress','Waiting on customer','Resolved'],priorities=['Low','Normal','High'];
 return async({req,path,actor,bodyOf,send})=>{
  const match=path.match(/^\/api\/owner\/support(?:\/([a-f0-9-]{36}))?$/);if(!match)return false;
  if(!actor.permissions.includes('support'))fail(403,'Support permission is required.');
  const id=match[1],all=(sql,...args)=>db.prepare(sql).all(...args);
  const detail=()=>{const record=db.prepare('SELECT * FROM support_cases WHERE id=?').get(id);if(!record)fail(404,'Support case not found.');return record};
  if(req.method==='GET'){
   if(id){audit(actor.subject,'view-support-case',id);return send(200,{record:detail(),notes:all('SELECT * FROM support_case_notes WHERE case_id=? ORDER BY created_at,id',id)})}
   const params=new URL(req.url,'http://localhost').searchParams,query=(params.get('q')||'').slice(0,200),status=params.get('status')||'all';
   if(status!=='all'&&!statuses.includes(status))fail(400,'Choose a supported case status.');
   const rows=all('SELECT * FROM support_cases WHERE (?=\'all\' OR status=?) AND (instr(lower(subject),lower(?))>0 OR id=?) ORDER BY updated_at DESC LIMIT 200',status,status,query,query);
   return send(200,{cases:rows,limit:200});
  }
  const body=await bodyOf(req),note=typeof body.note==='string'?body.note.trim():'';
  if(note.length>4000)fail(400,'Keep the note below 4,000 characters.');
  if(!id&&req.method==='POST'){
   const subject=typeof body.subject==='string'?body.subject.trim():'';if(!subject||subject.length>180)fail(400,'Enter a subject up to 180 characters.');
   const userId=body.userId||null;if(userId&&(typeof userId!=='string'||!db.prepare('SELECT id FROM users WHERE id=?').get(userId)))fail(400,'Choose an existing customer account ID.');
   if(!priorities.includes(body.priority))fail(400,'Choose a priority.');
   const newId=randomUUID(),now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{
    db.prepare('INSERT INTO support_cases VALUES(?,?,?,?,?,?,1,?,?)').run(newId,userId,subject,'Open',body.priority,actor.subject,now,now);
    if(note)db.prepare('INSERT INTO support_case_notes VALUES(?,?,?,?,?)').run(randomUUID(),newId,actor.subject,note,now);
    audit(actor.subject,'create-support-case',newId);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e}return send(201,{id:newId});
  }
  if(id&&req.method==='PUT'){
   const record=detail();if(body.version!==record.version)fail(409,'This case changed. Refresh before saving.');
   if(!statuses.includes(body.status)||!priorities.includes(body.priority)||!['keep','me','unassigned'].includes(body.assignment))fail(400,'Choose valid case settings.');
   const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{
    db.prepare('UPDATE support_cases SET status=?,priority=?,assigned_to=?,version=version+1,updated_at=? WHERE id=?').run(body.status,body.priority,body.assignment==='me'?actor.subject:body.assignment==='unassigned'?null:record.assigned_to,now,id);
    if(note)db.prepare('INSERT INTO support_case_notes VALUES(?,?,?,?,?)').run(randomUUID(),id,actor.subject,note,now);
    audit(actor.subject,'update-support-case',id);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e}return send(200,{ok:true});
  }
  fail(405,'Method not allowed.');
 };
}
