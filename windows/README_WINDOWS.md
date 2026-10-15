# Windows PC: Ollama (RTX 3090) for Study Buddy

The VPS calls Ollama on this PC for text chat/solve. Ollama listens on **127.0.0.1:11434 only**. The VPS reaches
it through a token-checking proxy over WireGuard (**A**) or through a Cloudflare Tunnel with Access (**B**).
No home router ports are opened for either option.

## 1. Ollama (both options)
Elevated PowerShell in this folder:
```powershell
powershell -ExecutionPolicy Bypass -File .\setup-ollama.ps1             # KeepAlive -1 (always loaded)
# or: .\setup-ollama.ps1 -KeepAlive 30m                                 # unload after 30 idle minutes
```
It sets `OLLAMA_HOST=127.0.0.1:11434`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`,
restarts Ollama, pulls and warms `gemma3:4b`, and adds a firewall rule that blocks inbound 11434.
Check with `netstat -ano | findstr 11434`: it must show `127.0.0.1:11434` only.

## 2A. WireGuard + Caddy token proxy (PC is 10.7.0.2, NUC hub 10.7.0.1)
1. Install Caddy: `winget install CaddyServer.Caddy` (or download caddy.exe to `C:\caddy`).
2. Create a long token and keep it secret. It goes into the VPS `.env` as `OLLAMA_TOKEN`:
   ```powershell
   $chars = [char[]](48..57 + 65..90 + 97..122); $t = -join (1..48 | % { $chars | Get-Random })
   [Environment]::SetEnvironmentVariable("OLLAMA_PROXY_TOKEN", $t, "Machine"); $t
   ```
3. Copy `Caddyfile` to `C:\caddy\` and run `caddy run --config C:\caddy\Caddyfile` once to test. To run it as a
   service: `sc.exe create caddy start= auto binPath= "C:\caddy\caddy.exe run --config C:\caddy\Caddyfile"`
   (or use NSSM). The service needs `OLLAMA_PROXY_TOKEN` as a machine env var.
   Caddy serves two sites with the same token check and `/api/chat` + `/api/tags` allowlist: `10.7.0.2:11435`
   (WireGuard) and `127.0.0.1:11436` (loopback, for cloudflared). Without the token it returns 401. Set
   `OLLAMA_PROXY_TOKEN` first: if it's empty, Caddy starts but only checks for an empty "Bearer " header.
   The WireGuard tunnel must be up before Caddy starts (set the service to delayed start).
4. Firewall: `powershell -ExecutionPolicy Bypass -File .\firewall.ps1` allows TCP 11435 only from the VPS peer 10.7.0.3/32.
5. On the NUC, add the VPS as a peer (`AllowedIPs = 10.7.0.3/32`), and make sure the NUC forwards between peers
   (`net.ipv4.ip_forward=1`; allow wg0->wg0 forwarding in its firewall). Add `10.7.0.3/32` to the NUC's
   AllowedIPs in the PC's WireGuard config if the PC only routes the NUC today (10.7.0.0/24 covers it).
   This only works without new ports if the NUC's WireGuard UDP port is already reachable. If it isn't, use option B.
6. Test from the VPS: `curl -H "Authorization: Bearer <token>" http://10.7.0.2:11435/api/tags`

## 2B. Cloudflare Tunnel + Access service token (no ports anywhere)
1. `winget install Cloudflare.cloudflared`, then run `cloudflared tunnel login` and
   `cloudflared tunnel create study-ollama`.
2. Edit `cloudflared-config.yml` (UUID, hostname such as `ollama.toolsontab.com`) and copy it to
   `%USERPROFILE%\.cloudflared\config.yml`, then run `cloudflared tunnel route dns study-ollama ollama.toolsontab.com`.
3. Zero Trust dashboard -> Access -> Applications -> add a self-hosted app for `ollama.toolsontab.com` with the policy
   **Service Auth** -> a new **Service Token**. Put its Client ID/Secret in the VPS `.env`
   (`OLLAMA_CF_ACCESS_CLIENT_ID` / `OLLAMA_CF_ACCESS_CLIENT_SECRET`). Requests without it are blocked at Cloudflare.
4. Run Caddy (step 2A.1–3; the WireGuard site can stay unused). The tunnel points at the loopback Caddy site
   `127.0.0.1:11436`, never raw 11434. Then run `cloudflared service install` (starts at boot).
   VPS `.env`: `OLLAMA_URL="https://ollama.toolsontab.com"`, `OLLAMA_TOKEN=<OLLAMA_PROXY_TOKEN>` and the two Access
   values. That gives two layers: Cloudflare Access at the edge, and the Bearer token at Caddy.

| | WireGuard (A) | Cloudflare Tunnel (B) |
|---|---|---|
| Ports | none new *if* the NUC WG port already exists | none |
| Auth | WG keys + Bearer token (Caddy) | Access service token + Bearer token (Caddy 127.0.0.1:11436) |
| Latency | lowest (direct) | +20–60 ms via Cloudflare edge |
| Moving parts | NUC routing, Caddy service | cloudflared service, Cloudflare account |

## Keeping gemma3:4b warm
- `OLLAMA_KEEP_ALIVE=-1` (setup default) keeps it in VRAM permanently (~3–4 GB of the 3090's 24 GB). The VPS also
  sends `keep_alive` (default `30m`) per request. Set `OLLAMA_KEEP_ALIVE="-1"` in the VPS `.env` to match.
- After a reboot, the first request loads the model (a few seconds). Warm it at logon with a Task Scheduler task:
  `ollama run gemma3:4b "ready"`.
- Disable sleep or hibernate on this PC (`powercfg /change standby-timeout-ac 0`). When the PC is asleep, the VPS
  marks it down and uses the fallback.

## Sharing the GPU with other workloads ("ORC")
- `gemma3:4b` with `num_ctx 4096` uses about 3–4 GB of VRAM. With `NUM_PARALLEL=1` and `MAX_LOADED_MODELS=1`, Ollama
  never loads a second model or batch, so ORC keeps the rest of the 24 GB.
- If ORC needs the whole GPU, use `-KeepAlive 30m` (Ollama unloads when idle) or stop Ollama while ORC runs. Study
  Buddy detects the PC as down within one health interval (or on the first failed request) and falls back
  automatically.
- Heavy ORC jobs can make replies slower than `OLLAMA_TIMEOUT_MS` (45 s); those requests fall back too.
- Check usage with `nvidia-smi` and `ollama ps`.
