import React from 'react';
import {CalendarDays} from 'lucide-react';
import {companyApi,useCompany} from './Company';
import {useAccountPreferences} from './AccountPreferences';
import {MeetingDetails,useExternalCalendars,type ExternalMeeting} from './CalendarConnections';
import {addDays} from './overview';
import {eventLastDay,inCalendarZone,type CalendarPrefs} from './calendarModel';

export function ConnectedMeetingSchedule({start,days=7}:{start:string;days?:number}){
 const {user}=useCompany(),{preferences}=useAccountPreferences(),zone=preferences.timeZone||'Europe/London';
 const {accounts,meetings,error}=useExternalCalendars(addDays(start,-1),addDays(start,days));
 const [prefs,setPrefs]=React.useState<Partial<CalendarPrefs>|null>(null),[preferenceError,setPreferenceError]=React.useState(''),[selected,setSelected]=React.useState<ExternalMeeting|null>(null);
 React.useEffect(()=>{let active=true;setPrefs(null);setSelected(null);setPreferenceError('');if(user)void companyApi<{preferences:Partial<CalendarPrefs>}>('calendar/preferences').then(data=>{if(active)setPrefs(data.preferences)}).catch(()=>{if(active)setPreferenceError('Calendar selections could not be loaded. Reopen this view to try again.')});return()=>{active=false}},[user?.id]);
 if(!user||!accounts.length&&!error)return null;
 const rows=meetings.filter(meeting=>prefs&&!prefs.hidden?.includes('external:'+meeting.calendarId)).map(meeting=>({...meeting,start:meeting.allDay?meeting.start:inCalendarZone(meeting.start.slice(0,16),'UTC',zone),end:meeting.allDay?meeting.end:inCalendarZone(meeting.end.slice(0,16),'UTC',zone)}));
 return <section className="connected-meeting-schedule" aria-label="Connected meetings"><div className="section-heading"><h3><CalendarDays size={16}/>Your meetings</h3><small>Private to you · {zone}</small></div>{(error||preferenceError)&&<p role="alert" className="company-error">{error||preferenceError}</p>}{prefs&&<div className="connected-meeting-days" style={{'--meeting-days':days} as React.CSSProperties}>{Array.from({length:days},(_,index)=>{const day=addDays(start,index),items=rows.filter(item=>item.start.slice(0,10)<=day&&eventLastDay(item)>=day).sort((a,b)=>a.start.localeCompare(b.start));return <div key={day}><h4>{new Date(day+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})}</h4>{items.map(item=><button key={item.id} className="connected-meeting-block" style={{'--calendar-colour':prefs.colours?.['external:'+item.calendarId]||item.colour} as React.CSSProperties} onClick={()=>setSelected(meetings.find(m=>m.id===item.id)||null)}><CalendarDays size={13}/><span><small>{item.allDay?'All day':item.start.slice(0,10)<day?'Continued':item.start.slice(11,16)}</small><strong>{item.title}</strong><small>{item.calendarName}</small></span></button>)}{!items.length&&<small className="native-muted">No meetings</small>}</div>})}</div>}{selected&&<MeetingDetails meeting={selected} timeZone={zone} onClose={()=>setSelected(null)}/>}</section>;
}
