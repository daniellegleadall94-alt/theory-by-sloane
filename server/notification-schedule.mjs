export function notificationReady(pref,createdAt,now=Date.now()){
 if(!['daily','weekly','custom'].includes(pref.frequency))return true;
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:pref.timeZone||'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const local=value=>{const p=Object.fromEntries(format.formatToParts(new Date(value)).map(v=>[v.type,v.value]));return {day:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute}};
 const event=local(createdAt),current=local(now),time=pref.time||'08:30';
 const date=new Date(event.day+'T12:00:00Z');
 if(event.time>=time)date.setUTCDate(date.getUTCDate()+1);
 if(pref.frequency==='weekly')date.setUTCDate(date.getUTCDate()+((8-date.getUTCDay())%7));
 const day=date.toISOString().slice(0,10);
 return current.day>day||current.day===day&&current.time>=time;
}
