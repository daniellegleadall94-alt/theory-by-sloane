import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createBackup} from './backup.mjs';

// Machine-local configuration is deliberately excluded from source control.
export function startBackupScheduler(databasePath,env={}) {
 const configPath=resolve('.data/backup-config.json'),statusPath=resolve('.data/backup-status.json');
 let running=false,closed=false;
 const tick=async()=>{
  if(running||closed||!existsSync(configPath))return;
  running=true;
  try {
   const config=JSON.parse(readFileSync(configPath,'utf8'));
   if(config.enabled!==true)return;
   let previous={};try{previous=JSON.parse(readFileSync(statusPath,'utf8'))}catch{}
   if(previous.lastSuccess&&Date.now()-Date.parse(previous.lastSuccess)<86400000)return;
   const result=await createBackup({databasePath,destination:config.destination,keyFile:config.keyFile,retentionDays:config.retentionDays,runtimeSettings:env});
   writeFileSync(statusPath,JSON.stringify({lastSuccess:result.createdAt,file:result.file,verified:true},null,2));
  }catch(error){
   let previous={};try{previous=JSON.parse(readFileSync(statusPath,'utf8'))}catch{}
   writeFileSync(statusPath,JSON.stringify({...previous,lastAttempt:new Date().toISOString(),error:error.message},null,2));
   console.error('Theory backup failed; see local backup status.');
  }finally{running=false}
 };
 const timer=setInterval(tick,60000);timer.unref();void tick();
 return ()=>{closed=true;clearInterval(timer)};
}
