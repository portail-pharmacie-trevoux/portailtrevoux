import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const pwsh=process.env.PORTAIL_TEST_PWSH;
test('PowerShell launcher parses and .NET decrypts the Node private report; tampering is rejected',{skip:!pwsh,timeout:30000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'grouped-pwsh-fixture-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const encrypt=join(dir,'encrypt.mjs');await writeFile(encrypt,"import {readFileSync,writeFileSync} from 'node:fs';import {encryptPrivateReport} from "+JSON.stringify(new URL('../scripts/migration/grouped/secure-channel.mjs',import.meta.url).href)+";const key=JSON.parse(readFileSync(process.argv[2]));writeFileSync(process.argv[3],JSON.stringify(encryptPrivateReport({identities:[{sourceId:15,name:'Synthetic private identity'}]},key)));" );
 const script=join(dir,'test.ps1');await writeFile(script,`
$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($args[0],[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'PARSE_FAILED'}
$functions=$ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)
foreach($f in $functions){. ([scriptblock]::Create($f.Extent.Text))}
$audit=@{dataWrites=0;executionLocked=$true;issueSummary=@{total=4};previousAttempt=@{state='NO_COMMIT_RECEIPT'}}
$terminal=@{dataWrites=0;executionLocked=$true;conflicts=4}
$previous=@{state='NO_COMMIT_RECEIPT'}
foreach($code in @(0,1,2)) { if(@(Get-AuditCompletionErrors $true $audit @{identities=@()} $terminal $previous $code $false).Count) { throw 'COMPLETE_AUDIT_REJECTED' } }
if(-not @(Get-AuditCompletionErrors $true $audit $null $terminal $previous 1 $false).Count) { throw 'MISSING_PRIVATE_ACCEPTED' }
if(-not @(Get-AuditCompletionErrors $true $audit @{} $terminal $previous 1 $true).Count) { throw 'BLOCKED_AUDIT_ACCEPTED' }
$terminal.conflicts=5
if(-not @(Get-AuditCompletionErrors $true $audit @{identities=@()} $terminal $previous 0 $false).Count) { throw 'INCOHERENT_AUDIT_ACCEPTED' }
$rsa=New-Object Security.Cryptography.RSACryptoServiceProvider(2048)
$rsa.PersistKeyInCsp=$false
try {
 $pub=$rsa.ExportParameters($false)
 @{kty='RSA';n=(To-Base64Url $pub.Modulus);e=(To-Base64Url $pub.Exponent)} | ConvertTo-Json -Compress | Set-Content -LiteralPath $args[1] -Encoding utf8NoBOM
 & node $args[2] $args[1] $args[3]
 if($LASTEXITCODE -ne 0){throw 'ENCRYPT_FAILED'}
 $envelope=Get-Content -LiteralPath $args[3] -Raw | ConvertFrom-Json
 $plain=Open-PrivateReport $envelope $rsa
 if(($plain|ConvertFrom-Json).identities[0].name -ne 'Synthetic private identity'){throw 'DECRYPT_FAILED'}
 $bytes=[Convert]::FromBase64String($envelope.tag);$bytes[0]=$bytes[0] -bxor 1;$envelope.tag=[Convert]::ToBase64String($bytes)
 $rejected=$false
 try {Open-PrivateReport $envelope $rsa | Out-Null} catch {$rejected=$true}
 if(-not $rejected){throw 'TAMPER_ACCEPTED'}
 'POWERSHELL_CRYPTO_AND_PARSE_OK'
} finally {$rsa.Dispose()}
`);
 const result=await promisify(execFile)(pwsh,['-NoProfile','-File',script,new URL('../scripts/migration/grouped/Start-Migration.ps1',import.meta.url).pathname,join(dir,'public.json'),encrypt,join(dir,'envelope.json')],{env:{...process.env,XDG_CACHE_HOME:'/tmp/portail-pwsh-cache',XDG_CONFIG_HOME:'/tmp/portail-pwsh-config',XDG_DATA_HOME:'/tmp/portail-pwsh-data'}});assert.match(result.stdout,/POWERSHELL_CRYPTO_AND_PARSE_OK/);assert(!result.stdout.includes('Synthetic private identity'));
});
