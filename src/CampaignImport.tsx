import React from 'react';
import {useCompany} from './Company';
import {TaskImport} from './TaskImport';
export function CampaignImport(){
 const {user}=useCompany(),[open,setOpen]=React.useState(false);
 if(!user)return null;
 return <><button className="secondary" onClick={()=>setOpen(true)}>Import campaigns / projects</button>{open&&<TaskImport recordType="campaign" onClose={()=>setOpen(false)}/>}</>;
}
