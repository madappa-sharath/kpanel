#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$Repo = "madappa-sharath/kpanel"
$InstallDir = if ($env:KPANEL_INSTALL_DIR) { $env:KPANEL_INSTALL_DIR } else { "$env:LOCALAPPDATA\kpanel" }

$Arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "amd64" }
    "ARM64" { "arm64" }
    default { Write-Error "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE"; exit 1 }
}

$Version = $env:VERSION
if (-not $Version) {
    $Release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
    $Version = $Release.tag_name
}

if (-not $Version) {
    Write-Error "Could not determine latest version. Set `$env:VERSION to install a specific release."
    exit 1
}

$Archive = "kpanel_windows_$Arch.zip"
$BaseUrl = "https://github.com/$Repo/releases/download/$Version"
$ArchiveUrl = "$BaseUrl/$Archive"
$ChecksumsUrl = "$BaseUrl/checksums.txt"

Write-Host "Installing kpanel $Version (windows/$Arch)..."

$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $Tmp | Out-Null

try {
    $ArchivePath = Join-Path $Tmp $Archive
    $ChecksumsPath = Join-Path $Tmp "checksums.txt"

    Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ArchivePath
    Invoke-WebRequest -Uri $ChecksumsUrl -OutFile $ChecksumsPath

    Write-Host "Verifying checksum..."
    $Expected = Get-Content $ChecksumsPath |
      ForEach-Object {
        $parts = $_ -split '\s+', 2
        if ($parts.Count -eq 2 -and $parts[1] -eq $Archive) { $parts[0] }
      } |
      Select-Object -First 1
    if (-not $Expected) {
        Write-Error "Could not find checksum for $Archive in checksums.txt."
        exit 1
    }
    $Actual = (Get-FileHash -Algorithm SHA256 $ArchivePath).Hash.ToLower()
    if ($Actual -ne $Expected.ToLower()) {
        Write-Error "Checksum mismatch.`nExpected: $Expected`nGot:      $Actual"
        exit 1
    }
    Write-Host "Checksum OK."

    # Verify build provenance. checksums.txt comes from the same release as the
    # archive, so it cannot detect a swapped release. The GitHub attestation ties
    # the archive to this repo's release workflow.
    # gh writes progress to stderr. With 'Stop', Windows PowerShell 5.1 can turn
    # native stderr into a terminating error, so use exit codes here instead.
    $GhReady = $false
    $GhExit = 1
    $PrevPref = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if (Get-Command gh -ErrorAction SilentlyContinue) {
            # Check for a github.com credential (login or GH_TOKEN) rather than
            # `gh auth status`, which also fails because of unrelated hosts.
            & gh auth token --hostname github.com *> $null
            $GhReady = ($LASTEXITCODE -eq 0)
        }
        if ($GhReady) {
            Write-Host "Verifying build provenance with gh attestation verify..."
            # --source-ref stops an attested archive from an older tag being
            # passed off as this version.
            & gh attestation verify $ArchivePath `
                --hostname github.com `
                --repo $Repo `
                --signer-workflow "$Repo/.github/workflows/release.yml" `
                --source-ref "refs/tags/$Version"
            $GhExit = $LASTEXITCODE
        }
    } finally {
        $ErrorActionPreference = $PrevPref
    }
    if ($GhReady) {
        if ($GhExit -ne 0) {
            Write-Error "Build provenance verification failed for $Archive. Aborting."
            exit 1
        }
        Write-Host "Provenance OK."
    } else {
        Write-Warning "GitHub CLI (gh) is not installed or not logged in."
        Write-Warning "Skipping build provenance verification; only the SHA-256 checksum was checked."
        Write-Warning "Install gh and run 'gh auth login' to verify that this release was built by $Repo."
    }

    Expand-Archive -Path $ArchivePath -DestinationPath $Tmp -Force

    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir | Out-Null
    }
    Move-Item -Path (Join-Path $Tmp "kpanel.exe") -Destination (Join-Path $InstallDir "kpanel.exe") -Force

    Write-Host "Installed to $InstallDir\kpanel.exe"

    # Add install dir to the user PATH if not already present
    $CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($CurrentPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("PATH", "$CurrentPath;$InstallDir", "User")
        Write-Host "Added $InstallDir to your PATH (restart your terminal for changes to take effect)."
    }

    & (Join-Path $InstallDir "kpanel.exe") --version
} finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
