import React from 'react';
import {companyApi,useCompany} from './Company';
export function ActivityPresence(){
 const {user}=useCompany();
 React.useEffect(()=>{
  if(!user)return;
  let activeAt=Date.now();
  const interact=()=>{activeAt=Date.now()};
  const ping=()=>{if(document.visibilityState==='visible'&&Date.now()-activeAt<300000)void companyApi('activity/presence','POST',{}).catch(()=>{});};
  const visible=()=>{if(document.visibilityState==='visible'){interact();ping()}};
  window.addEventListener('pointerdown',interact,{passive:true});window.addEventListener('keydown',interact);document.addEventListener('visibilitychange',visible);
  ping();const timer=setInterval(ping,60000);
  return()=>{clearInterval(timer);window.removeEventListener('pointerdown',interact);window.removeEventListener('keydown',interact);document.removeEventListener('visibilitychange',visible)};
 },[user?.id]);
 return null;
}
