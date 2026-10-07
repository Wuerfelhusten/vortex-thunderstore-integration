$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    $packageInfo = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
    $version = [string]$packageInfo.version
    if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw 'Unsafe or unsupported release version' }
    $outputDirectory = Join-Path $projectRoot 'release'
    $zipPath = Join-Path $outputDirectory "vortex-thunderstore-$version.zip"
    $checksumPath = "$zipPath.sha256"
    if ((Test-Path -LiteralPath $zipPath) -or (Test-Path -LiteralPath $checksumPath)) {
        throw 'Release output already exists. Preserve it or choose a new version before packaging.'
    }
    & node build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    $info = Get-Content -LiteralPath 'dist/info.json' -Raw | ConvertFrom-Json
    if ($info.version -ne $version) { throw 'Built metadata version mismatch' }
    $files = @('index.js', 'info.json', 'assets/thunderstore.svg', 'assets/thunderstore.png')
    foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath (Join-Path 'dist' $file) -PathType Leaf)) { throw "Missing release file: $file" }
    }
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $files) {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $projectRoot "dist/$file"), $file) | Out-Null
        }
    } finally { $archive.Dispose() }
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $actual = @($archive.Entries | ForEach-Object { $_.FullName })
        if (Compare-Object ($files | Sort-Object) ($actual | Sort-Object)) { throw 'Unexpected ZIP contents' }
    } finally { $archive.Dispose() }
    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    [System.IO.File]::WriteAllText($checksumPath, "$hash  $([System.IO.Path]::GetFileName($zipPath))`n", [System.Text.UTF8Encoding]::new($false))
    Write-Output "Created $zipPath"
    Write-Output "SHA-256: $hash"
} finally { Pop-Location }
