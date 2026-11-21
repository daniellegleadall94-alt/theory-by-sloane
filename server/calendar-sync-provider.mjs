import {providerPayload} from './calendar-sync-model.mjs';

export function calendarSyncProvider(account,request){
 const google=account.provider==='google',root=google?'https://www.googleapis.com/calendar/v3':'https://graph.microsoft.com/v1.0/me';
 const calendarUrl=id=>root+'/calendars/'+encodeURIComponent(id);
 const eventsUrl=id=>calendarUrl(id)+'/events';
 const call=(url,method='GET',body,revision)=>request(account,url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(revision?{'If-Match':revision}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {
  async createCalendar(){return call(root+'/calendars','POST',google?{summary:'Theory',timeZone:'Europe/London'}:{name:'Theory'})},
  async get(calendar,id){try{return await call(eventsUrl(calendar)+'/'+encodeURIComponent(id))}catch(error){if(error.providerStatus===404||error.providerStatus===410)return null;throw error}},
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
