!macro customInstall
  DetailPrint "Registering Open Folder as Project context menu..."
  WriteRegStr HKCU "Software\Classes\Directory\shell\QuantixCode" "" "Open Folder as Project"
  WriteRegStr HKCU "Software\Classes\Directory\shell\QuantixCode" "Icon" '"$INSTDIR\Quantix Code.exe"'
  WriteRegStr HKCU "Software\Classes\Directory\shell\QuantixCode\command" "" '"$INSTDIR\Quantix Code.exe" "%1"'
!macroend

!macro customUnInstall
  DetailPrint "Removing Quantix Code context menus..."
  DeleteRegKey HKCU "Software\Classes\Directory\shell\QuantixCode"
!macroend
