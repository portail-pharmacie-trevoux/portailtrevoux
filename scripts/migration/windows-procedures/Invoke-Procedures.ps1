param([ValidateSet('audit','apply','verify')][string]$Mode = 'audit')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Get-Command scalingo -ErrorAction Stop | Out-Null
if ($Mode -eq 'audit' -and (Test-Path -LiteralPath '.\audit.json')) { throw 'audit.json existe deja : conservez cet audit initial. Utiliser verify apres import ; ne pas ecraser le recu initial.' }
# Pin every executable/resource, not just the binary payload. No secrets in this package.
$checks = Get-Content -LiteralPath '.\checksums.json' -Raw | ConvertFrom-Json
foreach ($item in $checks.PSObject.Properties) {
    $actual = (Get-FileHash -LiteralPath $item.Name -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $item.Value) { throw "Integrite incorrecte : $($item.Name)" }
}
$arguments = @('--region','osc-fr1','--app','portailplus-hds','run','--silent',
    '--file','procedures-import.tar.gz','--file','bootstrap.sh')
if ($Mode -eq 'apply') {
    if (-not (Test-Path -LiteralPath '.\audit.json')) { throw 'Executer audit avant apply.' }
    $audit = Get-Content -LiteralPath '.\audit.json' -Raw | ConvertFrom-Json
    if ($audit.event -ne 'audit' -or $audit.allocation -ne 'remap' -or $audit.documents -ne 55 -or $audit.conflicts.Count -ne 0 -or $audit.mapping.Count -ne 55) { throw 'Audit incomplet ou conflits : ne pas importer.' }
    if ($audit.targetCount -ne 2 -or $audit.insert.Count -ne 55 -or $audit.present.Count -ne 0) { throw 'Etat different du lot initial attendu. Demander une revue ; utiliser verify si import deja effectue.' }
    $backup = Read-Host 'Reference ou date precise de la sauvegarde Scalingo recente terminee'
    if ([string]::IsNullOrWhiteSpace($backup)) { throw 'Sauvegarde obligatoire.' }
    Write-Host 'Cette action insere 55 procedures. Les IDs existants restent intacts.'
    Write-Host 'Le test de restauration a ete dispense par votre decision explicite.'
    $confirmation = Read-Host 'Pour autoriser la transaction, saisir IMPORTER 55 PROCEDURES'
    if ($confirmation -cne 'IMPORTER 55 PROCEDURES') { throw 'Aucune autorisation : import annule.' }
    $approval = [ordered]@{approved=$true;allocation='remap';authorizationReference=('Autorisation Windows '+(Get-Date).ToString('o'));
        archiveSha256=$audit.archiveSha256;targetDigest=$audit.targetDigest;nativeBackupReference=$backup;
        restoreVerified=$false;restoreRiskAccepted=$true;backupDurable=$true}
    $json = $approval | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'approval.json'),$json,(New-Object System.Text.UTF8Encoding($false)))
    $arguments += @('--file','approval.json')
}
if ($Mode -eq 'verify') {
    if (-not (Test-Path -LiteralPath '.\audit.json')) { throw 'Conserver le fichier audit.json original pour verifier les deux lignes preservees.' }
    $arguments += @('--file','audit.json')
}
$arguments += @('bash','/tmp/uploads/bootstrap.sh',$Mode)
# Capture only aggregate results/ID mappings, never binary data or credentials.
$lines = @(& scalingo @arguments)
$exitCode = $LASTEXITCODE
$lines | ForEach-Object { Write-Host $_ }
$events = @()
foreach ($line in $lines) {
    if ($line -match '^\s*\{') {
        try { $event = $line | ConvertFrom-Json; if ($event.event) { $events += $event } } catch { }
    }
}
$expected = switch ($Mode) { 'audit' {'audit'} 'apply' {'committed'} 'verify' {'verified'} }
$result = @($events | Where-Object { $_.event -eq $expected })
if ($exitCode -ne 0 -or $result.Count -ne 1) {
    throw 'Resultat non confirme. Ne pas relancer apply automatiquement. Executer verify pour determiner si un COMMIT a eu lieu.'
}
$resultJson = $result[0] | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot ($Mode+'.json')),$resultJson,(New-Object System.Text.UTF8Encoding($false)))
if ($Mode -eq 'audit' -and $result[0].conflicts.Count -gt 0) { throw 'Conflits identifies : aucune ecriture effectuee.' }
if ($Mode -eq 'apply') { Write-Host 'COMMIT confirme. Executer maintenant la commande verify.' }
