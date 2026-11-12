; Inno Setup Script for Media Studio
; Creates a native Windows Setup Wizard (Installer). Running it over an existing installation updates it in place.

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0-dev"
#endif

#define MyAppName "Media Studio"
#define MyAppPublisher "Voxten"
#define MyAppURL "https://github.com/voxten/media-utility-app"
#define MyAppExeName "MediaStudio.exe"
; Installed copies are registered under "{8B7A...}}_is1" (two closing braces); changing the AppId
; would make Setup treat existing installations as a different app instead of updating them.
#define MyAppGuid "8B7A1C94-4F3D-4A8E-952B-7E8B1A2C3D4E"

; Files offered to the app from Explorer (menu, Open with); keep in step with lib/fileTypes.ts.
#dim FileTypes[21]
#define FileTypes[0] ".png"
#define FileTypes[1] ".jpg"
#define FileTypes[2] ".jpeg"
#define FileTypes[3] ".webp"
#define FileTypes[4] ".bmp"
#define FileTypes[5] ".tif"
#define FileTypes[6] ".tiff"
#define FileTypes[7] ".gif"
#define FileTypes[8] ".mp4"
#define FileTypes[9] ".mkv"
#define FileTypes[10] ".mov"
#define FileTypes[11] ".avi"
#define FileTypes[12] ".webm"
#define FileTypes[13] ".m4v"
#define FileTypes[14] ".mp3"
#define FileTypes[15] ".wav"
#define FileTypes[16] ".m4a"
#define FileTypes[17] ".flac"
#define FileTypes[18] ".ogg"
#define FileTypes[19] ".opus"
#define FileTypes[20] ".pdf"
#define I

[Setup]
AppId={{{#MyAppGuid}}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
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
; A non-elevated Setup passes RedirectionGuard on to the app it launches after installing, and the app
; then fails with WinError 448 on any junction made by a regular user (e.g. tool folders on PATH).
RedirectionGuard=no

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
polish.UpdateReadyHeading=Aktualizacja
polish.UpdateReadyLine=Zainstalowana wersja %1 zostanie zaktualizowana do %2. Ustawienia i dodatki zostaną zachowane.
polish.ReinstallReadyLine=Wersja %1 zostanie zainstalowana ponownie.
polish.UpdateButton=&Aktualizuj
polish.DowngradeConfirm=Zainstalowana jest nowsza wersja (%1) niż ta w instalatorze (%2).%n%nCzy na pewno zainstalować starszą wersję?
english.UpdateReadyHeading=Update
english.UpdateReadyLine=Installed version %1 will be updated to %2. Settings and add-ons are kept.
english.ReinstallReadyLine=Version %1 will be reinstalled.
english.UpdateButton=&Update
polish.ShellIntegration=Dodaj „Otwórz w Media Studio” do menu plików, „Otwórz za pomocą” i „Wyślij do”
polish.OpenInApp=Otwórz w Media Studio
english.ShellIntegration=Add "Open in Media Studio" to the file menu, "Open with" and "Send to"
english.OpenInApp=Open in Media Studio
polish.RemoveDataConfirm=Usunąć też ustawienia, historię, ciasteczka, modele AI, dodatki i FFmpeg pobrane przez Media Studio?%n%nPliki zapisane w folderach wyników zostaną.
english.RemoveDataConfirm=Also remove the settings, history, cookies, AI models, add-ons and FFmpeg downloaded by Media Studio?%n%nFiles saved in your output folders are kept.
english.DowngradeConfirm=A newer version (%1) is installed than the one in this installer (%2).%n%nInstall the older version anyway?

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "shellintegration"; Description: "{cm:ShellIntegration}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; The PyInstaller bundle is replaced as a whole so DLLs and modules dropped from a newer build don't linger.
; Settings and add-ons live in %APPDATA%\MediaStudio and are not touched.
Type: filesandordirs; Name: "{app}\_internal"
; Invalidate stale WebView2 caches from previous installations
Type: filesandordirs; Name: "{userappdata}\MediaStudio\webview\EBWebView\Default\Cache"
Type: filesandordirs; Name: "{userappdata}\MediaStudio\webview\EBWebView\Default\Code Cache"

[Files]
Source: "..\dist\MediaStudio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{usersendto}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: shellintegration

[Registry]
; "Open with": the app and the file types it opens. Each launch passes the file to the running window.
Root: HKA; Subkey: "Software\Classes\Applications\{#MyAppExeName}"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "{#MyAppName}"; Flags: uninsdeletekey; Tasks: shellintegration
Root: HKA; Subkey: "Software\Classes\Applications\{#MyAppExeName}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: shellintegration
#sub FileTypeEntries
Root: HKA; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: "{#FileTypes[I]}"; ValueData: ""; Tasks: shellintegration
Root: HKA; Subkey: "Software\Classes\{#FileTypes[I]}\OpenWithList\{#MyAppExeName}"; Flags: uninsdeletekey; Tasks: shellintegration
Root: HKA; Subkey: "Software\Classes\SystemFileAssociations\{#FileTypes[I]}\shell\MediaStudio"; ValueType: string; ValueName: ""; ValueData: "{cm:OpenInApp}"; Flags: uninsdeletekey; Tasks: shellintegration
Root: HKA; Subkey: "Software\Classes\SystemFileAssociations\{#FileTypes[I]}\shell\MediaStudio"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName}"; Tasks: shellintegration
Root: HKA; Subkey: "Software\Classes\SystemFileAssociations\{#FileTypes[I]}\shell\MediaStudio"; ValueType: string; ValueName: "MultiSelectModel"; ValueData: "Player"; Tasks: shellintegration
Root: HKA; Subkey: "Software\Classes\SystemFileAssociations\{#FileTypes[I]}\shell\MediaStudio\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: shellintegration
#endsub
#for {I = 0; I < DimOf(FileTypes); I++} FileTypeEntries

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\_internal"
Type: filesandordirs; Name: "{userappdata}\MediaStudio\webview"

[Code]
const
  UninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{{#MyAppGuid}}}_is1';

var
  InstalledVersion: String;

function GetInstalledVersion(): String;
begin
  Result := '';
  if not RegQueryStringValue(HKCU, UninstallKey, 'DisplayVersion', Result) then
    RegQueryStringValue(HKLM, UninstallKey, 'DisplayVersion', Result);
end;

function NextVersionPart(var Version: String): Integer;
var
  Dot: Integer;
begin
  Dot := Pos('.', Version);
  if Dot = 0 then
  begin
    Result := StrToIntDef(Version, 0);
    Version := '';
  end else
  begin
    Result := StrToIntDef(Copy(Version, 1, Dot - 1), 0);
    Delete(Version, 1, Dot);
  end;
end;

{ Compares "major.minor.patch" versions: negative if A < B, 0 if equal, positive if A > B. }
function CompareVersions(A, B: String): Integer;
var
  I: Integer;
begin
  Result := 0;
  for I := 1 to 3 do
  begin
    Result := NextVersionPart(A) - NextVersionPart(B);
    if Result <> 0 then
      Exit;
  end;
end;

{ Settings, models and add-ons live outside the install folder; the user decides whether they go too. }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent then
    if MsgBox(CustomMessage('RemoveDataConfirm'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      DelTree(ExpandConstant('{userappdata}\MediaStudio'), True, True, True);
      DelTree(ExpandConstant('{localappdata}\MediaStudio'), True, True, True);
    end;
end;

function IsUpdate(): Boolean;
begin
  Result := InstalledVersion <> '';
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  InstalledVersion := GetInstalledVersion();
  if IsUpdate() and (CompareVersions(InstalledVersion, '{#MyAppVersion}') > 0) then
    Result := SuppressibleMsgBox(FmtMessage(CustomMessage('DowngradeConfirm'), [InstalledVersion, '{#MyAppVersion}']),
      mbConfirmation, MB_YESNO, IDYES) = IDYES;
end;

{ An update reuses the previous folder and task choices, so it goes straight to the Ready page. }
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := IsUpdate() and (PageID = wpSelectTasks);
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if IsUpdate() and (CurPageID = wpReady) then
    WizardForm.NextButton.Caption := CustomMessage('UpdateButton');
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo,
  MemoGroupInfo, MemoTasksInfo: String): String;
var
  Line: String;
begin
  Result := '';
  if IsUpdate() then
  begin
    if CompareVersions(InstalledVersion, '{#MyAppVersion}') = 0 then
      Line := FmtMessage(CustomMessage('ReinstallReadyLine'), ['{#MyAppVersion}'])
    else
      Line := FmtMessage(CustomMessage('UpdateReadyLine'), [InstalledVersion, '{#MyAppVersion}']);
    Result := CustomMessage('UpdateReadyHeading') + NewLine + Space + Line + NewLine + NewLine;
  end;
  if MemoDirInfo <> '' then
    Result := Result + MemoDirInfo + NewLine + NewLine;
  if MemoGroupInfo <> '' then
    Result := Result + MemoGroupInfo + NewLine + NewLine;
  if MemoTasksInfo <> '' then
    Result := Result + MemoTasksInfo + NewLine + NewLine;
end;
