import {nextOccurrence,reminderInstant,type Recurrence} from './work.ts';
import {addDays,dayDistance,weekStart} from './overview.ts';

export type CalendarView='Day'|'Week'|'Month'|'Year'|'List';
export type CalendarEvent={id:string;title:string;start:string;end:string;allDay:boolean;timeZone:string;location?:string;notes?:string;attendees?:string;attendeeIds?:string[];organisationId?:string|null;unitIds:string[];channel?:string;colour?:string;recurrence?:Recurrence;exceptions?:Record<string,Partial<CalendarEvent>&{cancelled?:boolean}>;version?:number;ownerId?:string;canEdit?:boolean};
export type CalendarPrefs={view:CalendarView;hidden:string[];colours:Record<string,string>};
export const defaultCalendarPrefs:CalendarPrefs={view:'Week',hidden:[],colours:{}};
export const calendarPalette=['#426B58','#356DA8','#8055A1','#B0523E','#A47724','#287C83','#AB4E77','#5E6572'];
export const datePart=(value:string)=>value.slice(0,10);
export const eventLastDay=(event:{end:string;allDay:boolean})=>!event.allDay&&event.end.endsWith('T00:00')?addDays(datePart(event.end),-1):datePart(event.end);
export function inCalendarZone(value:string,fromZone:string,toZone:string){
 if(fromZone===toZone)return value;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:toZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(reminderInstant(value,fromZone))).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export const monthStart=(date:string)=>date.slice(0,7)+'-01';
export function shiftMonth(date:string,months:number){const d=new Date(date+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10)}
export function movePeriod(date:string,view:CalendarView,direction:number){return view==='Year'?shiftMonth(date,direction*12):view==='Month'?shiftMonth(date,direction):addDays(date,direction*(view==='Week'||view==='List'?7:1))}
export function calendarRange(date:string,view:CalendarView){if(view==='Day')return [date,date];if(view==='Week')return [weekStart(date),addDays(weekStart(date),6)];if(view==='Year')return [date.slice(0,4)+'-01-01',date.slice(0,4)+'-12-31'];const start=weekStart(monthStart(date));return [start,addDays(start,41)]}
export function eventOccurrences(event:CalendarEvent,from:string,to:string):CalendarEvent[]{
 const result:CalendarEvent[]=[];const duration=dayDistance(datePart(event.start),datePart(event.end));let date=datePart(event.start),index=0;const recurrence=event.recurrence;
 const add=(day:string)=>{const change=event.exceptions?.[day];if(change?.cancelled)return;const start=day+event.start.slice(10),end=addDays(day,duration)+event.end.slice(10);const item={...event,start,end,...change};if(eventLastDay(item)>=from&&datePart(item.start)<=to)result.push({...item,id:event.id+'@'+day})};
 if(!recurrence||recurrence.mode==='none'||recurrence.paused){if(!recurrence?.paused)add(date);return result}
 // Iterate the actual schedule, retaining its original anchor and count across view changes.
 const schedule=recurrence.interval>1&&['daily','monthly','annually'].includes(recurrence.mode)?{...recurrence,mode:'custom' as const,unit:({daily:'days',monthly:'months',annually:'years'} as const)[recurrence.mode as 'daily'|'monthly'|'annually']}:recurrence;
 while(date<=to&&index<100000){if(recurrence.endDate&&date>recurrence.endDate)break;if((!recurrence.count||index<recurrence.count)&&(!recurrence.startDate||date>=recurrence.startDate))add(date);else if(recurrence.count&&index>=recurrence.count)break;index++;const next=nextOccurrence(date,{...schedule,anchor:recurrence.anchor||datePart(event.start),completed:index-1});if(!next||next<=date)break;date=next}
 // An exception can have been moved into this period from outside the visible schedule.
 for(const [day,change] of Object.entries(event.exceptions||{}))if(day>to&&change.start&&datePart(change.start)<=to&&datePart(change.end||change.start)>=from)add(day);
 return result;
}
export function splitCalendarSeries(source:CalendarEvent,draft:CalendarEvent,occurrence:string){
 if(!source.recurrence||source.recurrence.mode==='none'||!eventOccurrences({...source,exceptions:{}},occurrence,occurrence).some(e=>datePart(e.start)===occurrence))throw Error('Choose an occurrence in this recurring series.');
 const beforeCount=eventOccurrences({...source,exceptions:{}},datePart(source.start),addDays(occurrence,-1)).length;
 const before=beforeCount?{...source,recurrence:{...source.recurrence,endDate:addDays(occurrence,-1),count:beforeCount},exceptions:Object.fromEntries(Object.entries(source.exceptions||{}).filter(([d])=>d<occurrence))}:null;
 const remaining=source.recurrence.count?source.recurrence.count-beforeCount:undefined;
 const after={...draft,recurrence:draft.recurrence&&draft.recurrence.mode!=='none'?{...draft.recurrence,anchor:datePart(draft.start),startDate:datePart(draft.start),completed:0,count:remaining}:draft.recurrence,exceptions:{}};
 return {before,after};
}
export function validateCalendarEvent(data:CalendarEvent){
 if(typeof data.allDay!=='boolean'||typeof data.start!=='string'||typeof data.end!=='string'||typeof data.timeZone!=='string')throw Error('Choose event dates, all-day status and a time zone.');
 if(typeof data.title!=='string'||!data.title.trim()||data.title.length>180)throw Error('Enter an event title up to 180 characters.');
 const pattern=data.allDay?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
 if(!pattern.test(data.start)||!pattern.test(data.end)||data.end<data.start||!data.allDay&&data.end===data.start)throw Error('Choose an end after the start.');
 for(const value of [data.start,data.end]){const day=datePart(value),date=new Date(day+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)throw Error('Choose valid event dates.');}
 new Intl.DateTimeFormat('en',{timeZone:data.timeZone});
 if(!data.allDay){reminderInstant(data.start,data.timeZone);reminderInstant(data.end,data.timeZone)}
 if(data.colour&&!/^#[0-9a-f]{6}$/i.test(data.colour))throw Error('Choose a valid event colour.');
 for(const [key,max] of [['location',500],['notes',10000],['attendees',4000],['channel',180]] as const)if(data[key]!==undefined&&(typeof data[key]!=='string'||data[key]!.length>max))throw Error('Check the event '+key+'.');
 const r=data.recurrence;if(r&&r.mode!=='none'){
  if(!['daily','weekdays','weekly','monthly','annually','custom'].includes(r.mode)||!Number.isInteger(r.interval)||r.interval<1||r.interval>365||!['days','weeks','months','years'].includes(r.unit)||!Array.isArray(r.days)||r.days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Choose a valid repeat schedule.');
  if(r.basis==='completion')throw Error('Events repeat from their scheduled date, rather than completion.');
  if(r.count!==undefined&&(!Number.isInteger(r.count)||r.count<1||r.count>100000))throw Error('Choose a valid occurrence count.');
  for(const d of [r.startDate,r.endDate,r.anchor])if(d&&(!/^\d{4}-\d{2}-\d{2}$/.test(d)||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d))throw Error('Check the repeat dates.');
  if(r.endDate&&r.endDate<datePart(data.start)||r.startDate&&r.endDate&&r.endDate<r.startDate)throw Error('The repeat end must follow the series start.');
 }
}
