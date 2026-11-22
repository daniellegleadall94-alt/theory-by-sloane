import React from 'react';
import {companyApi} from './Company';
export function InvitationEmail({code}:{code:string}){
 const [configured,setConfigured]=React.useState(false),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');
 React.useEffect(()=>{setMessage('');void companyApi<{configured:boolean}>('company-invitations/email').then(r=>setConfigured(r.configured)).catch(()=>setConfigured(false))},[code]);
 return <span><button type="button" className="secondary" disabled={!configured||busy} title={configured?'Send to the email address bound to this invitation':'Configure a sender and public HTTPS address to enable invitation email'} onClick={()=>{setBusy(true);setMessage('');void companyApi('company-invitations/email','POST',{code}).then(()=>setMessage('Accepted by the mail provider. Inbox delivery is not yet confirmed.')).catch(e=>setMessage(e.message)).finally(()=>setBusy(false))}}>{busy?'Sending…':configured?'Email invitation':'Email setup required'}</button>{message&&<small role="status">{message}</small>}</span>;
}
