[CmdletBinding()]
param([string]$Revision='chore/scalingo-hds-preparation-2026-10',[string]$DecisionsPath='')
$ErrorActionPreference = 'Stop'
Get-Command scalingo -ErrorAction Stop | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$utf8 = New-Object Text.UTF8Encoding($false)
$base = 'https://raw.githubusercontent.com/portail-pharmacie-trevoux/portailtrevoux/'+$Revision+'/scripts/migration/grouped/'
$work = Join-Path $env:LOCALAPPDATA ('PortailPlus\audit-groupe-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
# Private report contains only requested identities/publication diagnostics, never credentials.
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($owner)
$acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($owner,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
Set-Acl -LiteralPath $work -AclObject $acl
$checks = (Invoke-WebRequest -UseBasicParsing -Uri ($base+'checksums.json')).Content | ConvertFrom-Json
$names = @('model.mjs','database.mjs','diagnostics.mjs','secure-channel.mjs','run.mjs','bootstrap.sh')
foreach ($name in $names) {
    $path = Join-Path $work $name
    Invoke-WebRequest -UseBasicParsing -Uri ($base+$name) -OutFile $path
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $checks.$name) { throw ('Integrite incorrecte : '+$name) }
}
function To-Base64Url([byte[]]$Bytes) { return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
function Open-PrivateReport($Envelope,$Rsa) {
    if ($Envelope.algorithm -ne 'RSA-OAEP-SHA1+A256CBC-HS256') { throw 'Format du rapport prive inconnu.' }
    $master = $Rsa.Decrypt([Convert]::FromBase64String($Envelope.key),$true)
    if ($master.Length -ne 64) { throw 'Cle du rapport prive invalide.' }
    try {
        [byte[]]$iv = [Convert]::FromBase64String($Envelope.iv)
        [byte[]]$cipher = [Convert]::FromBase64String($Envelope.data)
        [byte[]]$tag = [Convert]::FromBase64String($Envelope.tag)
        if ($iv.Length -ne 16 -or $tag.Length -ne 32 -or $cipher.Length -gt 2097168) { throw 'Rapport prive invalide.' }
        $hmac = New-Object Security.Cryptography.HMACSHA256
        $hmac.Key = [byte[]]$master[32..63]
        try { [byte[]]$expected = $hmac.ComputeHash([byte[]]($iv+$cipher)) } finally { $hmac.Dispose() }
        $difference = 0
        for ($i=0;$i -lt 32;$i++) { $difference = $difference -bor ($tag[$i] -bxor $expected[$i]) }
        if ($difference -ne 0) { throw 'Integrite du rapport prive incorrecte.' }
        $aes = [Security.Cryptography.Aes]::Create()
        $aes.Key = [byte[]]$master[0..31]; $aes.IV=$iv
        try { $decryptor=$aes.CreateDecryptor(); try { $plain=$decryptor.TransformFinalBlock($cipher,0,$cipher.Length) } finally { $decryptor.Dispose() } } finally { $aes.Dispose() }
        try { return [Text.Encoding]::UTF8.GetString($plain) } finally { [Array]::Clear($plain,0,$plain.Length) }
    } finally { [Array]::Clear($master,0,$master.Length) }
}
$rsa = New-Object Security.Cryptography.RSACryptoServiceProvider(2048)
$rsa.PersistKeyInCsp = $false
$public = $rsa.ExportParameters($false)
$decisions = @{}
if ($DecisionsPath) { $decisions=Get-Content -LiteralPath $DecisionsPath -Raw | ConvertFrom-Json }
$runtime = @{mode='audit';decisions=$decisions;reportPublicKey=@{kty='RSA';n=(To-Base64Url $public.Modulus);e=(To-Base64Url $public.Exponent)}} | ConvertTo-Json -Depth 10
[IO.File]::WriteAllText((Join-Path $work 'runtime.json'),$runtime,$utf8)
Write-Host 'AUDIT UNIQUEMENT : aucune ecriture sur Render ou Scalingo, aucune migration possible dans cette version.'
Write-Host ('Rapports locaux prives : '+$work)
$secret = Read-Host 'Collez l URL PostgreSQL EXTERNE Render (saisie locale masquee, jamais dans ChatGPT)' -AsSecureString
$cli = @('--region','osc-fr1','--app','portailplus-hds','run','--silent')
foreach ($name in ($names+@('runtime.json'))) { $cli += @('--file',(Join-Path $work $name)) }
$cli += @('bash','/tmp/uploads/bootstrap.sh')
$process = New-Object Diagnostics.Process
$process.StartInfo.FileName = (Get-Command scalingo).Source
$process.StartInfo.Arguments = ($cli | ForEach-Object { '"'+$_.Replace('"','\"')+'"' }) -join ' '
$process.StartInfo.UseShellExecute = $false
$process.StartInfo.CreateNoWindow = $true
$process.StartInfo.RedirectStandardInput=$true
$process.StartInfo.RedirectStandardOutput=$true
$process.StartInfo.RedirectStandardError=$true
$process.StartInfo.StandardOutputEncoding=$utf8
$process.StartInfo.StandardErrorEncoding=$utf8
$log = New-Object IO.StreamWriter((Join-Path $work 'rapport.txt'),$false,$utf8)
$sent=$false; $audit=$null; $private=$null; $started=$false; $completed=$false
try {
    $started=$process.Start(); if (-not $started) { throw 'Demarrage CLI impossible.' }
    $errorsTask=$process.StandardError.ReadToEndAsync()
    $lineTask=$process.StandardOutput.ReadLineAsync()
    $lastProgress=[DateTime]::UtcNow
    while ($true) {
        if (-not $lineTask.Wait(500)) {
            if (([DateTime]::UtcNow-$lastProgress).TotalSeconds -gt 180) { throw 'Delai audit depasse. Aucune ecriture. Ne pas relancer en execution.' }
            continue
        }
        $line=$lineTask.Result
        if ($null -eq $line) { break }
        $lastProgress=[DateTime]::UtcNow
        $clean=($line -replace '\x1b\[[0-?]*[ -/]*[@-~]','').Trim()
        if ($clean -eq 'PORTAIL_SECRET_READY_V2') {
            if ($sent) { throw 'Nouvelle demande inattendue du secret.' }
            $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
            try {
                $url=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
                $frame='PORTAIL-RENDER-URL-V2:'+ [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($url))
                if ($frame.Length -gt 3500) { throw 'URL trop longue.' }
                $process.StandardInput.WriteLine($frame);$process.StandardInput.Flush();$sent=$true
            } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$url=$null;$frame=$null;$secret.Dispose() }
        } elseif ($clean.StartsWith('{')) {
            try { $event=$clean | ConvertFrom-Json } catch { throw 'Reponse technique illisible, aucun contenu brut journalise.' }
            if ($event.event -eq 'private_report') {
                $text=Open-PrivateReport $event $rsa
                [IO.File]::WriteAllText((Join-Path $work 'audit-prive.json'),$text,$utf8)
                $private=$text | ConvertFrom-Json; $text=$null
            } else {
                $log.WriteLine($clean);$log.Flush()
                if ($event.event -eq 'audit_only') { $completed=$true }
                if ($event.event -eq 'audit') { $audit=$event; $event | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $work 'audit.json') -Encoding UTF8 }
                if ($event.event -eq 'previous_attempt') { Write-Host ('Tentative precedente : '+$event.state) }
                if ($event.event -eq 'blocked') { Write-Host ('AUDIT BLOQUE : '+$event.code+' / '+$event.phase) }
            }
        }
        # Unrecognized CLI text and stderr are not logged, to avoid accidental secret echo.
        $lineTask=$process.StandardOutput.ReadLineAsync()
    }
    $process.WaitForExit();$errorsTask.Wait()
    if (-not $sent -or -not $audit -or -not $private -or -not $completed -or $process.ExitCode -notin @(0,2)) { throw 'Audit incomplet : aucun resultat fiable, aucune ecriture.' }
    Write-Host ('CONFLITS RESIDUELS : '+$audit.issueSummary.total)
    $audit.tables.PSObject.Properties | ForEach-Object { [PSCustomObject]@{Table=$_.Name;Render=$_.Value.source;Scalingo=$_.Value.existing;Creer=$_.Value.insert;MettreAJour=$_.Value.update;Conserver=$_.Value.keep} } | Format-Table -AutoSize
    $audit.issueSummary.categories.PSObject.Properties | ForEach-Object { Write-Host ($_.Name+' : '+$_.Value) }
    foreach ($person in $private.identities) { $name=if($person.sourceIdentity){$person.sourceIdentity.firstName+' '+$person.sourceIdentity.lastName}else{'[identite source absente]'};Write-Host ('Render #'+$person.sourceId+' : '+$name+' / '+$person.state) }
    foreach ($publication in $audit.publicationReview) { Write-Host ('Publication Render #'+$publication.sourceId+' -> Scalingo #'+$publication.targetId+' : '+($publication.differences -join ',')+' / '+$publication.resolution) }
    Write-Host 'Audit termine sans ecriture. Les details d identite et de publication restent dans audit-prive.json sur ce PC.'
} finally {
    if ($started -and -not $process.HasExited) { $process.Kill() }
    $process.Dispose();$rsa.Dispose();$log.Dispose();$secret.Dispose()
}
