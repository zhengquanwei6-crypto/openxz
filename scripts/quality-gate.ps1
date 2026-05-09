param(
  [string]$SmokeUrl = "",
  [string]$DeployTargetUrl = "",
  [switch]$AiChain
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $root

$nodeDir = Join-Path $root ".tools\node-v22.22.2-win-x64"
if (Test-Path -LiteralPath $nodeDir) {
  $env:Path = "$nodeDir;$env:Path"
}

$jdkDir = Join-Path $root ".tools\jdk-21"
if (Test-Path -LiteralPath $jdkDir) {
  $env:JAVA_HOME = (Resolve-Path -LiteralPath $jdkDir).Path
  $env:Path = "$env:JAVA_HOME\bin;$env:Path"
}

$androidSdkDir = Join-Path $root ".tools\android-sdk"
if (Test-Path -LiteralPath $androidSdkDir) {
  $env:ANDROID_HOME = (Resolve-Path -LiteralPath $androidSdkDir).Path
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  $env:Path = "$env:ANDROID_HOME\platform-tools;$env:Path"
}

$signingProps = Join-Path (Split-Path -Parent $root) "persona-chat-secrets\signing.properties"
if (Test-Path -LiteralPath $signingProps) {
  $props = @{}
  Get-Content -LiteralPath $signingProps | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $props[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
  if ($props.storeFile) {
    $storeFile = $props.storeFile
    if (-not [IO.Path]::IsPathRooted($storeFile)) {
      $storeFile = (Resolve-Path -LiteralPath (Join-Path (Split-Path -Parent $signingProps) $storeFile)).Path
    }
    $env:PERSONA_CHAT_STORE_FILE = $storeFile
  }
  if ($props.storePassword) { $env:PERSONA_CHAT_STORE_PASSWORD = $props.storePassword }
  if ($props.keyAlias) { $env:PERSONA_CHAT_KEY_ALIAS = $props.keyAlias }
  if ($props.keyPassword) { $env:PERSONA_CHAT_KEY_PASSWORD = $props.keyPassword }
}

$npm = Join-Path $nodeDir "npm.cmd"
if (-not (Test-Path -LiteralPath $npm)) {
  $npm = "npm.cmd"
}

Write-Host "Persona Chat quality gate"
Write-Host "Root: $root"

& $npm run lint
& $npm run build:android
& $npm run cap:sync

Push-Location -LiteralPath (Join-Path $root "android")
try {
  & .\gradlew.bat assembleRelease
} finally {
  Pop-Location
}

$signedApk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path -LiteralPath $signedApk)) {
  throw "Signed release APK was not produced. Configure release signing before running the quality gate."
}
Copy-Item -LiteralPath $signedApk -Destination (Join-Path $root "downloads\persona-chat.apk") -Force

$archive = Join-Path $root "persona-chat-release.tar.gz"
if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}

tar --exclude="server/data" `
  --exclude="server/*.log" `
  --exclude="*.jks" `
  --exclude="*.keystore" `
  --exclude="signing.properties" `
  --exclude=".env.local" `
  --exclude=".env.android" `
  --exclude="downloads/persona-chat-debug.apk" `
  --exclude="node_modules" `
  --exclude=".tools" `
  --exclude="persona-chat-*.tar.gz" `
  --exclude="persona-chat-*.zip" `
  -czf persona-chat-release.tar.gz `
  dist server downloads package.json package-lock.json README.md .env.example .env.production deploy-vps.sh deploy-vps-commands.md docs scripts

& $npm run release:check

if ($DeployTargetUrl) {
  & $npm run deploy:target:check -- --url $DeployTargetUrl
}

if ($SmokeUrl) {
  & $npm run smoke -- --url $SmokeUrl
  if ($AiChain) {
    & $npm run ai:chain -- --url $SmokeUrl
  }
} elseif ($AiChain) {
  & $npm run ai:chain
}
