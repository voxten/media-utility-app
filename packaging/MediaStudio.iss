; Inno Setup Script for Media Studio
; Creates a native Windows Setup Wizard (Installer)

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0-dev"
#endif

#define MyAppName "Media Studio"
#define MyAppPublisher "Voxten"
#define MyAppURL "https://github.com/voxten/media-utility-app"
#define MyAppExeName "MediaStudio.exe"

[Setup]
AppId={{8B7A1C94-4F3D-4A8E-952B-7E8B1A2C3D4E}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist\installer
OutputBaseFilename=MediaStudio-Setup-{#MyAppVersion}
SetupIconFile=..\assets\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DisableProgramGroupPage=auto
DisableReadyPage=no
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; Delete previous frontend build completely before copying new assets so no stale files remain
Type: filesandordirs; Name: "{app}\_internal\frontend\dist\*"
Type: filesandordirs; Name: "{app}\_internal\frontend\dist"
; Invalidate stale WebView2 caches from previous installations
Type: filesandordirs; Name: "{userappdata}\MediaStudio\webview\EBWebView\Default\Cache\*"
Type: filesandordirs; Name: "{userappdata}\MediaStudio\webview\EBWebView\Default\Cache"
Type: filesandordirs; Name: "{userappdata}\MediaStudio\webview\EBWebView\Default\Code Cache\*"
Type: filesandordirs; Name: "{userappdata}\MediaStudio\webview\EBWebView\Default\Code Cache"

[Files]
Source: "..\dist\MediaStudio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\app.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\app.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\_internal"
Type: filesandordirs; Name: "{userappdata}\MediaStudio\webview"
