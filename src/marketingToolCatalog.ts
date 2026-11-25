export const marketingTools=[
 {id:'email',name:'Email marketing',category:'Campaigns',description:'Plan email campaigns, keep briefs and organise upcoming sends.',kind:'email',status:'Planning tools',note:'Email sending is not connected yet.'},
 {id:'social',name:'Social media',category:'Campaigns',description:'Organise social posts, campaign ideas and content briefs.',kind:'post',status:'Planning tools',note:'Direct publishing is not connected yet.'},
 {id:'content',name:'Content planning',category:'Campaigns',description:'Turn ideas into briefs and track the tasks that bring them to life.',kind:'content',status:'Available',note:''},
 {id:'qr',name:'QR code generator',category:'Utilities',description:'Create downloadable QR codes for print, events and campaigns.',kind:'',status:'Coming soon',note:'Add to your profile for when this tool becomes available.'},
 {id:'utm',name:'UTM link builder',category:'Utilities',description:'Create consistent campaign tracking links for your marketing.',kind:'',status:'Coming soon',note:'Add to your profile for when this tool becomes available.'},
 {id:'website',name:'Website & SEO',category:'Campaigns',description:'Keep website updates, optimisation plans and briefs together.',kind:'website',status:'Planning tools',note:'Live SEO monitoring is not connected yet.'},
 {id:'contacts',name:'Contacts & suppliers',category:'Organisation',description:'Keep the people and suppliers behind your marketing easy to find.',kind:'contact',status:'Available',note:''},
 {id:'accounts',name:'Marketing accounts',category:'Organisation',description:'Find your company platforms, account owners and approved vault links.',kind:'account',status:'Available',note:''},
] as const;
export function selectedMarketingTools(value:unknown):string[]|null{try{if(typeof value!=='string')return null;const ids:unknown=JSON.parse(value);return Array.isArray(ids)&&ids.length<=marketingTools.length&&ids.every(id=>typeof id==='string'&&marketingTools.some(tool=>tool.id===id))?[...new Set(ids)]:null}catch{return null}}
