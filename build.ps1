param([ValidateSet('release','release-gemini','release-yellow')][string]$ReleaseName='release')
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $release = Join-Path $PSScriptRoot $ReleaseName
    New-Item -ItemType Directory -Path $release -Force | Out-Null
    $output = Join-Path $release 'PufferHelper.exe'
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    & $compiler /nologo /target:winexe /optimize+ "/out:$output" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll /reference:System.Security.dll /resource:ocr.ps1,PufferHelper.ocr.ps1 /resource:answers.txt,PufferHelper.answers.txt PufferHelper.cs AiClient.cs AiSettings.cs AiTests.cs UsedTracker.cs TopOverlay.cs BridgeServer.cs LauncherForm.cs BridgeTests.cs WordSuggestion.cs
    if ($LASTEXITCODE -ne 0) { throw 'Compilation failed' }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'extension') -Destination $release -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination $release -Force
} finally { Pop-Location }
