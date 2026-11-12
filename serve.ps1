$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$pythonCandidates = @()
if ($env:LOCALAPPDATA) {
    $pythonRoot = Join-Path $env:LOCALAPPDATA "Programs\Python"
    if (Test-Path -LiteralPath $pythonRoot) {
        $pythonCandidates += Get-ChildItem -Path $pythonRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName "python.exe" }
    }
}
$pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
if ($pythonCommand -and $pythonCommand.Source -notlike "*WindowsApps*") {
    $pythonCandidates += $pythonCommand.Source
}
$pythonExe = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

Write-Host "Starting Prepdesk at http://localhost:8765"
Write-Host "Leave this window open while you practise. Press Ctrl+C to stop."
if ($pythonExe) {
    & $pythonExe -m http.server 8765 --bind 127.0.0.1
    exit $LASTEXITCODE
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw "Neither Python 3 nor Node.js was found. Install one of them, then run this script again."
}

& $nodeCommand.Source (Join-Path $PSScriptRoot "serve.js")
exit $LASTEXITCODE
