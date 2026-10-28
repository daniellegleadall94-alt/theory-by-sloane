export const palettes={
 // Original Theory surfaces, sage accents and light sidebar; muted text meets current contrast checks.
 original:{name:'Original Theory',bg:'#F8F9F6',surface:'#FFFFFF',ink:'#292C29',muted:'#5F6759',line:'#E8EAE3',primary:'#343C2E',accent:'#849276',soft:'#E0E6D7',sidebar:'#F0F2EB',sidebarInk:'#292C29'},
 clay:{name:'Clay and olive',bg:'#F3F0E8',surface:'#FFFFFF',ink:'#1E1C18',muted:'#5A554C',line:'#DCD5C7',primary:'#2F3B2F',accent:'#B5562E',soft:'#E5E9DD',sidebar:'#232B24',sidebarInk:'#EEECE4'},
 sand:{name:'Sand and terracotta',bg:'#F5EFE6',surface:'#FFFDF9',ink:'#231C17',muted:'#5F5348',line:'#E0D3C1',primary:'#7A3B22',accent:'#C9822B',soft:'#F2E1D2',sidebar:'#FFFDF9',sidebarInk:'#231C17'},
 stone:{name:'Stone and slate',bg:'#F0F0EC',surface:'#FFFFFF',ink:'#1A1D20',muted:'#555B62',line:'#D5D7D2',primary:'#2D3741',accent:'#A0562F',soft:'#E1E6E9',sidebar:'#1F262D',sidebarInk:'#F0F0EC'},
 heather:{name:'Heather and rust',bg:'#F2EFEF',surface:'#FFFFFF',ink:'#1F1A22',muted:'#5B5361',line:'#DAD3D9',primary:'#43384F',accent:'#A65640',soft:'#E8E2EA',sidebar:'#2A2330',sidebarInk:'#F2EFEF'},
 office:{name:'Office blue',bg:'#F5F5F5',surface:'#FFFFFF',ink:'#242424',muted:'#616161',line:'#D1D1D1',primary:'#0F6CBD',accent:'#0078D4',soft:'#EBF3FC',sidebar:'#FAFAFA',sidebarInk:'#242424'},
 violet:{name:'Workspace violet',bg:'#F5F5FA',surface:'#FFFFFF',ink:'#242424',muted:'#5F5F6B',line:'#D7D7E0',primary:'#5B5FC7',accent:'#464EB8',soft:'#E8EBFA',sidebar:'#F3F2F8',sidebarInk:'#242424'},
 teal:{name:'Corporate teal',bg:'#F3F7F7',surface:'#FFFFFF',ink:'#202D2D',muted:'#526565',line:'#D3DFDF',primary:'#006A6A',accent:'#007E87',soft:'#DDF1F0',sidebar:'#F0F6F6',sidebarInk:'#202D2D'},
 neutral:{name:'Classic neutral',bg:'#F5F5F5',surface:'#FFFFFF',ink:'#202020',muted:'#5C5C5C',line:'#D7D7D7',primary:'#3B3B3B',accent:'#0067B8',soft:'#EDEDED',sidebar:'#FAFAFA',sidebarInk:'#242424'},
 night:{name:'Night',bg:'#151613',surface:'#1E1F1B',ink:'#EDEAE2',muted:'#A9A498',line:'#373832',primary:'#C8D3B5',accent:'#E0895C',soft:'#283024',sidebar:'#0F100D',sidebarInk:'#EDEAE2'}
};
export const paletteDescriptions:Partial<Record<keyof typeof palettes,string>>={original:'The original soft sage, white and light sidebar.',office:'Microsoft-inspired blue with clean, neutral surfaces.',violet:'A familiar collaboration-workspace violet.',teal:'A clean business palette with teal accents.',neutral:'Simple white and grey with a blue accent.'};
export type Theme={preset:keyof typeof palettes;primary?:string;accent?:string;contrast:'soft'|'balanced'|'strong';sidebar:'default'|'light'|'dark';corners:'sharp'|'soft'|'round';motion:'full'|'reduced'};
export const defaultTheme:Theme={preset:'clay',contrast:'balanced',sidebar:'default',corners:'soft',motion:'full'};
const rgb=(hex:string)=>hex.slice(1).match(/../g)!.map(x=>parseInt(x,16));
const lum=(hex:string)=>rgb(hex).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
export const contrastRatio=(a:string,b:string)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
const white='#FFFFFF',black='#151613';
export const onColour=(colour:string)=>contrastRatio(colour,white)>contrastRatio(colour,black)?white:black;
const mix=(a:string,b:string,n:number)=>'#'+rgb(a).map((x,i)=>Math.round(x*(1-n)+rgb(b)[i]*n).toString(16).padStart(2,'0')).join('');
export function themeTokens(t:Theme):Record<string,string>{
 const p=palettes[t.preset]||palettes.clay,night=t.preset==='night';const primary=t.primary||p.primary,accent=t.accent||p.accent;
 const side=t.sidebar==='light'?palettes.sand.surface:t.sidebar==='dark'?palettes.clay.sidebar:p.sidebar;
 const sideInk=t.sidebar==='default'?p.sidebarInk:onColour(side),muted=t.contrast==='strong'?mix(p.muted,p.ink,.35):t.contrast==='soft'?mix(p.muted,p.bg,.08):p.muted;
 const radius=t.corners==='sharp'?'2px':t.corners==='round'?'20px':'12px';
 return {'--bg':p.bg,'--surface':p.surface,'--surface-2':mix(p.surface,p.bg,.6),'--ink':p.ink,'--muted':muted,'--line':t.contrast==='strong'?mix(p.line,p.ink,.25):t.contrast==='soft'?mix(p.line,p.surface,.2):p.line,'--line-strong':mix(p.line,p.ink,.35),'--primary':primary,'--on-primary':onColour(primary),'--accent':accent,'--on-accent':onColour(accent),'--soft':p.soft,'--soft-ink':p.ink,'--danger':night?'#FFB4A4':'#A62E22','--danger-soft':night?'#44251F':'#FBE8E3','--sidebar':side,'--sidebar-ink':sideInk,'--sidebar-muted':mix(sideInk,side,.2),'--sidebar-active':mix(side,sideInk,.13),'--radius-card':radius,'--radius-control':t.corners==='round'?'12px':radius,'--radius-chip':t.corners==='sharp'?'2px':'999px','--shadow-card':night?'0 10px 28px #0005':'0 10px 28px #1E1C1814','--shadow-panel':'0 20px 70px #0003','--shadow-control':'0 4px 14px #0002','--side':p.soft};
}
export function readability(t:Theme){const v=themeTokens(t);return [['Body text',v['--ink'],v['--bg']],['Secondary text',v['--muted'],v['--bg']],['Button label',v['--on-primary'],v['--primary']],['Accent label',v['--on-accent'],v['--accent']],['Sidebar text',v['--sidebar-ink'],v['--sidebar']]].map(([label,a,b])=>({label,ratio:contrastRatio(a,b)}))}
export function validateTheme(value:unknown):Theme{const t=value as Theme;if(!t||!palettes[t.preset]||!['soft','balanced','strong'].includes(t.contrast)||!['default','light','dark'].includes(t.sidebar)||!['sharp','soft','round'].includes(t.corners)||!['full','reduced'].includes(t.motion)||[t.primary,t.accent].some(c=>c!==undefined&&!/^#[\da-f]{6}$/i.test(c)))throw Error('Choose a valid theme.');if(readability(t).some(c=>c.ratio<4.5))throw Error('This theme fails the minimum 4.5:1 readability check.');return {preset:t.preset,contrast:t.contrast,sidebar:t.sidebar,corners:t.corners,motion:t.motion,...(t.primary?{primary:t.primary}:{}),...(t.accent?{accent:t.accent}:{})}}
