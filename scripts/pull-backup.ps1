# Copies the server's database backups to this Windows PC. Run it by hand or from
# Task Scheduler:
#   powershell -File pull-backup.ps1 -Server root@<server-address>
#
# Every backup the PC does not have yet is downloaded, so days when the PC was off
# are caught up. Each file is checked before it is kept.
param(
    [Parameter(Mandatory = $true)][string]$Server,
    [string]$Key = "$HOME\.ssh\pronutrition_vps",
    [string]$Dest = "$HOME\ProNutritionBackups", # keep this outside the git repo
    [string]$RemoteDir = '/var/backups/pro-nutrition',
    [int]$KeepDays = 30
)
$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force $Dest | Out-Null
$logFile = Join-Path $Dest 'pull-backup.log'

function Write-Log([string]$Text) {
    $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Text
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    Write-Host $line
}

# True when the file unpacks and ends with the line mysqldump writes last.
function Test-Dump([string]$Path) {
    try {
        $in = [IO.File]::OpenRead($Path)
        try {
            $gz = New-Object IO.Compression.GZipStream($in, [IO.Compression.CompressionMode]::Decompress)
            $buffer = New-Object byte[] 65536
            $tail = ''
            while (($n = $gz.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $tail += [Text.Encoding]::ASCII.GetString($buffer, 0, $n)
                if ($tail.Length -gt 200) { $tail = $tail.Substring($tail.Length - 200) }
            }
            return $tail -match 'Dump completed'
        } finally {
            $in.Dispose()
        }
    } catch {
        return $false
    }
}

try {
    # BatchMode: fail at once instead of waiting for a password nobody will type.
    $ssh = @('-i', $Key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20')

    $listing = ssh @ssh $Server "ls -1 $RemoteDir"
    if ($LASTEXITCODE -ne 0) { throw "Cannot list backups on the server (ssh exit $LASTEXITCODE)." }

    # Only names in the backup script's own format are accepted.
    $pattern = '^[A-Za-z0-9_]+-(\d{4}-\d{2}-\d{2})_\d{6}\.sql\.gz$'
    $remote = @($listing | Where-Object { $_ -match $pattern } | Sort-Object)
    if ($remote.Count -eq 0) { throw "No backups found in $RemoteDir on the server." }

    $cutoff = (Get-Date).Date.AddDays(-$KeepDays)
    $failed = 0
    $new = 0
    foreach ($name in $remote) {
        $null = $name -match $pattern
        if ([datetime]$Matches[1] -lt $cutoff) { continue }
        $file = Join-Path $Dest $name
        if (Test-Path $file) { continue }

        $part = "$file.part"
        scp @ssh "${Server}:$RemoteDir/$name" $part
        if ($LASTEXITCODE -eq 0 -and (Test-Dump $part)) {
            Move-Item $part $file
            Write-Log "Saved $name"
            $new++
        } else {
            if (Test-Path $part) { Remove-Item $part -Force }
            Write-Log "ERROR: $name did not download completely."
            $failed++
        }
    }
    if ($failed -gt 0) { throw "$failed backup(s) failed." }

    # A stopped server job would otherwise go unnoticed.
    $null = $remote[-1] -match $pattern
    if ([datetime]$Matches[1] -lt (Get-Date).Date.AddDays(-2)) {
        throw "The newest backup on the server is from $($Matches[1]). Check the server's cron job."
    }

    # Old local copies go, but the newest 7 are always kept.
    Get-ChildItem $Dest -Filter '*.sql.gz' |
        Where-Object { $_.Name -match $pattern } |
        Sort-Object Name -Descending |
        Select-Object -Skip 7 |
        Where-Object { $null = $_.Name -match $pattern; [datetime]$Matches[1] -lt $cutoff } |
        Remove-Item -Force

    Write-Log "OK: $new new file(s). Newest: $($remote[-1])"
} catch {
    Write-Log "FAILED: $($_.Exception.Message)"
    exit 1
}
