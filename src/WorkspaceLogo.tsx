import React from 'react';
import {Building2,UserRound,Upload} from 'lucide-react';

export function WorkspaceIcon({logo,company=false}:{logo?:string;company?:boolean}){
 return <span className="workspace-monogram">{logo?<img src={logo} alt=""/>:company?<Building2 size={18}/>:<UserRound size={18}/>}</span>;
}

export function WorkspaceLogoEditor({logo,onChange,company=false,disabled=false}:{logo:string;onChange:(logo:string)=>void;company?:boolean;disabled?:boolean}){
 const [error,setError]=React.useState('');const [loading,setLoading]=React.useState(false);const input=React.useRef<HTMLInputElement>(null);
 const upload=async(file?:File)=>{
  if(!file)return;setError('');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('Choose a PNG, JPG or WebP image up to 5 MB.');return}
  setLoading(true);const url=URL.createObjectURL(file);
  try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const context=canvas.getContext('2d');if(!context)throw Error();const scale=Math.min(128/image.width,128/image.height);const width=image.width*scale,height=image.height*scale;context.drawImage(image,(128-width)/2,(128-height)/2,width,height);const result=canvas.toDataURL('image/webp',.85);if(!result.startsWith('data:image/webp;')||result.length>48000)throw Error();onChange(result)}catch{setError('This image could not be read. Please try another PNG, JPG or WebP.')}finally{URL.revokeObjectURL(url);setLoading(false)}
 };
 return <div className="workspace-logo-editor"><div className="workspace-logo-controls"><WorkspaceIcon logo={logo} company={company}/><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label={company?'Upload company logo':'Upload workspace image'} disabled={disabled||loading} onChange={event=>{void upload(event.target.files?.[0]);event.target.value=''}} hidden/><button type="button" className="secondary" disabled={disabled||loading} onClick={()=>input.current?.click()}><Upload size={13}/>{loading?'Preparing…':logo?'Change image':company?'Upload logo':'Upload image'}</button>{logo&&!disabled&&<button type="button" className="text-button" disabled={loading} onClick={()=>{onChange('');setError('')}}>Remove</button>}</div><small>{disabled?'Company owners can update the logo.':company?'Shown to everyone in this company. PNG, JPG or WebP · up to 5 MB.':'PNG, JPG or WebP · up to 5 MB.'}</small>{error&&<p className="company-error" role="alert">{error}</p>}</div>;
}
