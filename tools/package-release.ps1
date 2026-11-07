$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content (Join-Path $projectRoot 'module.json') -Raw | ConvertFrom-Json
$outputDirectory = Join-Path $projectRoot 'dist'
$stageDirectory = Join-Path $projectRoot ('private/release-staging/' + $manifest.version + '-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $outputDirectory, $stageDirectory | Out-Null
foreach ($name in @('module.json', 'README.md', 'LICENSE', 'RELEASE-NOTES.md', 'CHANGELOG.md')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $stageDirectory
}
foreach ($name in @('scripts', 'styles')) {
  $target = Join-Path $stageDirectory $name
  New-Item -ItemType Directory -Path $target | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $projectRoot $name) -File | Where-Object Extension -In @('.js', '.mjs', '.css') | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $target
  }
}
$archive = Join-Path $outputDirectory 'ugmuls-character-workshop.zip'
Compress-Archive -Path (Join-Path $stageDirectory '*') -DestinationPath $archive -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'module.json') -Destination $outputDirectory -Force
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $outputDirectory 'SHA256SUMS.txt'), "$hash  ugmuls-character-workshop.zip`n")
Write-Output "Prepared v$($manifest.version): $archive"
