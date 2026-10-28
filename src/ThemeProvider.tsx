import React from 'react';
import {useCompany,companyApi} from './Company';
import {defaultTheme,themeTokens,type Theme} from './theme';
const Context=React.createContext({theme:defaultTheme,personal:null as Theme|null,workspaceTheme:null as Theme|null,ready:false,reload:async()=>{},save:async(_theme:Theme|null,_scope:string)=>{},toggleNight:()=>{}});
export const useTheme=()=>React.useContext(Context);
export function ThemeProvider({children}:{children:React.ReactNode}){
 const {user,loading}=useCompany(),org=user?.company?.id;
 const [data,setData]=React.useState<{personal:Theme|null;workspaceTheme:Theme|null}>({personal:null,workspaceTheme:null}),[loaded,setLoaded]=React.useState('');
 const key=(user?.id||'guest')+':'+(org||'personal');
 const currentKey=React.useRef(key);currentKey.current=key;
 const reload=async()=>{if(user){const d=await companyApi<{personal:Theme|null;workspaceTheme:Theme|null}>('appearance'+(org?'?organisationId='+org:''));if(key!==currentKey.current)return;setData(d)}else{let personal=null;try{personal=JSON.parse(localStorage.getItem('theory.guest-theme')||'null')}catch{}setData({personal,workspaceTheme:null})}setLoaded(key)};
 React.useEffect(()=>{let active=true;if(!loading)void reload().catch(()=>{if(active){setData({personal:null,workspaceTheme:null});setLoaded(key)}});return()=>{active=false}},[key,loading]);
 const theme=data.personal||data.workspaceTheme||defaultTheme;
 React.useLayoutEffect(()=>{if(loaded!==key)return;const root=document.documentElement;Object.entries(themeTokens(theme)).forEach(([k,v])=>root.style.setProperty(k,v));root.dataset.motion=theme.motion;root.dataset.theme=theme.preset;root.style.colorScheme=theme.preset==='night'?'dark':'light';localStorage.setItem('theory.theme-paint',JSON.stringify({tokens:themeTokens(theme),motion:theme.motion,preset:theme.preset}))},[theme,loaded,key]);
 const save=async(theme:Theme|null,scope:string)=>{if(user)await companyApi('appearance','PUT',{theme,scope,organisationId:org||null});else localStorage.setItem('theory.guest-theme',JSON.stringify(theme));await reload()};
 const toggleNight=()=>{void save({...theme,preset:theme.preset==='night'?'clay':'night',primary:undefined,accent:undefined},'personal')};
 return <Context.Provider value={{...data,theme,ready:loaded===key,reload,save,toggleNight}}>{children}</Context.Provider>;
}
