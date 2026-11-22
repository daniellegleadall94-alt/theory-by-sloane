export function createSearch(db,w){
 const all=(sql,...args)=>db.prepare(sql).all(...args);
 const kinds=new Set(['task','campaign','strategy','objective','kpi','file','asset','contact','post','email','website','advert','pr','event','resource','expense','account','report']);
 return {handle({req,path,user,send}){
  if(path!=='/api/search'||req.method!=='GET')return false;
  const params=new URL(req.url,'http://localhost').searchParams,q=(params.get('q')||'').trim().toLowerCase(),kind=params.get('kind')||'',org=params.get('organisationId'),unit=params.get('unitId');
  if(q.length<2)return send(200,{results:[],hasMore:false});
  if(q.length>200)return send(400,{error:'Keep searches under 200 characters.'});
  const results=[];
  const eligible=(row,ids)=> (!org||(org==='personal'?!row.organisation_id:row.organisation_id===org))&&(!unit||ids.includes(unit));
  for(const row of all('SELECT r.*,c.name AS organisation_name FROM workspace_records r LEFT JOIN companies c ON c.id=r.organisation_id WHERE r.personal_user_id=? OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=? AND m.company_id=r.organisation_id)',user.id,user.id)){
   if(!kinds.has(row.kind)||kind&&kind!==row.kind||!w.canRead(user.id,row))continue;
   const record=w.result(row);if(record.archived||record.status==='Archived'||!eligible(row,record.unitIds))continue;
   const title=String(record.title||record.name||''),description=row.kind==='account'?'':String(record.description||record.notes||record.audience||''),extra=row.kind==='contact'?[record.companyName,record.email,record.jobTitle].join(' '):'';
   if(![title,description,extra].join(' ').toLowerCase().includes(q))continue;
   results.push({id:row.external_id,kind:row.kind,title,description:description.slice(0,1500),organisationId:row.organisation_id,organisationName:row.organisation_name||'Personal space',unitIds:record.unitIds,updatedAt:row.updated_at});
  }
  if(!kind||kind==='note')for(const row of [...all("SELECT *, 'Personal space' AS organisation_name FROM notes WHERE company_id IS NULL AND owner_id=?",user.id),...all('SELECT n.*,c.name AS organisation_name FROM notes n JOIN companies c ON c.id=n.company_id JOIN memberships m ON m.company_id=n.company_id AND m.user_id=? WHERE n.owner_id=? OR EXISTS(SELECT 1 FROM note_shares s WHERE s.note_id=n.id AND s.user_id=?)',user.id,user.id,user.id)]){
   const data=JSON.parse(row.data),ids=data.unitIds||[];if(row.company_id!==null&&!w.canUnits(user.id,row.company_id,ids)||!eligible({organisation_id:row.company_id},ids)||data.archived||db.prepare('SELECT archived FROM note_preferences WHERE note_id=? AND user_id=?').get(row.id,user.id)?.archived)continue;
   const title=String(data.title||'Note'),description=String(data.body||data.text||data.content||'');if(![title,description].join(' ').toLowerCase().includes(q))continue;
   results.push({id:row.id,kind:'note',title,description:description.slice(0,1500),organisationId:row.company_id,organisationName:row.organisation_name,unitIds:ids,updatedAt:data.updatedAt||''});
  }
  results.sort((a,b)=>Number(b.title.toLowerCase().includes(q))-Number(a.title.toLowerCase().includes(q))||b.updatedAt.localeCompare(a.updatedAt)||a.title.localeCompare(b.title));
  return send(200,{results:results.slice(0,100),hasMore:results.length>100});
 }};
}
