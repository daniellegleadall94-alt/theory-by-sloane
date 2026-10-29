export const menuCatalog=[
 {id:'My Dashboard',label:'My Dashboard',section:'Personal'},
 {id:'My Work',label:'My Work',section:'Personal'},
 {id:'Marketing Overview',label:'Marketing Overview',section:'Marketing'},
 {id:'Campaigns & Projects',label:'Campaigns & Projects',section:'Marketing'},
 {id:'Marketing Disciplines',label:'Marketing Channels',section:'Marketing'},
 {id:'Marketing Operations',label:'Marketing Operations',section:'Marketing'},
 {id:'Insights & Knowledge',label:'Insights & Knowledge',section:'Marketing'},
 {id:'My Inbox',label:'Notifications',section:'My Work'},
 {id:'My Calendar',label:'Calendar',section:'My Work'},
 {id:'My Planner',label:'The List',section:'My Work'},
 {id:'Notes & Ideas',label:'Notes & Ideas',section:'My Work'},
 {id:'My Learning',label:'My Learning',section:'My Work'},
 {id:'Workload',label:'Workload',section:'My Work'},
 {id:'My Passwords',label:'My Passwords',section:'My Work'},
 {id:'Strategy & Objectives',label:'Strategy & Objectives',section:'Marketing Overview'},
 {id:'Marketing Request Centre',label:'Request Centre',section:'Marketing Operations'},
 {id:'Automations & Playbooks',label:'Automations & Playbooks',section:'Marketing Operations'},
 {id:'Marketing Tools',label:'Marketing Tools',section:'Marketing Operations'},
 {id:'Budget & Resources',label:'Budget & Resources',section:'Marketing Operations'},
 {id:'Reporting & Analytics',label:'Reporting & Analytics',section:'Insights & Knowledge'},
 {id:'Files & Knowledge',label:'Files & Knowledge',section:'Insights & Knowledge'}
];
export type MenuEntry={id:string;visible:boolean};
export const defaultMenu=():MenuEntry[]=>menuCatalog.map((item,index)=>({id:item.id,visible:index<7}));
export function validMenu(value:unknown):value is MenuEntry[]{
 return Array.isArray(value)&&value.length===menuCatalog.length&&new Set(value.map(item=>item?.id)).size===menuCatalog.length&&value.every(item=>item&&menuCatalog.some(option=>option.id===item.id)&&typeof item.visible==='boolean');
}
export function readMenu(layout:string,legacyFavourites='[]'):MenuEntry[]{
 try{const value:unknown=JSON.parse(layout);if(validMenu(value))return value.map(({id,visible})=>({id,visible}))}catch{/* Existing accounts use the defaults. */}
 let pinned:string[]=[];
 try{const value:unknown=JSON.parse(legacyFavourites);if(Array.isArray(value))pinned=[...new Set(value.filter((id):id is string=>typeof id==='string'&&menuCatalog.some(item=>item.id===id)))]}catch{/* Ignore invalid legacy preferences. */}
 const defaults=defaultMenu();
 return [...pinned.map(id=>({id,visible:true})),...defaults.filter(item=>!pinned.includes(item.id))];
}
export function moveMenu(entries:MenuEntry[],id:string,target:string):MenuEntry[]{
 const from=entries.findIndex(item=>item.id===id),to=entries.findIndex(item=>item.id===target);
 if(from<0||to<0||from===to)return entries;
 const next=[...entries];next.splice(to,0,...next.splice(from,1));return next;
}
