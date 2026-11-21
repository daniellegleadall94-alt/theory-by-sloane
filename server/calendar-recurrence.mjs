import {eventOccurrences} from '../src/calendarModel.ts';
import {reminderInstant} from '../src/work.ts';
import {addDays} from '../src/overview.ts';
const week=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'],codes=['SU','MO','TU','WE','TH','FR','SA'],positions=['first','second','third','fourth','last'];
const unsupported=()=>{throw Object.assign(Error('This repeat pattern cannot yet be synchronised without changing its schedule.'),{status:422})};

// Translate only schedules whose semantics match Theory. Unsupported rules remain untouched.
export function exportRecurrence(provider,event){
 const r=event.recurrence;if(!r||r.mode==='none')return null;
 if(r.paused||r.basis==='completion'||Object.keys(event.exceptions||{}).length)unsupported();
 const start=event.start.slice(0,10),day=new Date(start+'T12:00:00Z'),unit=r.mode==='custom'?r.unit:({daily:'days',weekdays:'weeks',weekly:'weeks',monthly:'months',annually:'years'})[r.mode];
 if(!unit||r.startDate&&r.startDate>start||r.anchor&&r.anchor!==start)unsupported();
 const interval=r.mode==='weekdays'?1:r.interval||1,days=r.mode==='weekdays'?[1,2,3,4,5]:r.days?.length?r.days:[day.getUTCDay()];
 if(unit==='weeks'&&!days.includes(day.getUTCDay()))unsupported();
 const monthDay=r.monthDay||day.getUTCDate(),month=r.month||day.getUTCMonth()+1,relative=r.monthlyPattern==='weekday';
 // Theory clamps month-end dates; provider absolute patterns can omit short months.
 if((unit==='months'||unit==='years')&&!relative&&monthDay>28)unsupported();
 if(relative&&(unit!=='months'||![1,2,3,4,-1].includes(r.ordinal||1)))unsupported();
 if(relative){const nextWeek=new Date(day.getTime()+7*86400000);if(day.getUTCDay()!==(r.weekday??day.getUTCDay())||(r.ordinal===-1?nextWeek.getUTCMonth()===day.getUTCMonth():Math.floor((day.getUTCDate()-1)/7)+1!==(r.ordinal||1)))unsupported()}
 else if((unit==='months'||unit==='years')&&(monthDay!==day.getUTCDate()||unit==='years'&&month!==day.getUTCMonth()+1))unsupported();
 let count=r.count;if(count&&r.endDate)count=Math.min(count,eventOccurrences({...event,exceptions:{}},start,r.endDate).length);
 if(count===0)unsupported();
 if(provider==='microsoft'){
  const pattern={type:unit==='days'?'daily':unit==='weeks'?'weekly':unit==='months'?(relative?'relativeMonthly':'absoluteMonthly'):'absoluteYearly',interval};
  if(unit==='weeks'){pattern.daysOfWeek=days.map(d=>week[d]);pattern.firstDayOfWeek='monday'}
  if(unit==='months'||unit==='years'){if(relative){pattern.daysOfWeek=[week[r.weekday??day.getUTCDay()]];pattern.index=positions[r.ordinal===-1?4:(r.ordinal||1)-1]}else pattern.dayOfMonth=monthDay;if(unit==='years')pattern.month=month}
  return {pattern,range:{type:count?'numbered':r.endDate?'endDate':'noEnd',startDate:start,recurrenceTimeZone:event.timeZone||'Europe/London',...(count?{numberOfOccurrences:count}:r.endDate?{endDate:r.endDate}:{})}};
 }
 const fields=['FREQ='+({days:'DAILY',weeks:'WEEKLY',months:'MONTHLY',years:'YEARLY'})[unit],'INTERVAL='+interval,'WKST=MO'];
 if(unit==='weeks')fields.push('BYDAY='+days.map(d=>codes[d]).join(','));
 if(unit==='months'||unit==='years'){if(relative)fields.push('BYDAY='+(r.ordinal||1)+codes[r.weekday??day.getUTCDay()]);else fields.push('BYMONTHDAY='+monthDay);if(unit==='years')fields.push('BYMONTH='+month)}
 if(count)fields.push('COUNT='+count);else if(r.endDate)fields.push('UNTIL='+(event.allDay?r.endDate.replaceAll('-',''):reminderInstant(r.endDate+'T23:59',event.timeZone||'Europe/London').replaceAll('-','').replaceAll(':','').replace('.000','')));
 return ['RRULE:'+fields.join(';')];
}

export function importRecurrence(provider,value,start,zone='Europe/London'){
 if(!value||Array.isArray(value)&&!value.length)return undefined;
 const date=start.slice(0,10),day=new Date(date+'T12:00:00Z');
 let unit,interval=1,days=[],monthDay,month,ordinal,weekday,count,endDate;
 if(provider==='microsoft'){
  const {pattern:p,range:r}=value;if(!p||!r||r.startDate!==date)unsupported();
  interval=p.interval||1;unit=({daily:'days',weekly:'weeks',absoluteMonthly:'months',relativeMonthly:'months',absoluteYearly:'years'})[p.type];if(!unit)unsupported();
  if(unit==='weeks'){if(p.firstDayOfWeek&&p.firstDayOfWeek!=='monday')unsupported();days=(p.daysOfWeek||[]).map(d=>week.indexOf(d));if(days.some(d=>d<0))unsupported()}
  if(p.type==='relativeMonthly'){if(p.daysOfWeek?.length!==1)unsupported();weekday=week.indexOf(p.daysOfWeek[0]);ordinal=p.index==='last'?-1:positions.indexOf(p.index)+1;if(weekday<0||!ordinal)unsupported()}
  monthDay=p.dayOfMonth;month=p.month;if(r.type==='numbered')count=r.numberOfOccurrences;else if(r.type==='endDate')endDate=r.endDate;else if(r.type!=='noEnd')unsupported();
 }else{
  if(!Array.isArray(value)||value.length!==1||!value[0].startsWith('RRULE:'))unsupported();
  const entries=value[0].slice(6).split(';').map(field=>field.split('='));if(entries.some(pair=>pair.length!==2)||new Set(entries.map(pair=>pair[0])).size!==entries.length)unsupported();
  const r=Object.fromEntries(entries);if(Object.keys(r).some(k=>!['FREQ','INTERVAL','WKST','BYDAY','BYMONTHDAY','BYMONTH','COUNT','UNTIL'].includes(k))||r.WKST&&r.WKST!=='MO'||r.COUNT&&r.UNTIL)unsupported();
  unit=({DAILY:'days',WEEKLY:'weeks',MONTHLY:'months',YEARLY:'years'})[r.FREQ];if(!unit)unsupported();interval=Number(r.INTERVAL||1);
  if(unit==='weeks')days=(r.BYDAY||codes[day.getUTCDay()]).split(',').map(d=>codes.indexOf(d));
  else if(r.BYDAY){const match=r.BYDAY.match(/^(-1|[1-4])(SU|MO|TU|WE|TH|FR|SA)$/);if(!match||unit!=='months')unsupported();ordinal=Number(match[1]);weekday=codes.indexOf(match[2])}
  if(r.BYMONTHDAY){if(!/^\d{1,2}$/.test(r.BYMONTHDAY))unsupported();monthDay=Number(r.BYMONTHDAY)}if(r.BYMONTH){if(!/^\d{1,2}$/.test(r.BYMONTH))unsupported();month=Number(r.BYMONTH)}if(r.COUNT)count=Number(r.COUNT);
  if(r.BYMONTHDAY&&(!['months','years'].includes(unit)||r.BYDAY)||r.BYMONTH&&unit!=='years')unsupported();
  if(r.UNTIL){if(!/^\d{8}(T\d{6}Z)?$/.test(r.UNTIL))unsupported();endDate=r.UNTIL.slice(0,4)+'-'+r.UNTIL.slice(4,6)+'-'+r.UNTIL.slice(6,8);if(r.UNTIL.length>8){const instant=endDate+'T'+r.UNTIL.slice(9,11)+':'+r.UNTIL.slice(11,13)+':'+r.UNTIL.slice(13,15)+'Z';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});endDate=parts.format(new Date(instant));if(Date.parse(reminderInstant(endDate+'T'+(start.slice(11,16)||'00:00'),zone))>Date.parse(instant))endDate=addDays(endDate,-1)}}
 }
 if(!Number.isInteger(interval)||interval<1||interval>365||days.some(d=>d<0)||monthDay!==undefined&&(!Number.isInteger(monthDay)||monthDay<1||monthDay>28)||month!==undefined&&(!Number.isInteger(month)||month<1||month>12)||count!==undefined&&(!Number.isInteger(count)||count<1||count>100000)||['months','years'].includes(unit)&&!ordinal&&(monthDay||day.getUTCDate())>28)unsupported();
 return {mode:'custom',unit,interval,days,anchor:date,startDate:date,...(monthDay?{monthDay}:{}),...(month?{month}:{}),...(ordinal?{monthlyPattern:'weekday',ordinal,weekday}:{}),...(count?{count}:{}),...(endDate?{endDate}:{})};
}
