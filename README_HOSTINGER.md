# Study Buddy on the Hostinger VPS (app only; the LLM runs on your PC)

```
Student browser -> nginx (443, study.toolsontab.com) -> Node app 127.0.0.1:3100 (VPS)
   text chat/solve -> Ollama gemma3:4b on the Windows PC (RTX 3090) via WireGuard or Cloudflare Tunnel
                      (token-auth proxy; raw Ollama never exposed)
   PC unreachable  -> backup Ollama on the NUC (OLLAMA_FALLBACK_URL, e.g. qwen2.5:1.5b over WireGuard, text only)
                   -> offline rules engine in the browser. No cloud AI: every model is a local Ollama.
```

> **Shared box:** this VPS also runs toolsontab.com (pm2 app `utilhub`). The firewall only allows 22/80/443.
> Do **not** open new ports and do **not** install Ollama here. Study Buddy binds to `127.0.0.1` and is served by
> the existing nginx on a subdomain.

## 0. Check headroom first
```bash
nproc; free -h; df -h /; uptime
pm2 list; pm2 monit           # how much CPU/RAM utilhub uses
sudo ss -ltnp                 # pick a free local PORT for Study Buddy (e.g. 3100)
```
The app itself is light (~100–200 MB RAM). The heavy work happens on the PC.

## 1. Reach the PC (choose one; see windows/README_WINDOWS.md)
**A. WireGuard.** Only if the NUC's WireGuard UDP port is *already* reachable (no new home port). Add the VPS as a
peer of the NUC (VPS address e.g. `10.7.0.3/32`). WireGuard on the VPS dials **out** to the NUC, so no inbound
VPS port is needed:
```ini
# /etc/wireguard/wg0.conf on the VPS
[Interface]
Address = 10.7.0.3/32
PrivateKey = <vps-private-key>
[Peer]                      # the NUC
PublicKey = <nuc-public-key>
Endpoint = <nuc-public-host>:<existing-wg-port>
AllowedIPs = 10.7.0.0/24    # route only the WG subnet (do NOT use 0.0.0.0/0: it would hijack utilhub's traffic)
PersistentKeepalive = 25
```
```bash
sudo apt install wireguard && sudo systemctl enable --now wg-quick@wg0
curl -s -H "Authorization: Bearer $OLLAMA_TOKEN" http://10.7.0.2:11435/api/tags   # expect the model list
```
`OLLAMA_URL="http://10.7.0.2:11435"`

**B. Cloudflare Tunnel.** No ports anywhere. Point `OLLAMA_URL` at the Access-protected hostname (e.g.
`https://ollama.toolsontab.com`) and set `OLLAMA_CF_ACCESS_CLIENT_ID` / `OLLAMA_CF_ACCESS_CLIENT_SECRET`.

## 2. Node app (as a non-root user)
```bash
sudo adduser --disabled-password --gecos "" studybuddy
sudo mkdir -p /opt/study-buddy && sudo chown studybuddy:studybuddy /opt/study-buddy
sudo -iu studybuddy           # run everything below as this user
cd /opt/study-buddy            # upload/unzip the project here
cp .env.example .env && chmod 600 .env
```
Edit `.env` (see `.env.example` for all options):
```
LLM_PROVIDER="ollama"
OLLAMA_URL="http://10.7.0.2:11435"      # or the tunnel hostname
OLLAMA_TOKEN="<same as OLLAMA_PROXY_TOKEN on the PC>"
FALLBACK_PROVIDER="none"                # local LLMs only; keep "none"
OLLAMA_FALLBACK_URL="http://10.7.0.1:11434"   # optional backup Ollama (NUC) over WireGuard
OLLAMA_FALLBACK_MODEL="qwen2.5:1.5b"
ADMIN_TOKEN="<openssl rand -hex 32>"
ENABLE_GROK_HARNESS="false"             # MUST stay false in production
HOST="127.0.0.1"
PORT="3100"
```
```bash
npm install && npm run build
NODE_ENV=production npm start           # smoke test: curl -s 127.0.0.1:3100/api/health
```
pm2 (separate from utilhub; single instance, not cluster mode, because the queue and rate limiter are in-memory):
```bash
sudo npm i -g pm2                       # once, as an admin user
NODE_ENV=production pm2 start "npm start" --name study-buddy && pm2 save
pm2 startup                             # run the printed sudo command once (service for user studybuddy)
```

## 3. nginx (existing install; new server block only)
Point a DNS A record for `study.toolsontab.com` at the VPS. Don't touch utilhub's block.
`/etc/nginx/sites-available/study-buddy`:
```nginx
server {
    listen 80;
    server_name study.toolsontab.com;
    client_max_body_size 20m;            # app BODY_LIMIT is 18mb
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/study-buddy /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d study.toolsontab.com
```
A path like `toolsontab.com/study/` would need the Vite `base` changed, so a subdomain is simpler.

## Behavior
- `/api/health` shows `ollama.up` (cached; pinged every `OLLAMA_HEALTH_INTERVAL_MS` with a `OLLAMA_HEALTH_TIMEOUT_MS`
  timeout) and the fallback in use. It never shows URLs.
- PC up: chat/solve -> Ollama. PC down: skipped instantly -> FALLBACK_PROVIDER -> offline engine. A failed request
  marks the PC down right away; the next health ping brings it back.
- Photos go to a local vision model on the PC (`OLLAMA_VISION_MODEL`, e.g. `gemma3:12b`; install with
  `ollama pull gemma3:12b`). If no vision model is installed, the app says so and asks for typed text.
  The NUC backup is text only. Transcribe/TTS answer "not available" and the device's own voice is used.
- Only one Ollama request runs at a time (max `OLLAMA_MAX_QUEUE` waiting; extras -> 503 + offline engine).
- `/api/grok-bot/*` returns 404 unless `ENABLE_GROK_HARNESS=true` (then needs `x-admin-token`). Provider changes need
  `x-admin-token`; URLs and keys come only from `.env`.

## Local Ollama testing (verified 2026-10-14)

```sh
ollama serve &                      # CPU is fine for 1-2B models
ollama pull qwen2.5:1.5b            # recommended small model (best answers + format)
ollama pull gemma3:1b               # faster, but weaker at math/word problems
npm install && npm run build
NODE_ENV=production LLM_PROVIDER=ollama OLLAMA_URL=http://127.0.0.1:11434 OLLAMA_MODEL=qwen2.5:1.5b \
  OLLAMA_TIMEOUT_MS=120000 PORT=3100 npx tsx server.ts
npm test                            # unit tests (answer checker)
PORT=3100 npm run test:e2e          # real end-to-end tests against the running server + Ollama
```

Solver notes: the solver uses Ollama structured outputs (a JSON schema) so small models always return steps
and a finalAnswer. Linear/quadratic equations and plain arithmetic/percent problems are checked
deterministically (`server/mathCheck.ts`); a wrong answer is retried once, and if it's still wrong the
verified answer is used (`answerCorrected: true`). Word problems can't be checked, so use the bigger model you can.
Uploads: .txt and .pdf files are converted to text on the server (`server/documentText.ts`), so the
reading analysis works with text-only models. Photos need a local vision model (`OLLAMA_VISION_MODEL`, e.g.
`gemma3:12b` on the RTX 3090); voice input/output stays on the device.
Tuning env: OLLAMA_SOLVE_NUM_PREDICT (1536), OLLAMA_CHAT_NUM_PREDICT (768), OLLAMA_DOC_NUM_PREDICT (1280), UPLOAD_TEXT_MAX_CHARS (12000).

Browser UI tests (optional, needs Playwright: `npm i --no-save playwright`):
`CHROME_PATH=/usr/bin/google-chrome node tests/ui.mjs http://127.0.0.1:3100` (title/labels, 390px header, intro overlay)
`CHROME_PATH=/usr/bin/google-chrome node tests/ui-upload.mjs http://127.0.0.1:3100` (chat, then upload a .txt in the real UI)

## Backup Ollama, vision, monitoring (2026-10-14)
- `OLLAMA_FALLBACK_URL` / `OLLAMA_FALLBACK_MODEL` (default qwen2.5:1.5b) / `OLLAMA_FALLBACK_TOKEN` / `OLLAMA_FALLBACK_TIMEOUT_MS`:
  when the primary Ollama (the PC's 3090) is unreachable or times out, text requests go to the backup (e.g. the NUC at
  http://10.7.0.1:11434) before the offline helper. Photos are never sent to the text-only backup.
  Test: `node tests/e2e-fallback.mjs <url>` with OLLAMA_URL pointing at a dead/hanging server and the backup up.
- `OLLAMA_VISION_MODEL` (e.g. gemma3:12b, gemma3:4b, llama3.2-vision): photo chat and photo solve go to this Ollama model.
  E2E: `E2E_VISION=1 node tests/e2e.mjs <url>`.
- `OLLAMA_THINK=false`: turns off hidden reasoning on qwen3/gemma4-style models (much faster replies).
- `OLLAMA_KEEP_ALIVE` accepts "30m" or a number of seconds ("-1" = forever; numbers are now sent as numbers, which Ollama requires).
- `/api/health` for monitoring: `activeEngine` (who answers next: primary, backup or offline), `lastAnswer`
  {engine, latencyMs, at, ok}, `answerStats` {total, primary, backup, cloud, offline}, `ollama`, `ollamaFallback`, `bind` {host, port}.
  The UI header polls it every 30 s, so failover to "backup: <model>" shows up there.
- Benchmark: `node tests/bench.mjs <appUrl> <ollamaUrl> <model>` (BENCH_VISION=1 for vision models).
