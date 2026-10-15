# Study Buddy on this PC: RTX 3090 Ollama primary, NUC backup over WireGuard. Local LLMs only (no Gemini/cloud AI).
# Usage: .\start.ps1 [-Model gemma3:12b] [-Vision gemma3:12b] [-Think false] [-Port 3100]
# Secrets (ADMIN_TOKEN, CF_* ...) live outside the repo in $env:USERPROFILE\.studybuddy\secrets.ps1 (dot-sourced if present).
param([string]$Model = "gemma3:12b", [string]$Vision = "gemma3:12b", [string]$Think = "false", [int]$Port = 3100)
$env:NODE_DEBUG = ""; $env:NODE_ENV = "production"; $env:LLM_PROVIDER = "ollama"
# Ollama here listens on the address in the user's OLLAMA_HOST (fall back to localhost).
$h = [Environment]::GetEnvironmentVariable("OLLAMA_HOST", "User"); if (-not $h) { $h = "127.0.0.1:11434" }
$env:OLLAMA_URL = "http://$h"; $env:OLLAMA_MODEL = $Model; $env:OLLAMA_VISION_MODEL = $Vision; $env:OLLAMA_THINK = $Think
$env:OLLAMA_TIMEOUT_MS = "240000"; $env:OLLAMA_KEEP_ALIVE = "-1"; $env:OLLAMA_NUM_CTX = "8192"; $env:OLLAMA_EMPTY_RETRY = "1"
# Backup: NUC Ollama (WireGuard only).
$env:OLLAMA_FALLBACK_URL = "http://10.7.0.1:11434"; $env:OLLAMA_FALLBACK_MODEL = "qwen2.5:1.5b"
# Bind to loopback only; cloudflared (when installed) connects locally.
$env:HOST = "127.0.0.1"; $env:PORT = "$Port"; $env:TRUST_PROXY = "loopback"
$env:ADMIN_EMAIL = "hashflow67@gmail.com"; $env:GEV_URL = "https://gev.vicenvalor.com"
# Local sign-in fallback (loopback only, refused through Cloudflare). Off by default; set $env:DEV_LOGIN="true" in secrets.ps1 to turn on (admin still needs ADMIN_TOKEN).
if (-not $env:DEV_LOGIN) { $env:DEV_LOGIN = "false" }
$env:DATA_DIR = "$env:USERPROFILE\.studybuddy\data"
$env:LLM_PROVIDER_STATE_FILE = "$PSScriptRoot\.llm-provider-$Port.json"
$secrets = Join-Path $env:USERPROFILE ".studybuddy\secrets.ps1"; if (Test-Path $secrets) { . $secrets }
Set-Location $PSScriptRoot
npx tsx server.ts
