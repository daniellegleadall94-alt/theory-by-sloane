import React from 'react';
import {companyApi,useCompany} from './Company';
export const preferenceDefaults={appearance:'system',density:'comfortable',landingPage:'My Dashboard',plannerView:'List',taskSort:'due',completedVisibility:'show',sidebar:'expanded',guidance:'on',notificationDisplay:'normal'};
export type Preferences=typeof preferenceDefaults&Record<string,string>;
const Context=React.createContext({ready:false,preferences:preferenceDefaults as Preferences,save:async(_value:Preferences)=>{}});
export const useAccountPreferences=()=>React.useContext(Context);
export function AccountPreferences({children}:{children:React.ReactNode}){
 const {user}=useCompany();const [loadedOwner,setLoadedOwner]=React.useState('');const [preferences,setPreferences]=React.useState<Preferences>(()=>({...preferenceDefaults,appearance:localStorage.getItem('theory.dark')==='true'?'dark':'system'}));
 React.useEffect(()=>{let active=true;setPreferences({...preferenceDefaults,appearance:localStorage.getItem('theory.dark')==='true'?'dark':'system'});if(user)void companyApi<{preferences:Preferences}>('settings/account').then(data=>{if(active){setPreferences({...preferenceDefaults,...data.preferences});setLoadedOwner(user.id)}}).catch(()=>{if(active)setLoadedOwner(user.id)});else setLoadedOwner('guest');return()=>{active=false}},[user?.id]);
 const save=async(value:Preferences)=>{if(user)await companyApi('settings/preferences','PUT',value);else localStorage.setItem('theory.dark',String(value.appearance==='dark'));setPreferences(value)};
 return <Context.Provider value={{ready:loadedOwner===(user?.id||'guest'),preferences,save}}>{children}</Context.Provider>;
}
