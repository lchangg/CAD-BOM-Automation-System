$appDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'webapp'
$listener = Get-NetTCPConnection -LocalPort 4318 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Host 'BOM service is already running: http://127.0.0.1:4318'
  exit 0
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  $nodeFallback = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $nodeFallback) { $nodeCommand = Get-Item -LiteralPath $nodeFallback }
}
if (-not $nodeCommand) { throw 'Node.js was not found.' }

$nodePath = $nodeCommand.Source
Start-Process -FilePath $nodePath -ArgumentList "server.mjs" -WorkingDirectory $appDir -WindowStyle Hidden
Start-Sleep -Milliseconds 800
if (Get-NetTCPConnection -LocalPort 4318 -State Listen -ErrorAction SilentlyContinue) {
  Write-Host 'BOM service started: http://127.0.0.1:4318'
} else {
  throw 'BOM service failed to start. Check work\webapp\server.mjs.'
}
