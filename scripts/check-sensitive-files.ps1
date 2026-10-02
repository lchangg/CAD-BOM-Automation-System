$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$bad = @()

$bad += Get-ChildItem -LiteralPath $repo -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension.ToLowerInvariant() -in @('.sqlite', '.sqlite3', '.db', '.dwg', '.dxf', '.env', '.log') }

$textFiles = Get-ChildItem -LiteralPath $repo -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension.ToLowerInvariant() -in @('.md', '.mjs', '.js', '.py', '.ps1', '.json', '.yml', '.yaml', '.txt') }
foreach ($file in $textFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
  $legacyCredentials = @('admin' + '123456', 'admin' + '@' + 'local')
  $localPathFragments = @(('C:' + '\\' + 'Users' + '\\'), ('D:' + '\\'), ('Documents' + '[\\/]' + 'Codex'))
  $hasLegacyCredential = $legacyCredentials | Where-Object { $content -like "*$_*" }
  $hasLocalPath = $localPathFragments | Where-Object { $content -match [regex]::Escape($_).Replace('\\\\', '\\\\') }
  if ($hasLegacyCredential -or $hasLocalPath) {
    $bad += $file
  }
}

if ($bad.Count -gt 0) {
  Write-Host 'Potential sensitive files or strings:'
  $bad | Sort-Object FullName -Unique | ForEach-Object { Write-Host $_.FullName }
  exit 1
}
Write-Host 'Sensitive-file check passed.'
