; Inno Setup script for AMBS Proposal Generator
; Compile with:  iscc build\installer.iss
; Requires:      PyInstaller already built dist\AMBSProposalGen\ (see AMBSProposalGen.spec)

#define MyAppName "AMBS Proposal Generator"
#define MyAppVersion "0.2.0"
#define MyAppPublisher "SolutionsAI"
#define MyAppURL "https://www.solutionsai.co.za"
#define MyAppExeName "AMBSProposalGen.exe"

[Setup]
AppId={{A2B6D0B0-3A01-4D0E-9E13-AMBSSOLUTIONSAI}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\SolutionsAI\AMBSProposalGen
DefaultGroupName=SolutionsAI
DisableProgramGroupPage=yes
OutputDir=..\build\installer_out
OutputBaseFilename=AMBSProposalGen-Setup-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
Source: "..\dist\AMBSProposalGen\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
