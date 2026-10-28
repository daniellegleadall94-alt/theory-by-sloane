export type Recurrence={mode:'none'|'daily'|'weekdays'|'weekly'|'monthly'|'annually'|'custom';interval:number;unit:'days'|'weeks'|'months'|'years';days:number[];anchor?:string;startDate?:string;endDate?:string;count?:number;completed?:number;basis?:'scheduled'|'completion';paused?:boolean;monthDay?:number;month?:number;ordinal?:number;weekday?:number;monthlyPattern?:'date'|'weekday';timeZone?:string};
export type WorkGroup={unitIds?:string[];id:string;name:string;parentId:string;order?:number;archived?:boolean;colour?:string;icon?:string;visibility?:'private'|'shared';sharedWith?:string[];ownerId?:string;version?:number};
export type Task=PlannerFields&{unitIds?:string[];organisationId?:string|null;assigneeIds?:string[];ownerId?:string;version?:number;organisationName?:string;campaignName?:string;id:string;title:string;campaign:string;discipline:string;due:string;priority:string;done:boolean;groupId?:string;recurrence?:Recurrence;occurrenceOf?:string;completedAt?:string;overviewId?:string;horizon?:string;start?:string;plannerAllocated?:boolean;status?:'To do'|'In progress'|'In review'|'Done';channel?:string;brand?:string;checklist?:{id:string;title:string;done:boolean}[]};
export type PlannerFields={description?:string;important?:boolean;plannedDate?:string;myDay?:string;myDayUserIds?:Record<string,string>;reminderAt?:string;reminderTimeZone?:string;accountableOwnerId?:string;contributorIds?:string[];createdAt?:string;order?:number;comments?:{id:string;text:string;userId:string;name:string;at:string}[];attachments?:{id:string;name:string;url:string}[];skipped?:boolean;seriesDefaults?:Partial<Task>;visibility?:'private'|'shared';sharedWith?:string[]};
export const noRecurrence:Recurrence={mode:'none',interval:1,unit:'days',days:[]};
const parse=(s:string)=>new Date(s+'T12:00:00Z');
const iso=(d:Date)=>d.toISOString().slice(0,10);
const shift=(s:string,n:number)=>{const d=parse(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
function nextDate(due:string,r:Recurrence):string|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||Number.isNaN(parse(due).getTime()))return null;
 if(r.mode==='none'||r.paused)return null;
 const step=Math.min(365,Math.max(1,Math.floor(r.interval||1)));
 if(r.mode==='daily')return shift(due,1);
 if(r.mode==='weekdays'){let result=shift(due,1);while([0,6].includes(parse(result).getUTCDay()))result=shift(result,1);return result}
 if(r.mode==='weekly'||r.mode==='custom'&&r.unit==='weeks'&&r.days.length){
  const anchor=r.anchor||due;const start=parse(anchor);start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
  const days=r.days.length?r.days:[parse(anchor).getUTCDay()];
  for(let n=1;n<=step*7+7;n++){const result=shift(due,n);const d=parse(result);const week=Math.floor((d.getTime()-start.getTime())/604800000);if(week%step===0&&days.includes(d.getUTCDay()))return result}
 }
 const unit=r.mode==='monthly'?'months':r.mode==='annually'?'years':r.unit;
 const n=r.mode==='custom'?step:1;
 if(unit==='days'||unit==='weeks')return shift(due,n*(unit==='weeks'?7:1));
 const d=parse(due),anchor=parse(r.anchor||due);
 const month=d.getUTCMonth()+(unit==='years'?n*12:n);
 const first=new Date(Date.UTC(d.getUTCFullYear(),month,1,12));
 if(unit==='years'&&r.month)first.setUTCMonth(r.month-1);
 const end=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12)).getUTCDate();
 if(r.monthlyPattern==='weekday'&&unit==='months'){
  const weekday=r.weekday??1,ordinal=r.ordinal??1;
  first.setUTCDate(ordinal===-1?end-((new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),end,12)).getUTCDay()-weekday+7)%7):1+((weekday-first.getUTCDay()+7)%7)+(ordinal-1)*7);
 }else first.setUTCDate(Math.min(r.monthDay||anchor.getUTCDate(),end));return iso(first);
}
export function nextOccurrence(due:string,r:Recurrence):string|null{
 if(r.count&&(r.completed||0)+1>=r.count)return null;
 let next=nextDate(due,r);let attempts=0;
 while(next&&r.startDate&&next<r.startDate&&attempts++<10000)next=nextDate(next,r);
 return next&&(!r.endDate||next<=r.endDate)?next:null;
}
export function localDay(at:string,timeZone='Europe/London'):string{return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at))}
// Resolve local wall time through the zone rules, rejecting spring-forward times that do not exist.
export function reminderInstant(local:string,timeZone:string):string{
 const wanted=Date.parse(local+'Z');if(!Number.isFinite(wanted))throw Error('Choose a reminder date and time.');
 const parts=(ms:number)=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));const get=(key:string)=>p.find(x=>x.type===key)?.value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`};
 let instant=wanted;for(let n=0;n<4;n++)instant+=wanted-Date.parse(parts(instant)+'Z');
 if(parts(instant).slice(0,16)!==local.slice(0,16))throw Error('That time does not exist in this time zone because the clocks change. Choose another time.');return new Date(instant).toISOString();
}
export function recurrenceLabel(r?:Recurrence):string{
 if(!r||r.mode==='none')return '';
 if(r.mode==='weekly')return `Every ${r.interval>1?r.interval+' weeks':'week'}${r.days.length?' · '+[1,2,3,4,5,6,0].filter(d=>r.days.includes(d)).map(d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', '):''}`;
 if(r.mode==='custom')return `Every ${r.interval} ${r.interval===1?r.unit.slice(0,-1):r.unit}`;
 return ({daily:'Daily',weekdays:'Weekdays',monthly:'Monthly',annually:'Annually'})[r.mode];
}
export function completeTask(tasks:Task[],id:string,at:string):Task[]{
 let task=tasks.find(t=>t.id===id);if(!task||task.occurrenceOf)return tasks;
 if(!task.done&&task.recurrence&&task.recurrence.mode!=='none'){
  const r={...task.recurrence,anchor:task.recurrence.anchor||task.due};
  const basis=r.basis==='completion'?localDay(at,r.timeZone):task.due;const next=nextOccurrence(basis,r);
  const history={...task,id:crypto.randomUUID(),done:true,status:'Done' as const,recurrence:undefined,seriesDefaults:undefined,occurrenceOf:task.id,completedAt:at};
  if(next){const duration=task.start?Math.max(0,Math.round((parse(task.due).getTime()-parse(task.start).getTime())/86400000)):0;
   const offset=Math.round((parse(next).getTime()-parse(task.due).getTime())/86400000);
   const reminder=task.reminderAt?new Date(Date.parse(task.reminderAt)+offset*86400000):undefined;
   if(reminder&&task.reminderTimeZone){const zone=task.reminderTimeZone;const old=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(task.reminderAt!));try{task={...task,reminderAt:reminderInstant(localDay(reminder.toISOString(),zone)+'T'+old,zone)}}catch{task={...task,reminderAt:undefined}}}
   else task={...task,reminderAt:reminder?.toISOString()};
   const defaults=task.seriesDefaults||{};
   return [...tasks.map(t=>t.id===id?{...task,...defaults,id:t.id,due:next,start:task.start?shift(next,-duration):undefined,plannedDate:undefined,myDay:undefined,myDayUserIds:{},done:false,completedAt:undefined,status:'To do' as const,checklist:(defaults.checklist||t.checklist)?.map(item=>({...item,done:false})),recurrence:{...r,completed:(r.completed||0)+1},seriesDefaults:undefined}:t),history];
  }
  if(!r.paused)return [...tasks.filter(t=>t.id!==id),{...history,id:task.id,occurrenceOf:undefined,recurrence:{...r,mode:'none'}}];
 }
 return tasks.map(t=>t.id===id?{...t,done:!t.done,status:t.done?'To do':'Done',completedAt:t.done?undefined:at}:t);
}
