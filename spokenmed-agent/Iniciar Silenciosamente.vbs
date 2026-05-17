' SpokenMED Agente — modo silencioso (sem janela de console)
' Use este atalho para uso diário. Os logs continuam indo pra agent.log
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
exe = """" & folder & "\runtime\pythonw.exe"""
script = """" & folder & "\runtime\agent.py"""
sh.CurrentDirectory = folder
sh.Run exe & " " & script, 0, False
