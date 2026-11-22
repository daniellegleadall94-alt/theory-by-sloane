$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$status = Get-Content -LiteralPath (Join-Path $repository '.data/backup-status.json') -Raw | ConvertFrom-Json
$personalRoot = (Get-ItemProperty 'HKCU:\Software\Microsoft\OneDrive\Accounts\Personal' -Name UserFolder).UserFolder
$expected = [IO.Path]::GetFullPath((Join-Path $personalRoot 'Theory Backups'))
$archive = [IO.Path]::GetFullPath($status.file)
if ([IO.Path]::GetDirectoryName($archive) -ine $expected) { throw 'Latest backup is not inside the registered Personal OneDrive backup folder.' }
# Query Windows Cloud Files metadata only. Never change pinning or sync flags.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class TheoryCloudStatus {
 [StructLayout(LayoutKind.Sequential)] public struct TagInfo { public uint Attributes; public uint Tag; }
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle file,int kind,out TagInfo info,uint size);
 [DllImport("CldApi.dll")] static extern uint CfGetPlaceholderStateFromAttributeTag(uint attributes,uint tag);
 public static uint Read(string path) {
  using(var handle=CreateFileW(path,0x80,7,IntPtr.Zero,3,0,IntPtr.Zero)) {
   if(handle.IsInvalid) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
   TagInfo info; if(!GetFileInformationByHandleEx(handle,9,out info,8)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
   return CfGetPlaceholderStateFromAttributeTag(info.Attributes,info.Tag);
  }
 }
}
'@
$state = [TheoryCloudStatus]::Read($archive)
[pscustomobject]@{
 destination = 'Personal OneDrive / Theory Backups'
 backupCreatedAt = $status.lastSuccess
 restoreVerified = $status.verified
 cloudPlaceholder = ($state -ne [uint32]::MaxValue -and ($state -band 1) -ne 0)
 providerReportsInSync = ($state -ne [uint32]::MaxValue -and ($state -band 8) -ne 0)
 checkedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json
