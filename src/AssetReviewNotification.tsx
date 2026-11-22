import React from 'react';
import {companyApi} from './Company';
import {AssetProofing} from './AssetProofing';
export function AssetReviewNotification(){
 const [item,setItem]=React.useState<{org:string;file:{id:string;title:string;version?:number;mime?:string;content?:string}}|null>(null),[error,setError]=React.useState('');
 React.useEffect(()=>{let active=true;const open=(event:Event)=>{const {organisationId,id}=(event as CustomEvent).detail||{};if(typeof organisationId!=='string'||typeof id!=='string')return;setError('');void companyApi<{record:NonNullable<typeof item>['file']}>(`organisations/${encodeURIComponent(organisationId)}/data/file/${encodeURIComponent(id)}`).then(r=>{if(active)setItem({org:organisationId,file:r.record})}).catch(e=>{if(active)setError(e.message)})};window.addEventListener('theory:review-asset',open);return()=>{active=false;window.removeEventListener('theory:review-asset',open)}},[]);
 return <>{item&&<AssetProofing org={item.org} file={item.file} onClose={()=>setItem(null)}/>} {error&&<div className="company-error" role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}</>;
}
