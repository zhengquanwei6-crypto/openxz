param(
  [string]$HostName = "202.182.102.34",
  [string]$User = "root",
  [int]$Port = 22,
  [string]$PublicUrl = "",
  [string]$Domain = "",
  [string]$LetsEncryptEmail = "",
  [ValidateSet("custom_api", "port_external")]
  [string]$LlmConnectionMode = "custom_api",
  [string]$LlmBaseUrl = "http://96.30.199.85:8080/v1",
  [string]$LlmPortExternalUrl = "",
  [string]$LlmModel = "gpt-5.5",
  [string]$ComfyUiBaseUrl = "",
  [switch]$ReplaceExistingHttpService,
  [switch]$SkipRemoteSmoke,
  [switch]$SkipAiChain,
  [switch]$SkipQualityGate
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $root

$nodeDir = Join-Path $root ".tools\node-v22.22.2-win-x64"
if (Test-Path -LiteralPath $nodeDir) {
  $env:Path = "$nodeDir;$env:Path"
}

$npm = Join-Path $nodeDir "npm.cmd"
if (-not (Test-Path -LiteralPath $npm)) {
  $npm = "npm"
}

function Test-CommandExists {
  param([string]$Command)
  return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

function ConvertFrom-SecureStringPlainText {
  param([System.Security.SecureString]$SecureString)
  $credential = [pscredential]::new("secret", $SecureString)
  return $credential.GetNetworkCredential().Password
}

function Read-SecretValue {
  param(
    [string]$Name,
    [string]$Prompt,
    [switch]$Required
  )

  $existing = [Environment]::GetEnvironmentVariable($Name)
  if ($existing) {
    return $existing
  }

  if (-not $Required) {
    return ""
  }

  if (-not [Environment]::UserInteractive) {
    throw "$Name is required. Set it as an environment variable before running this script."
  }

  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $plain = ConvertFrom-SecureStringPlainText $secure
  if (-not $plain) {
    throw "$Name is required."
  }
  return $plain
}

function New-HexSecret {
  param([int]$Bytes = 48)
  $buffer = [byte[]]::new($Bytes)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return -join ($buffer | ForEach-Object { $_.ToString("x2") })
}

function Assert-SingleLine {
  param(
    [string]$Name,
    [AllowNull()][string]$Value
  )
  if ($null -ne $Value -and ($Value.Contains("`n") -or $Value.Contains("`r"))) {
    throw "$Name must be a single-line value."
  }
}

function Escape-ShellSingleQuoted {
  param([AllowNull()][string]$Value)
  if ($null -eq $Value) {
    return "''"
  }
  return "'" + $Value.Replace("'", "'\''") + "'"
}

function Invoke-Native {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE."
  }
}

if (-not (Test-CommandExists "ssh")) {
  throw "ssh is required. Install OpenSSH Client or run from OpenClaw/Linux."
}
if (-not (Test-CommandExists "scp")) {
  throw "scp is required. Install OpenSSH Client or run from OpenClaw/Linux."
}

$archive = Join-Path $root "persona-chat-release.tar.gz"
$deployScript = Join-Path $root "deploy-vps.sh"

if (-not $SkipQualityGate) {
  & $npm run quality:gate -- --SmokeUrl http://127.0.0.1:8088 --DeployTargetUrl http://127.0.0.1:8088
}

if (-not (Test-Path -LiteralPath $archive)) {
  throw "Missing release archive: $archive"
}
if (-not (Test-Path -LiteralPath $deployScript)) {
  throw "Missing deploy script: $deployScript"
}

$adminToken = Read-SecretValue -Name "ADMIN_TOKEN" -Prompt "Admin token for backend login" -Required
$sessionSecret = [Environment]::GetEnvironmentVariable("SESSION_SECRET")
if (-not $sessionSecret) {
  $sessionSecret = New-HexSecret -Bytes 48
}

$llmApiKey = ""
if ($LlmConnectionMode -eq "custom_api") {
  $llmApiKey = Read-SecretValue -Name "LLM_API_KEY" -Prompt "LLM API key" -Required
}

$values = [ordered]@{
  ADMIN_TOKEN = $adminToken
  SESSION_SECRET = $sessionSecret
  LLM_CONNECTION_MODE = $LlmConnectionMode
  LLM_BASE_URL = $LlmBaseUrl
  LLM_PORT_EXTERNAL_URL = $LlmPortExternalUrl
  LLM_API_KEY = $llmApiKey
  LLM_ENABLED = "true"
  LLM_FAIL_CLOSED = "true"
  LLM_MODEL = $LlmModel
  COMFYUI_BASE_URL = $ComfyUiBaseUrl
  REPLACE_EXISTING_HTTP_SERVICE = ($(if ($ReplaceExistingHttpService) { "true" } else { "false" }))
  SKIP_DEPLOY_SMOKE_CHECKS = ($(if ($SkipRemoteSmoke) { "true" } else { "false" }))
}

if ($Domain) {
  $values["DOMAIN"] = $Domain
  if ($LetsEncryptEmail) {
    $values["LETSENCRYPT_EMAIL"] = $LetsEncryptEmail
  }
}

foreach ($key in $values.Keys) {
  Assert-SingleLine -Name $key -Value $values[$key]
}

$tempEnv = Join-Path ([System.IO.Path]::GetTempPath()) ("persona-chat-deploy-" + [guid]::NewGuid().ToString("N") + ".env")
try {
  $envLines = foreach ($key in $values.Keys) {
    "$key=$(Escape-ShellSingleQuoted $values[$key])"
  }
  [System.IO.File]::WriteAllLines($tempEnv, [string[]]$envLines, [System.Text.UTF8Encoding]::new($false))

  Write-Host "Uploading release archive and deploy script to ${User}@${HostName}:${Port}..."
  Invoke-Native -FilePath "scp" -Arguments @("-P", [string]$Port, $archive, "${User}@${HostName}:/tmp/persona-chat-release.tar.gz")
  Invoke-Native -FilePath "scp" -Arguments @("-P", [string]$Port, $deployScript, "${User}@${HostName}:/tmp/deploy-vps.sh")
  Invoke-Native -FilePath "scp" -Arguments @("-P", [string]$Port, $tempEnv, "${User}@${HostName}:/tmp/persona-chat-deploy.env")

  $remoteCommand = "chmod 600 /tmp/persona-chat-deploy.env && chmod +x /tmp/deploy-vps.sh && set -a && . /tmp/persona-chat-deploy.env && set +a && /tmp/deploy-vps.sh; status=`$?; rm -f /tmp/persona-chat-deploy.env; exit `$status"
  Write-Host "Running remote deploy. Secrets are not printed by this script."
  Invoke-Native -FilePath "ssh" -Arguments @("-p", [string]$Port, "${User}@${HostName}", $remoteCommand)

  if (-not $PublicUrl) {
    $PublicUrl = if ($Domain) { "https://$Domain" } else { "http://$HostName" }
  }

  Write-Host "Running public deploy target validation: $PublicUrl"
  & $npm run deploy:target:check -- --url $PublicUrl

  if (-not $SkipAiChain) {
    Write-Host "Running real AI chain validation: $PublicUrl"
    & $npm run ai:chain -- --url $PublicUrl
  }

  Write-Host "Deploy completed."
  Write-Host "Web: $PublicUrl/"
  Write-Host "APK: $PublicUrl/downloads/persona-chat.apk"
  Write-Host "Admin: $PublicUrl/admin/login"
} finally {
  if (Test-Path -LiteralPath $tempEnv) {
    Remove-Item -LiteralPath $tempEnv -Force
  }
}
