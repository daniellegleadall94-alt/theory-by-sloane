import {randomUUID} from 'node:crypto';
export function createAssetProofing(db,w,{audit}){
 const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a),fail=(status,message)=>{throw Object.assign(Error(message),{status})},now=()=>new Date().toISOString();
 db.exec(`CREATE TABLE IF NOT EXISTS asset_review_runs(id TEXT PRIMARY KEY,record_key TEXT NOT NULL REFERENCES workspace_records(record_key) ON DELETE CASCADE,source_version INTEGER NOT NULL,requested_by TEXT NOT NULL,stages TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS asset_review_stage_links(run_id TEXT NOT NULL REFERENCES asset_review_runs(id) ON DELETE CASCADE,stage_index INTEGER NOT NULL,approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,PRIMARY KEY(run_id,stage_index));
 CREATE TABLE IF NOT EXISTS asset_review_comments(id TEXT PRIMARY KEY,record_key TEXT NOT NULL REFERENCES workspace_records(record_key) ON DELETE CASCADE,source_version INTEGER NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,page INTEGER,x REAL,y REAL,created_at TEXT NOT NULL);`);
 if(!all('PRAGMA table_info(asset_review_runs)').some(c=>c.name==='cancelled_at'))db.exec('ALTER TABLE asset_review_runs ADD COLUMN cancelled_at TEXT');
 const stagesOf=review=>JSON.parse(review.stages).map((stage,index)=>({...stage,index,decision:one('SELECT a.* FROM workflow_approvals a JOIN asset_review_stage_links l ON l.approval_id=a.id WHERE l.run_id=? AND l.stage_index=?',review.id,index)||null}));
 const startStage=(review,index)=>{const stage=JSON.parse(review.stages)[index],file=one('SELECT * FROM workspace_records WHERE record_key=?',review.record_key);if(!stage||!file)return;if(!w.canRead(stage.approverId,file)||!w.member(stage.approverId,file.organisation_id))fail(409,'The next approver no longer has file access. Start a new review with current reviewers.');const id=randomUUID();run('INSERT INTO workflow_approvals(id,organisation_id,record_key,source_version,requested_by,approver_ids,stage,created_at) VALUES(?,?,?,?,?,?,?,?)',id,file.organisation_id,file.record_key,file.version,review.requested_by,JSON.stringify([stage.approverId]),stage.name,now());run('INSERT INTO asset_review_stage_links VALUES(?,?,?)',review.id,index,id);run('INSERT OR IGNORE INTO workflow_notifications VALUES(?,?,?,?,?,?,?,?,NULL)',randomUUID(),stage.approverId,file.organisation_id,'approval',id,'asset:'+review.id+':'+index,'Asset approval requested: '+stage.name,now());};
 return {async handle({req,path,user,bodyOf,send}){
  const match=path.match(/^\/api\/organisations\/([^/]+)\/files\/([^/]+)\/proof(?:\/(start|decision|comment|cancel))?$/);if(!match)return false;if(!user)fail(401,'Sign in first.');const [,org,id,action]=match,file=one("SELECT * FROM workspace_records WHERE organisation_id=? AND kind='file' AND external_id=?",org,id);if(!file||!w.canRead(user.id,file))fail(404,'File not found.');const data=w.result(file);
  if(!action&&req.method==='GET'){
   const reviews=all('SELECT * FROM asset_review_runs WHERE record_key=? ORDER BY created_at DESC,id DESC',file.record_key).map(review=>{const stages=stagesOf(review),stale=review.source_version!==file.version;return {...review,stages,stale,status:review.cancelled_at?'Cancelled':stale?'Earlier version':stages.some(s=>s.decision?.status==='Rejected')?'Changes requested':stages.every(s=>s.decision?.status==='Granted')?'Approved':'In review'}});
   return send(200,{version:file.version,canManage:w.canWrite(user.id,file),reviews,comments:all('SELECT c.*,u.name AS author FROM asset_review_comments c JOIN users u ON u.id=c.user_id WHERE record_key=? ORDER BY created_at',file.record_key),reviewers:all('SELECT u.id,u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.company_id=?',org).filter(p=>w.canRead(p.id,file))});
  }
  if(req.method!=='POST')fail(405,'Method not allowed.');w.assertWritable(org);const body=await bodyOf(req);if(body.version!==file.version)fail(409,'This file changed. Reopen the current version before reviewing.');
  if(action==='start'){
   if(!w.canWrite(user.id,file))fail(403,'Only a file editor can request review.');if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(data.mime)||!data.content)fail(400,'Upload a PNG, JPEG, WebP or PDF before starting review.');
   if(!Array.isArray(body.stages)||!body.stages.length||body.stages.length>8||body.stages.some(s=>!s||typeof s.name!=='string'||!s.name.trim()||s.name.length>100||typeof s.approverId!=='string'||!w.member(s.approverId,org)||!w.canRead(s.approverId,file)))fail(400,'Choose one to eight named stages and reviewers with existing file access.');
   if(all('SELECT * FROM asset_review_runs WHERE record_key=? AND source_version=?',file.record_key,file.version).some(r=>{const stages=stagesOf(r);return !r.cancelled_at&&!stages.some(s=>s.decision?.status==='Rejected')}))fail(409,'This version already has an active or approved review.');
   const review={id:randomUUID(),record_key:file.record_key,source_version:file.version,requested_by:user.id,stages:JSON.stringify(body.stages.map(s=>({name:s.name.trim(),approverId:s.approverId}))),created_at:now()};
   w.transaction(()=>{run('INSERT INTO asset_review_runs(id,record_key,source_version,requested_by,stages,created_at) VALUES(?,?,?,?,?,?)',...Object.values(review));startStage(review,0);audit(user.id,org,'Asset review requested: '+id+' version '+file.version)});return send(201,{id:review.id});
  }
  if(action==='cancel'){
   if(!w.canWrite(user.id,file))fail(403,'Only a file editor can cancel review.');
   const review=one('SELECT * FROM asset_review_runs WHERE id=? AND record_key=? AND source_version=?',body.runId,file.record_key,file.version);
   if(!review||review.cancelled_at||!stagesOf(review).some(s=>s.decision?.status==='Pending'))fail(409,'Choose an active review.');
   w.transaction(()=>{run('UPDATE asset_review_runs SET cancelled_at=? WHERE id=?',now(),review.id);run("UPDATE workflow_approvals SET status='Cancelled',decision_by=?,decided_at=? WHERE status='Pending' AND id IN (SELECT approval_id FROM asset_review_stage_links WHERE run_id=?)",user.id,now(),review.id);audit(user.id,org,'Asset review cancelled: '+id+' version '+file.version)});return send(200,{ok:true});
  }
  if(action==='decision'){
   const review=one('SELECT * FROM asset_review_runs WHERE id=? AND record_key=? AND source_version=?',body.runId,file.record_key,file.version);if(!review||review.cancelled_at)fail(409,'Choose a review for the current file version.');const stages=stagesOf(review),current=stages.find(s=>s.decision?.status==='Pending');if(!current||current.approverId!==user.id||stages.some(s=>s.index<current.index&&s.decision?.status!=='Granted'))fail(403,'Only the current stage reviewer can decide.');
   if(!['Granted','Rejected'].includes(body.outcome)||typeof body.reason!=='string'||body.reason.length>2000||body.outcome==='Rejected'&&!body.reason.trim())fail(400,'Choose a decision and explain requested changes.');
   w.transaction(()=>{run('UPDATE workflow_approvals SET status=?,decision_by=?,reason=?,decided_at=? WHERE id=?',body.outcome,user.id,body.reason.trim(),now(),current.decision.id);if(body.outcome==='Granted'&&current.index+1<stages.length)startStage(review,current.index+1);audit(user.id,org,'Asset review '+body.outcome.toLowerCase()+': '+id+' version '+file.version+' stage '+(current.index+1))});return send(200,{ok:true});
  }
  if(action==='comment'){
   if(typeof body.text!=='string'||!body.text.trim()||body.text.length>4000)fail(400,'Enter a comment up to 4,000 characters.');
   if(body.page!==undefined&&(!Number.isInteger(body.page)||body.page<1||body.page>1000))fail(400,'Choose a valid page number.');
   if((body.x!==undefined||body.y!==undefined)&&(!Number.isFinite(body.x)||!Number.isFinite(body.y)||body.x<0||body.x>1||body.y<0||body.y>1))fail(400,'Choose a point inside the image.');
   run('INSERT INTO asset_review_comments VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),file.record_key,file.version,user.id,body.text.trim(),body.page||null,body.x??null,body.y??null,now());audit(user.id,org,'Asset review comment: '+id+' version '+file.version);return send(201,{ok:true});
  }
  fail(404,'Review action not found.');
 }};
}
