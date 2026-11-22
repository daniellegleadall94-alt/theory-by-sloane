import {eventOccurrences,inCalendarZone} from '../src/calendarModel.ts';
import {validTaskDate} from '../src/work.ts';
import {externalSyncItem,localSyncItem,applyExternalItem} from './calendar-sync-model.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:422})};
export function occurrenceDate(provider,event,master){
 const zone=master.timeZone||'Europe/London';
 if(provider==='google'){
  const value=event.originalStartTime;if(value?.date&&validTaskDate(value.date))return value.date;
  if(value?.dateTime){const date=new Date(value.dateTime);if(Number.isFinite(date.getTime()))return inCalendarZone(date.toISOString().slice(0,16),'UTC',zone).slice(0,10)}
 }else if(event.originalStart){const date=new Date(event.originalStart);if(Number.isFinite(date.getTime()))return inCalendarZone(date.toISOString().slice(0,16),'UTC',zone).slice(0,10)}
 fail('The provider did not identify the original occurrence date. The series is unchanged.');
}
export function localOccurrence(row,data,date,context={}){
 const occurrence=eventOccurrences({...data,exceptions:{}},date,date).find(e=>e.start.slice(0,10)===date);
 if(!occurrence)fail('This date is no longer part of the recurring schedule. Review its occurrence changes.');
 const change=data.exceptions?.[date];if(change?.cancelled)return {deleted:true};
 return localSyncItem(row,{...occurrence,...change,recurrence:undefined,exceptions:undefined},context);
}
export function remoteOccurrence(provider,event){
 return externalSyncItem(provider,{...event,recurringEventId:undefined,seriesMasterId:undefined,recurrence:undefined});
}
export function occurrenceChange(data,item){
 if(item.deleted)return {cancelled:true};
 const changed=applyExternalItem('event',{},item,data.timeZone||'Europe/London');
 return Object.fromEntries(['title','notes','start','end','allDay','timeZone','location'].map(k=>[k,changed[k]]));
}
