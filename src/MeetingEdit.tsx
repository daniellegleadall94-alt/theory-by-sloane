import React from 'react';
import {companyApi} from './Company';
import {inCalendarZone} from './calendarModel';
import {reminderInstant} from './work';
import {calendarConnectionEvent,type ExternalMeeting} from './CalendarConnections';
export function MeetingEdit({meeting,timeZone,onSaved}:{meeting:ExternalMeeting;timeZone:string;onSaved:()=>void}){
 const local=(value:string)=>meeting.allDay?value:inCalendarZone(new Date(value).toISOString().slice(0,16),'UTC',timeZone);
 const [editing,setEditing]=React.useState(false),[title,setTitle]=React.useState(meeting.title),[notes,setNotes]=React.useState(meeting.notes),[start,setStart]=React.useState(local(meeting.start)),[end,setEnd]=React.useState(local(meeting.end)),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
 if(meeting.readOnly||!meeting.isOrganiser)return null;
 const attendeeCount=meeting.attendeeCount??meeting.attendees.length;
 const save=async()=>{if(attendeeCount&&!window.confirm(`This will send an update to ${attendeeCount} attendees. Save the changes?`))return;setBusy(true);setError('');try{await companyApi(`calendar/connections/${meeting.accountId}/meetings/${encodeURIComponent(meeting.externalId)}`,'PUT',{calendarId:meeting.calendarId,revision:meeting.revision,title,notes,start:meeting.allDay?start:reminderInstant(start,timeZone),end:meeting.allDay?end:reminderInstant(end,timeZone),confirmAttendees:true,attendeeCount:attendeeCount});window.dispatchEvent(new Event(calendarConnectionEvent));onSaved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 return <section>{!editing?<button className="secondary" onClick={()=>setEditing(true)}>Edit meeting</button>:<div className="strategy-persona"><label>Title<input maxLength={180} value={title} onChange={event=>setTitle(event.target.value)}/></label><label>Start · {meeting.allDay?'all day':timeZone}<input type={meeting.allDay?'date':'datetime-local'} value={start} onChange={event=>setStart(event.target.value)}/></label><label>End · {meeting.allDay?'all day':timeZone}<input type={meeting.allDay?'date':'datetime-local'} value={end} onChange={event=>setEnd(event.target.value)}/></label><label>Description<textarea maxLength={20000} rows={5} value={notes} onChange={event=>setNotes(event.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button className="secondary" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button><button className="primary" disabled={busy||!title.trim()||!start||!end} onClick={()=>void save()}>{busy?'Saving…':'Save meeting'}</button></div>}</section>;
}
