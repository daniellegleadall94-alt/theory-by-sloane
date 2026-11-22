Option Explicit
Dim shell, files, root, entry, node, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(files.GetParentFolderName(WScript.ScriptFullName))
entry = files.BuildPath(root, "scripts\run-backup.mjs")
node = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
If Not files.FileExists(node) Or Not files.FileExists(entry) Then WScript.Quit 2
shell.CurrentDirectory = root
' Window style 0 keeps the native backup runner hidden; wait for its exit code.
result = shell.Run(Chr(34) & node & Chr(34) & " " & Chr(34) & entry & Chr(34), 0, True)
WScript.Quit result
