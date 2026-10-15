# Allow the token proxy (TCP 11435) only from the VPS WireGuard peer (10.7.0.3/32); Ollama 11434 stays blocked.
# Run in an elevated PowerShell.
$ErrorActionPreference = "Stop"
Get-NetFirewallRule -DisplayName "Study Buddy Ollama proxy (WG only)" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "Study Buddy Ollama proxy (WG only)" `
  -Direction Inbound -Protocol TCP -LocalPort 11435 `
  -RemoteAddress 10.7.0.3/32 -Action Allow -Profile Any | Out-Null
if (-not (Get-NetFirewallRule -DisplayName "Block raw Ollama 11434" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "Block raw Ollama 11434" -Direction Inbound -Protocol TCP -LocalPort 11434 -Action Block | Out-Null
}
Get-NetFirewallRule -DisplayName "Study Buddy*","Block raw Ollama*" | Format-Table DisplayName,Enabled,Action
# 11436 (Cloudflare Tunnel site) is loopback-only; no inbound rule needed or wanted.
