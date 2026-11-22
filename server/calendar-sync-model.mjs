import {taskCalendarRecurrence,taskRecurrenceFromCalendar} from './calendar-task-recurrence.mjs';
import {exportRecurrence,importRecurrence} from './calendar-recurrence.mjs';
import {createHash} from 'node:crypto';
import {addDays} from '../src/overview.ts';
import {reminderInstant,validTaskDate,recurringTaskDates} from '../src/work.ts';
import {inCalendarZone} from '../src/calendarModel.ts';

const error=message=>{throw Object.assign(Error(message),{status:422})};
const clean=value=>String(value||'').replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(p|div)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
export const syncIdentity=(accountId,recordKey)=>createHash('sha256').update(accountId+':'+recordKey).digest('hex');
export function localSyncItem(row,data,context={}){
 if(row.kind==='task'&&data.seriesDefaults&&!data.recurrence?.paused&&data.recurrence?.basis!=='completion'){const due=data.scheduledDue||data.due;data={...data,...data.seriesDefaults,...recurringTaskDates(data,due),seriesDefaults:undefined,scheduledDue:undefined};}
 const task=row.kind==='task',allDay=task?!data.calendarTime:!!data.allDay;
 const zone=data.calendarTime?.timeZone||data.timeZone||'Europe/London';
 const start=task?(data.start||data.due)+(allDay?'':'T'+data.calendarTime.start):data.start;
 const end=task?data.due+(allDay?'':'T'+data.calendarTime.end):data.end;
 if(!start||!end||!validTaskDate(start.slice(0,10))||!validTaskDate(end.slice(0,10)))error('Give this item valid start and end dates before syncing.');

 const description=task?data.description||'':data.notes||'';
 const metadata=['Theory '+(task?'task':'event'),context.company&&'Company: '+context.company,(data.channel||data.discipline)&&'Channel: '+(data.channel||data.discipline),task&&'Status: '+(data.done?'Done':data.status||'To do'),context.link&&'Open in Theory: '+context.link].filter(Boolean).join('\n');
 return {title:(task&&data.done?'✓ ':'')+data.title,description,metadata,start:allDay?start:reminderInstant(start,zone),end:allDay?addDays(end,1):reminderInstant(end,zone),allDay,location:data.location||'',timeZone:zone,localStart:start,localEnd:allDay?addDays(end,1):end,recurrence:task?taskCalendarRecurrence(data):data.recurrence||null,updatedAt:row.updated_at};
}
const footer='\n\n—— Theory details ——\n';
export function providerPayload(provider,item,identity){
 const notes=item.description+footer+item.metadata,recurrence=exportRecurrence(provider,{start:item.localStart||item.start,end:item.localEnd||item.end,allDay:item.allDay,timeZone:item.timeZone||'Europe/London',recurrence:item.recurrence});
 if(provider==='google')return {summary:item.title,description:notes,location:item.location,recurrence:recurrence||[],start:item.allDay?{date:item.start}:{dateTime:item.start,...(recurrence?{timeZone:item.timeZone}:{})},end:item.allDay?{date:item.end}:{dateTime:item.end,...(recurrence?{timeZone:item.timeZone}:{})},...(identity?{id:identity,extendedProperties:{private:{theoryIdentity:identity}}}:{})};
 return {subject:item.title,body:{contentType:'text',content:notes},location:{displayName:item.location},isAllDay:item.allDay,recurrence,start:{dateTime:item.allDay?item.start+'T00:00:00':recurrence?item.localStart:item.start.replace(/Z$/,''),timeZone:recurrence?item.timeZone:'UTC'},end:{dateTime:item.allDay?item.end+'T00:00:00':recurrence?item.localEnd:item.end.replace(/Z$/,''),timeZone:recurrence?item.timeZone:'UTC'},...(identity?{transactionId:identity}:{})};
}
export function externalSyncItem(provider,event){
 const google=provider==='google';
 if(event.status==='cancelled'||event.isCancelled||event['@removed'])return {id:event.id,deleted:true};
 if(event.recurringEventId||event.seriesMasterId)error('This recurring event needs series synchronisation.');
 const allDay=google?!!event.start?.date:!!event.isAllDay;
 const parse=value=>{if(typeof value!=='string')error('The provider event has no valid time.');if(allDay){if(!validTaskDate(value.slice(0,10)))error('The provider event date is invalid.');return value.slice(0,10)}const date=new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)?value:value+'Z');if(!Number.isFinite(date.getTime()))error('The provider event time is invalid.');return date.toISOString()};
 const start=parse(google?event.start?.date||event.start?.dateTime:event.start?.dateTime),end=parse(google?event.end?.date||event.end?.dateTime:event.end?.dateTime);
 if(end<=start)error('The provider event must end after it starts.');
 const rawZone=google?event.start?.timeZone||'Europe/London':event.recurrence?.range?.recurrenceTimeZone||'Europe/London',zone=rawZone==='GMT Standard Time'?'Europe/London':rawZone,rule=importRecurrence(provider,event.recurrence,allDay?start:inCalendarZone(start.slice(0,16),'UTC',zone),zone);
 const notes=google?String(event.description||''):event.body?.contentType?.toLowerCase()==='html'?clean(event.body?.content):String(event.body?.content||''),split=notes.lastIndexOf('—— Theory details ——');
 return {id:event.id,recurrence:rule||null,timeZone:zone,title:String(google?event.summary||'Untitled event':event.subject||'Untitled event'),description:split<0?notes:notes.slice(0,split).trimEnd(),metadata:split<0?'':notes.slice(split+'—— Theory details ——'.length).trim(),start,end,allDay,location:google?event.location||'':event.location?.displayName||'',revision:event.etag||event['@odata.etag'],updatedAt:google?event.updated:event.lastModifiedDateTime,attendeeCount:event.attendees?.length||0,isOrganiser:google?!!event.organizer?.self:!!event.isOrganizer};
}
export const syncFingerprint=item=>createHash('sha256').update(JSON.stringify([item.title,item.description,item.metadata||'',item.recurrence||null,item.start,item.end,item.allDay,item.location])).digest('hex');
export function applyExternalItem(kind,data,item,zone='Europe/London'){
 if(kind==='task'&&data.occurrenceOf)error('Completed task history cannot be changed by calendar sync.');
 const start=item.allDay?item.start:inCalendarZone(item.start.slice(0,16),'UTC',zone),end=item.allDay?addDays(item.end,-1):inCalendarZone(item.end.slice(0,16),'UTC',zone);
 if(kind==='task')return {...data,recurrence:taskRecurrenceFromCalendar(data,item.recurrence,start.slice(0,10),end.slice(0,10)),title:item.title.replace(/^✓\s*/,''),description:item.description,location:item.location,start:start.slice(0,10),due:end.slice(0,10),calendarTime:item.allDay?undefined:{start:start.slice(11,16),end:end.slice(11,16),timeZone:zone}};
 return {...data,title:item.title,notes:item.description,start,end,allDay:item.allDay,timeZone:zone,location:item.location,recurrence:item.recurrence||undefined};
}
