$ErrorActionPreference = 'Stop'

# Create ignored runtime folders without touching source code or importing data.
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$data = Join-Path $repo 'work\webapp\data'
$projects = Join-Path $data 'projects'
$organizations = Join-Path $data 'organizations'
New-Item -ItemType Directory -Force -Path $projects, $organizations | Out-Null

$envExample = Join-Path $repo 'work\webapp\.env.example'
$envFile = Join-Path $repo 'work\webapp\.env'
if (-not (Test-Path -LiteralPath $envFile)) {
  Write-Host 'Runtime folders created.'
  Write-Host "Copy $envExample to $envFile and replace every placeholder before first login."
} else {
  Write-Host 'Runtime folders already exist; existing .env was left unchanged.'
}
