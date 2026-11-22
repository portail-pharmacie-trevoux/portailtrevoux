#requires -Version 7.0
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Cette opération requiert Windows et les ACL NTFS.' }
$openssl = (Get-Command openssl -CommandType Application -TotalCount 1 -ErrorAction Stop).Source
$directory = Join-Path $env:LOCALAPPDATA 'PortailPlus-OperatorSigning'
if (Test-Path -LiteralPath $directory) { throw 'Le dossier existe déjà. Réutilisez la clé approuvée ou choisissez une procédure de rotation.' }
New-Item -ItemType Directory -Path $directory | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
    $sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'
))
Set-Acl -LiteralPath $directory -AclObject $acl
$private = Join-Path $directory 'operator-private.pem'
$public = Join-Path $directory 'operator-public.pem'
& $openssl genpkey -algorithm ED25519 -aes-256-cbc -out $private
if ($LASTEXITCODE -ne 0) { throw 'Échec de création de la clé chiffrée.' }
& $openssl pkey -in $private -pubout -out $public
if ($LASTEXITCODE -ne 0) { throw 'Échec export de la clé publique.' }
Get-FileHash -LiteralPath $public -Algorithm SHA256 | Select-Object Path,Hash
