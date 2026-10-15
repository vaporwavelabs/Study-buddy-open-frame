# Study Buddy - Ollama setup on the Windows PC (RTX 3090). Run in an elevated PowerShell.
# Ollama listens on loopback only; the Caddy token proxy (or cloudflared) is the only way in.
#   powershell -ExecutionPolicy Bypass -File .\setup-ollama.ps1
param(
  [string]$Model = "gemma3:4b",
  [string]$KeepAlive = "-1",          # -1 = keep the model in VRAM forever; use "30m" to free VRAM when idle
  [string]$ListenHost = "127.0.0.1:11434"  # do NOT use 0.0.0.0. Loopback only; the proxy forwards to it.
)
$ErrorActionPreference = "Stop"

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Ollama via winget..."
  winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}

# Machine-level env vars read by the Ollama service/tray app
$vars = @{
  "OLLAMA_HOST"              = $ListenHost
  "OLLAMA_KEEP_ALIVE"        = $KeepAlive
  "OLLAMA_NUM_PARALLEL"      = "1"
  "OLLAMA_MAX_LOADED_MODELS" = "1"
  "OLLAMA_ORIGINS"           = ""      # no browser origins needed
}
foreach ($k in $vars.Keys) {
  [Environment]::SetEnvironmentVariable($k, $vars[$k], "Machine")
  Set-Item -Path "Env:$k" -Value $vars[$k]
  Write-Host "Set $k=$($vars[$k])"
}

# Restart Ollama so it picks up the env vars
Get-Process -Name "ollama*" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$app = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama app.exe"
if (Test-Path $app) { Start-Process $app } else { Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden }
Start-Sleep -Seconds 5

ollama pull $Model
# Warm it up once (loads into VRAM; with KEEP_ALIVE=-1 it stays loaded)
ollama run $Model "Say ready." | Out-Host

# Block raw Ollama from the network, even if OLLAMA_HOST is ever changed by mistake
if (-not (Get-NetFirewallRule -DisplayName "Block raw Ollama 11434" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "Block raw Ollama 11434" -Direction Inbound -Protocol TCP -LocalPort 11434 -Action Block | Out-Null
}
Write-Host "`nCheck: netstat -ano | findstr 11434   -> must show 127.0.0.1:11434 only"
netstat -ano | findstr ":11434"
