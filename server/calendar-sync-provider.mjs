import {providerPayload} from './calendar-sync-model.mjs';
import {occurrenceDate} from './calendar-occurrence-model.mjs';
import {addDays} from '../src/overview.ts';

export function calendarSyncProvider(account,request){
 const google=account.provider==='google',root=google?'https://www.googleapis.com/calendar/v3':'https://graph.microsoft.com/v1.0/me';
 const calendarUrl=id=>root+'/calendars/'+encodeURIComponent(id);
 const eventsUrl=id=>calendarUrl(id)+'/events';
 const call=(url,method='GET',body,revision)=>request(account,url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(revision?{'If-Match':revision}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {
  async createCalendar(){return call(root+'/calendars','POST',google?{summary:'Theory',timeZone:'Europe/London'}:{name:'Theory'})},
  async get(calendar,id){try{return await call(eventsUrl(calendar)+'/'+encodeURIComponent(id))}catch(error){if(error.providerStatus===404||error.providerStatus===410)return null;throw error}},
  async exceptions(calendar,event,known,master){
   if(google)return known.filter(item=>item.recurringEventId===event.id).map(item=>({date:occurrenceDate(account.provider,item,master),event:item}));
   const details=await call(eventsUrl(calendar)+'/'+encodeURIComponent(event.id)+'?$select=id,exceptionOccurrences,cancelledOccurrences&$expand=exceptionOccurrences');
   if(details['exceptionOccurrences@odata.nextLink'])throw Error('This series has too many exceptions to synchronise safely.');
   const result=[];if((details.exceptionOccurrences?.length||0)+(details.cancelledOccurrences?.length||0)>1000)throw Error('This series has too many exceptions to synchronise safely.');
   for(const value of details.exceptionOccurrences||[]){const item=await this.get(calendar,value.id);if(item&&item.seriesMasterId!==event.id)throw Error('The provider returned an occurrence from a different series.');if(!item)throw Error('An occurrence changed while syncing. Try again.');result.push({date:occurrenceDate(account.provider,item,master),event:item})}
   for(const id of details.cancelledOccurrences||[]){const prefix='OID.'+event.id+'.',date=id.startsWith(prefix)?id.slice(prefix.length):'';if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('The provider returned an unknown cancelled occurrence identifier.');result.push({date,event:{id,isCancelled:true}})}
   return result;
  },
  async instance(calendar,masterId,date,master){
   const base=eventsUrl(calendar)+'/'+encodeURIComponent(masterId)+'/instances',params=new URLSearchParams(google?{timeMin:addDays(date,-2)+'T00:00:00Z',timeMax:addDays(date,3)+'T00:00:00Z',showDeleted:'true',maxResults:'1000'}:{startDateTime:addDays(date,-2)+'T00:00:00Z',endDateTime:addDays(date,3)+'T00:00:00Z','$top':'1000'});
   let url=base+'?'+params;const matches=[];
   for(let page=0;url;page++){
    if(page>10)throw Error('Too many recurring instances returned.');const parsed=new URL(url);if(parsed.origin!==new URL(base).origin||parsed.pathname!==new URL(base).pathname)throw Error('Unexpected recurrence page.');
    const data=await call(url);for(const item of google?data.items||[]:data.value||[]){if((google?item.recurringEventId:item.seriesMasterId)!==masterId)throw Error('The provider returned an occurrence from a different series.');if(occurrenceDate(account.provider,item,master)===date)matches.push(item);}
    if(google&&data.nextPageToken){parsed.searchParams.set('pageToken',data.nextPageToken);url=parsed.href}else url=google?null:data['@odata.nextLink'];
   }
   if(matches.length!==1)throw Error('The original recurring instance could not be identified uniquely.');return matches[0];
  },
  async updateInstance(calendar,id,item,revision){
   if(!revision)throw Error('The occurrence has no provider version.');const body=providerPayload(account.provider,{...item,recurrence:null});delete body.recurrence;
   return call(eventsUrl(calendar)+'/'+encodeURIComponent(id)+(google?'?sendUpdates=none':''),'PATCH',body,revision);
  },
  async checkSeries(calendar,event,knownEvents){
   if(!event.recurrence||Array.isArray(event.recurrence)&&!event.recurrence.length)return;
   if(google){if(knownEvents.some(item=>item.recurringEventId===event.id))throw Error('This series has occurrence changes. Sync is paused until occurrence synchronisation is supported.');return}
   const details=await call(eventsUrl(calendar)+'/'+encodeURIComponent(event.id)+'?$select=id,exceptionOccurrences,cancelledOccurrences&$expand=exceptionOccurrences');
   if(details.exceptionOccurrences?.length||details.cancelledOccurrences?.length)throw Error('This series has occurrence changes. Sync is paused until occurrence synchronisation is supported.');
  },
  async list(calendar,cursor){
   const items=[];let url=eventsUrl(calendar)+(google?'?maxResults=1000&showDeleted=true&singleEvents=false'+(cursor?'&syncToken='+encodeURIComponent(cursor):''):'?$top=250'),nextCursor=null;
   for(let pages=0;url;pages++){
    if(pages>=100)throw Error('This calendar is too large to synchronise in one pass.');
    const parsed=new URL(url),base=new URL(eventsUrl(calendar));
    if(parsed.origin!==base.origin||parsed.pathname!==base.pathname||parsed.username||parsed.password)throw Error('The provider returned an unexpected sync page.');
    let data;try{data=await call(url)}catch(error){if(google&&cursor&&error.providerStatus===410)return this.list(calendar,null);throw error}
    items.push(...(google?data.items||[]:data.value||[]));if(items.length>25000)throw Error('This calendar has too many items to synchronise safely.');
    if(google){nextCursor=data.nextSyncToken||nextCursor;if(data.nextPageToken){parsed.searchParams.set('pageToken',data.nextPageToken);url=parsed.href}else url=null}else url=data['@odata.nextLink'];
   }
   return {items,cursor:nextCursor,full:!google||!cursor};
  },
  async create(calendar,item,identity){
   try{return await call(eventsUrl(calendar)+(google?'?sendUpdates=none':''),'POST',providerPayload(account.provider,item,identity))}
   catch(error){if(google&&error.providerStatus===409)return this.get(calendar,identity);throw error}
  },
  async update(calendar,id,item,revision){
   if(!revision)throw Error('The provider did not return an event version. Refresh before syncing.');
   return call(eventsUrl(calendar)+'/'+encodeURIComponent(id)+(google?'?sendUpdates=none':''),'PATCH',providerPayload(account.provider,item),revision);
  },
  async remove(calendar,id,revision){
   if(!revision)throw Error('The provider did not return an event version. Refresh before deleting.');
   try{await call(eventsUrl(calendar)+'/'+encodeURIComponent(id)+(google?'?sendUpdates=none':''),'DELETE',undefined,revision)}catch(error){if(error.providerStatus!==404&&error.providerStatus!==410)throw error}
  }
 };
}
