import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';
import {eventOccurrences,splitCalendarSeries,validateCalendarEvent,inCalendarZone,eventLastDay,shiftMonth} from '../src/calendarModel.ts';

const event={id:'event-one',calendarEvent:true,title:'Planning session',start:'2026-10-29T09:00',end:'2026-10-29T10:00',allDay:false,timeZone:'Europe/London',unitIds:[],notes:'Review channel plans',location:'Studio',attendees:'Alex'};
test('event recurrence, exceptions, future splits, inclusive all-day dates and daylight-saving conversions',()=>{
 const recurring={...event,recurrence:{mode:'daily',interval:2,unit:'days',days:[],count:4,anchor:'2026-10-29'}};
 assert.deepEqual(eventOccurrences(recurring,'2026-10-29','2026-11-15').map(e=>e.start.slice(0,10)),['2026-10-29','2026-10-31','2026-11-02','2026-11-04']);
 const exception={...recurring,exceptions:{'2026-10-31':{cancelled:true},'2026-11-02':{title:'Changed',start:'2026-11-01T09:00',end:'2026-11-01T10:00'}}};
 assert.equal(eventOccurrences(exception,'2026-11-01','2026-11-01')[0].title,'Changed');
 const split=splitCalendarSeries(recurring,{...recurring,start:'2026-11-02T14:00',end:'2026-11-02T15:00'},'2026-11-02');
 assert.equal(eventOccurrences(split.before,'2026-10-01','2026-12-01').length,2);
 assert.equal(eventOccurrences(split.after,'2026-10-01','2026-12-01').length,2);
 assert.equal(eventLastDay({...event,end:'2026-10-30T00:00'}),'2026-10-29');
 assert.equal(inCalendarZone('2026-07-01T09:00','Europe/London','UTC'),'2026-07-01T08:00');
 assert.equal(inCalendarZone('2026-12-01T09:00','Europe/London','UTC'),'2026-12-01T09:00');
 assert.throws(()=>validateCalendarEvent({...event,start:'2026-03-29T01:30',end:'2026-03-29T02:30'}));
 assert.throws(()=>validateCalendarEvent({...event,start:'2026-02-30T09:00'}));
 assert.equal(shiftMonth('2026-01-31',1),'2026-02-28');
});

test('native events use existing company permissions, version checks, private ownership and per-user calendar preferences',async()=>{
 const api=createCompanyApi({databasePath:':memory:'}),server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const req=async(cookie,path,method='GET',body)=>{const res=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}};
 const register=(email,extra={})=>req('','auth/register','POST',{name:email,email,password:'Calendar tests password 2026',...extra});
 try{
  const owner=await register('owner@calendar.test',{companyName:'Calendar organisation'}),outsider=await register('other@calendar.test',{companyName:'Other organisation'}),org=owner.body.user.company.id,base=`organisations/${org}`;
  const invite=await req(owner.cookie,'company-invitations','POST',{email:'member@calendar.test'}),member=await register('member@calendar.test',{invite:invite.body.code});
  const a=(await req(owner.cookie,base+'/units','POST',{name:'Company A',channels:[]})).body.unit,b=(await req(owner.cookie,base+'/units','POST',{name:'Company B',channels:[]})).body.unit;
  await req(owner.cookie,base+'/members/'+member.body.user.id,'PUT',{role:'member',accessScope:'selected',unitIds:[a.id]});
  const created=await req(owner.cookie,base+'/data/event','POST',{...event,unitIds:[a.id],visibility:'shared'});assert.equal(created.status,201,JSON.stringify(created.body));
  assert.equal((await req(member.cookie,base+'/data/event/'+event.id)).status,200);
  assert.equal((await req(outsider.cookie,base+'/data/event/'+event.id)).status,403);
  assert.equal((await req(member.cookie,base+'/data/event/'+event.id,'PUT',{...created.body.record,title:'Not the owner'})).status,403);
  const privateEvent=await req(owner.cookie,'personal/data/event','POST',{...event,id:'personal-event'});assert.equal(privateEvent.status,201);
  assert.equal((await req(member.cookie,'personal/data/event/personal-event')).status,404);
  assert.equal((await req(owner.cookie,base+'/data/event','POST',{...event,id:'restricted',unitIds:[b.id]})).status,201);
  assert.equal((await req(member.cookie,base+'/data/event/restricted')).status,404);
  assert.equal((await req(member.cookie,base+'/data/event','POST',{...event,id:'bad-unit',unitIds:[b.id]})).status,403);
  assert.equal((await req(owner.cookie,base+'/data/event','POST',{...event,id:'bad-date',start:'2026-02-30T09:00'})).status,400);
  assert.equal((await req(owner.cookie,base+'/data/event','POST',{...event,id:'bad-exception',exceptions:{'2026-10-29':{organisationId:'other'}}})).status,400);
  assert.equal((await req(owner.cookie,base+'/data/event/'+event.id,'PUT',{...created.body.record,title:'Revised session'})).status,200);
  assert.equal((await req(owner.cookie,base+'/data/event/'+event.id,'PUT',created.body.record)).status,409);
  const series=(await req(owner.cookie,'personal/data/event','POST',{...event,id:'series',recurrence:{mode:'weekly',interval:1,unit:'weeks',days:[4],count:4}})).body.record;
  const split=await req(owner.cookie,'personal/data/event/series/actions','POST',{action:'split',version:series.version,occurrence:'2026-11-12',event:{...series,start:'2026-11-12T14:00',end:'2026-11-12T15:00'}});assert.equal(split.status,200,JSON.stringify(split.body));assert.notEqual(split.body.record.id,'series');
  assert.equal((await req(owner.cookie,'personal/data/event/series')).body.record.recurrence.count,2);
  const moving=(await req(owner.cookie,'personal/data/event','POST',{...event,id:'move-event'})).body.record;
  assert.equal((await req(owner.cookie,'personal/data/event/move-event/move','POST',{version:moving.version,targetOrganisationId:org,event:{...moving,unitIds:[a.id]}})).status,200);
  assert.equal((await req(owner.cookie,'personal/data/event/move-event')).status,404);
  assert.equal((await req(member.cookie,base+'/data/event/move-event')).status,200);
  assert.equal((await req(owner.cookie,base+'/data/event','POST',{...event,id:'private-company',visibility:'private'})).status,400);
  const prefs={view:'Year',hidden:['tasks','unit:'+a.id],colours:{events:'#426B58'}};
  assert.equal((await req(owner.cookie,'calendar/preferences','PUT',prefs)).status,200);
  assert.deepEqual((await req(owner.cookie,'calendar/preferences')).body.preferences,prefs);
  assert.deepEqual((await req(member.cookie,'calendar/preferences')).body.preferences,{});
  assert.equal((await req(owner.cookie,'calendar/preferences','PUT',{...prefs,colours:{events:'url(bad)'}})).status,400);
  assert.equal((await req(owner.cookie,'personal/data/event/personal-event','DELETE',{version:privateEvent.body.record.version})).status,200);
  assert.equal((await req(owner.cookie,'personal/data/event/personal-event')).status,404);
 }finally{await new Promise(r=>server.close(r));api.close()}
});
