param([switch]$Execute,[string]$Revision='chore/scalingo-hds-preparation-2026-10')
$ErrorActionPreference = 'Stop'
Get-Command scalingo -ErrorAction Stop | Out-Null
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = 'https://raw.githubusercontent.com/portail-pharmacie-trevoux/portailtrevoux/'+$Revision+'/scripts/migration/grouped/'
$work = Join-Path $env:LOCALAPPDATA ('PortailPlus\migration-groupee-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$checks = (Invoke-WebRequest -UseBasicParsing -Uri ($base+'checksums.json')).Content | ConvertFrom-Json
foreach ($name in @('model.mjs','database.mjs','run.mjs','bootstrap.sh')) {
    $path = Join-Path $work $name
    Invoke-WebRequest -UseBasicParsing -Uri ($base+$name) -OutFile $path
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $checks.$name) { throw ('Integrite incorrecte : '+$name) }
}
# List existing backups only. This program NEVER creates a backup.
$backupLines = @(& scalingo --region osc-fr1 --app portailplus-hds backups --addon ad-c8c607db-6770-4284-8d78-861696e07c0e)
if ($LASTEXITCODE -ne 0) { throw 'Lecture des sauvegardes Scalingo impossible. Aucune ecriture.' }
$available = @()
foreach ($line in $backupLines) {
    $clean = $line -replace '\x1b\[[0-9;]*m',''
    if ($clean -match '([0-9a-f]{24})\s*[|\u2502]\s*([A-Za-z]{3},\s+\d{2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+(?:UTC|GMT))\s*[|\u2502].*[|\u2502]\s*done\b') {
        $id = $Matches[1]; $date = $Matches[2] -replace '\s+(UTC|GMT)$',' +00:00'
        $stamp = [DateTimeOffset]::ParseExact($date,'ddd, dd MMM yyyy HH:mm:ss zzz',[Globalization.CultureInfo]::InvariantCulture)
        if ($stamp -gt [DateTimeOffset]::UtcNow.AddHours(-36)) { $available += [PSCustomObject]@{id=$id;createdAt=$stamp.UtcDateTime.ToString('o')} }
    }
}
$backup = $available | Sort-Object createdAt -Descending | Select-Object -First 1
if (-not $backup) { throw 'Aucune sauvegarde terminee de moins de 36 heures reconnue. Aucune nouvelle sauvegarde creee ; ne pas importer.' }
$mode = if ($Execute) { 'execute' } else { 'audit' }
$runtime = @{mode=$mode;backup=$backup} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $work 'runtime.json'),$runtime,(New-Object Text.UTF8Encoding($false)))
Write-Host ('Sauvegarde existante retenue : '+$backup.id+' / '+$backup.createdAt)
Write-Host ('Mode : '+$mode+'. Rapport sans contenu metier : '+$work)
$cliArguments = @('--region','osc-fr1','--app','portailplus-hds','run')
foreach ($name in @('model.mjs','database.mjs','run.mjs','bootstrap.sh','runtime.json')) { $cliArguments += @('--file',(Join-Path $work $name)) }
$cliArguments += @('bash','/tmp/uploads/bootstrap.sh')
# Native stdin remains interactive. No credentials in args, files or app env settings.
& scalingo @cliArguments | Tee-Object -FilePath (Join-Path $work 'rapport.txt')
if ($LASTEXITCODE -ne 0) { throw 'Operation bloquee ou resultat incertain : lire le rapport. Ne pas relancer automatiquement en mode execution.' }
