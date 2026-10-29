import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createCipheriv,randomBytes} from 'node:crypto';
import {createCompanyApi} from '../server/company-api.mjs';

test('Outlook and Google calendar OAuth, encrypted multi-account tokens, private meetings, selection, refresh and disconnect',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'theory-calendar-connections-')),databasePath=join(dir,'test.sqlite'),master=randomBytes(32);
 const env={THEORY_PUBLIC_URL:'',THEORY_MICROSOFT_CLIENT_ID:'outlook-client',THEORY_MICROSOFT_CLIENT_SECRET:'outlook-secret',THEORY_GOOGLE_CLIENT_ID:'google-client',THEORY_GOOGLE_CLIENT_SECRET:'google-secret',THEORY_CALENDAR_MASTER_KEY:master.toString('base64')};
 let failRefresh=false,badPaging=false,refreshes=0,calendarReads=0;
 const fakeFetch=async(value,options)=>{const url=new URL(value),bearer=String(options?.headers?.Authorization||'').replace('Bearer ',''),token=options?.body instanceof URLSearchParams?options.body:null;
  if(url.pathname.endsWith('/token')){const google=url.hostname==='oauth2.googleapis.com';if(token.get('grant_type')==='refresh_token'){refreshes++;if(failRefresh)return Response.json({error:'invalid_grant'},{status:400});return Response.json({access_token:google?'google-access':'outlook-access-one',refresh_token:google?'google-refresh':'outlook-refresh-one',expires_in:3600})}assert.ok(token.get('code_verifier'));assert.equal(token.get('redirect_uri'),env.THEORY_PUBLIC_URL+`/api/calendar/oauth/${google?'google':'microsoft'}/callback`);const second=token.get('code')==='second';return Response.json({access_token:google?'google-access':second?'outlook-access-two':'outlook-access-one',refresh_token:google?'google-refresh':second?'outlook-refresh-two':'outlook-refresh-one',expires_in:3600,scope:google?'openid email https://www.googleapis.com/auth/calendar.readonly':'User.Read Calendars.Read offline_access'})}
  if(url.hostname==='openidconnect.googleapis.com')return Response.json({sub:'google-account',email:'personal@google.test'});
  if(url.pathname==='/v1.0/me')return Response.json({id:bearer.endsWith('two')?'outlook-account-two':'outlook-account-one',mail:bearer.endsWith('two')?'second@outlook.test':'work@outlook.test'});
  if(url.pathname==='/v1.0/me/calendars')return Response.json({value:[{id:'outlook-primary',name:'Work calendar',isDefaultCalendar:true,hexColor:'#356DA8'},{id:'outlook-secondary',name:'Extra calendar',hexColor:'#8055A1'}],...(badPaging?{'@odata.nextLink':'https://attacker.test/collect'}:{})});
  if(url.pathname.endsWith('/calendarList'))return Response.json({items:[{id:'google-primary',summary:'Personal calendar',primary:true,backgroundColor:'#426B58'}]});
  if(url.pathname.endsWith('/calendarView')){calendarReads++;return Response.json({value:[{id:'meeting-one',subject:'Planning meeting',start:{dateTime:'2026-10-29T09:00:00.0000000'},end:{dateTime:'2026-10-29T10:00:00.0000000'},location:{displayName:'Studio'},body:{content:'Discuss <b>marketing</b>'},attendees:[{emailAddress:{name:'Alex',address:'alex@test.invalid'},status:{response:'accepted'}}],organizer:{emailAddress:{name:'Owner'}},isOrganizer:true,onlineMeeting:{joinUrl:'https://teams.microsoft.com/test-meeting'},webLink:'https://outlook.office.com/calendar/item/test'},{id:'all-day',subject:'All day session',isAllDay:true,start:{dateTime:'2026-10-29T00:00:00'},end:{dateTime:'2026-10-30T00:00:00'}}]})}
  if(url.pathname.endsWith('/events')){calendarReads++;return Response.json({items:[{id:'google-meeting',summary:'Personal appointment',start:{dateTime:'2026-10-29T09:00:00+01:00'},end:{dateTime:'2026-10-29T10:00:00+01:00'},description:'Private appointment',hangoutLink:'https://meet.google.com/test',htmlLink:'javascript:alert(1)',organizer:{email:'personal@google.test',self:true}}]})}
  throw Error('Unexpected mock provider request: '+url.origin+url.pathname);
 };
 const api=createCompanyApi({databasePath,calendarOptions:{env,fetchImpl:fakeFetch}}),server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;env.THEORY_PUBLIC_URL=origin;
 const req=async(cookie,path,method='GET',body)=>{const response=await fetch(origin+'/api/'+path,{method,redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body===undefined?undefined:JSON.stringify(body)});const content=await response.text();return {status:response.status,body:content?JSON.parse(content):null,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),location:response.headers.get('location')}};
 const register=(email,extra)=>req('','auth/register','POST',{name:email,email,password:'Calendar integration test password',...extra});
 try{
  const owner=await register('owner@calendar-connect.test',{companyName:'Company'}),cookie=owner.cookie,invite=await req(cookie,'company-invitations','POST',{email:'colleague@calendar-connect.test'}),colleague=await register('colleague@calendar-connect.test',{invite:invite.body.code});
  const native=(await req(cookie,'personal/data/task','POST',{id:'keep-native-task',title:'Keep my Theory task',due:'2026-10-29',done:false})).body.record;
  const start=async(provider,reconnectId)=>{const result=await req(cookie,`calendar/oauth/${provider}/start`,'POST',{reconnectId});assert.equal(result.status,200,JSON.stringify(result.body));const url=new URL(result.body.url);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(!url.searchParams.get('scope').includes('ReadWrite'));return {state:url.searchParams.get('state'),cookie:result.cookie}};
  const callback=(provider,flow,code='first',browser=flow.cookie)=>req(browser,`calendar/oauth/${provider}/callback?state=${flow.state}&code=${code}`);
  assert.equal((await req('','calendar/oauth/microsoft/start','POST',{})).status,401);
  const flow=await start('microsoft');assert.match((await callback('microsoft',flow,'first','wrong=browser')).location,/expired/);
  assert.match((await callback('microsoft',flow)).location,/connected/);assert.match((await callback('microsoft',flow)).location,/expired/);
  let connections=(await req(cookie,'calendar/connections')).body;assert.equal(connections.accounts.length,1);let account=connections.accounts[0];assert.equal(account.label,'work@outlook.test');assert.equal(account.calendars.length,2);assert.equal(account.calendars.filter(c=>c.enabled).length,1);assert.ok(!JSON.stringify(connections).includes('outlook-access'));
  const db=new DatabaseSync(databasePath);const stored=db.prepare('SELECT * FROM calendar_accounts').get();assert.ok(!stored.secret.includes('outlook-refresh'));assert.ok(!stored.secret.includes('outlook-access'));db.close();
  assert.equal((await req(colleague.cookie,'calendar/connections')).body.accounts.length,0);
  assert.equal((await req(colleague.cookie,'calendar/connections/'+account.id,'DELETE')).status,404);
  const imported=await req(cookie,'calendar/external-events?from=2026-10-28&to=2026-10-30');assert.equal(imported.status,200);assert.equal(imported.body.events.length,2);assert.equal(imported.body.events.find(e=>e.externalId==='all-day').end,'2026-10-29');const meeting=imported.body.events.find(e=>e.externalId==='meeting-one');assert.equal(meeting.notes,'Discuss marketing');assert.equal(meeting.readOnly,true);assert.match(meeting.meetingUrl,/teams/);assert.equal(meeting.attendees[0].name,'Alex');
  assert.equal((await req(colleague.cookie,'calendar/external-events?from=2026-10-28&to=2026-10-30')).body.events.length,0);const reads=calendarReads;await req(cookie,'calendar/external-events?from=2026-10-28&to=2026-10-30');assert.equal(calendarReads,reads);
  await req(cookie,`calendar/connections/${account.id}/calendars/${account.calendars.find(c=>c.enabled).id}`,'PUT',{enabled:false});assert.equal((await req(cookie,'calendar/external-events?from=2026-10-28&to=2026-10-30')).body.events.length,0);
  assert.equal((await req(cookie,`calendar/connections/${account.id}/calendars/${account.calendars[0].id}`,'PUT',{enabled:true})).status,200);
  await callback('microsoft',await start('microsoft'),'second');await callback('google',await start('google'));connections=(await req(cookie,'calendar/connections')).body;assert.equal(connections.accounts.length,3);
  const google=connections.accounts.find(a=>a.provider==='google'),googleEvents=(await req(cookie,'calendar/external-events?from=2026-10-28&to=2026-10-30')).body.events.filter(e=>e.provider==='google');assert.equal(googleEvents[0].start,'2026-10-29T08:00:00.000Z');assert.equal(googleEvents[0].providerUrl,'');
  assert.match((await callback('microsoft',await start('microsoft',account.id),'second')).location,/wrong-account/);assert.equal((await req(cookie,'calendar/connections')).body.accounts.length,3);
  await req(cookie,`calendar/connections/${account.id}/calendars/${account.calendars[1].id}`,'PUT',{enabled:true});
  const editor=new DatabaseSync(databasePath),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',master,iv);cipher.setAAD(Buffer.from(owner.body.user.id+':'+account.id));const encrypted=Buffer.concat([iv,cipher.update(JSON.stringify({access:'expired-token',refresh:'outlook-refresh-one',expires:0})),cipher.final(),cipher.getAuthTag()]).toString('base64');editor.prepare('UPDATE calendar_accounts SET secret=? WHERE id=?').run(encrypted,account.id);editor.prepare('UPDATE external_calendars SET synced_at=NULL WHERE account_id=?').run(account.id);editor.close();
  await req(cookie,'calendar/external-events?from=2026-10-28&to=2026-10-30');assert.equal(refreshes,1);
  badPaging=true;assert.equal((await req(cookie,'calendar/connections/'+account.id+'/sync','POST',{})).status,502);badPaging=false;
  const expired=new DatabaseSync(databasePath);expired.prepare('UPDATE calendar_accounts SET secret=? WHERE id=?').run(encrypted,account.id);expired.prepare('UPDATE external_calendars SET synced_at=NULL WHERE account_id=?').run(account.id);expired.close();failRefresh=true;
  await req(cookie,'calendar/external-events?from=2026-10-28&to=2026-10-30');assert.equal((await req(cookie,'calendar/connections')).body.accounts.find(a=>a.id===account.id).status,'reconnect');
  assert.equal((await req(cookie,'calendar/connections/'+google.id,'DELETE')).status,200);assert.equal((await req(cookie,'personal/data/task/'+native.id)).body.record.title,native.title);assert.ok(!(await req(cookie,'calendar/external-events?from=2026-10-28&to=2026-10-30')).body.events.some(e=>e.provider==='google'));
  const pending=await start('google');await req(cookie,'auth/logout','POST',{});assert.match((await callback('google',pending)).location,/expired/);
 }finally{await new Promise(r=>server.close(r));api.close();rmSync(dir,{recursive:true,force:true})}
});
