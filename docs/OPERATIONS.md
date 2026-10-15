# Study Buddy — limits, security and operations

## Upload limits (measured, Oct 14 2026)
| What | Limit | Where enforced |
|---|---|---|
| Photo picked or taken on the phone | up to **25 MB** original | browser (`readPicked`) |
| Photo actually sent | resized in the browser to **≤ 1600 px** long edge, JPEG q0.85 (typically 150–600 KB) | `src/lib/shrinkImage.ts` |
| Any decoded upload (image, PDF, .txt) | **7 MB** (`MAX_UPLOAD_MB`) | server `uploadGuard` → HTTP 413 |
| JSON request body | 18 MB (`BODY_LIMIT`, base64 overhead ≈ 4/3) | `express.json` |
| Types | PNG, JPEG, WebP, GIF, HEIC/HEIF, PDF, .txt | server allow-list → HTTP 415 |
| Text fields | 8 000 chars | server → HTTP 413 |

HEIC photos are sent unresized on browsers that can't decode HEIC (Chrome), so on those a HEIC must be ≤ 7 MB.

## Long answers vs Cloudflare's 100 s limit
The browser never holds one request open while the model works: `POST /api/jobs` returns `202 {jobId}` at once,
then the page polls `GET /api/jobs/:id` every 0.8–2 s (jobs belong to the signed-in email; 3 open per user; 15 min TTL).
Each reply bubble has its own id and replaces its own "reading & thinking…" placeholder, so a late answer can't
land on another turn. Photos the AI could not answer show an error. The offline helper never invents a problem for a photo.

## Model warm-up
`keep_alive` is sent as a number (seconds, `-1` = forever). The default model is loaded at server start
(`Warm-up (startup)` in server.log) and re-checked every 10 min when idle. The logon task `StudyBuddy-OllamaPreload`
loads gemma3:12b after a reboot. The NUC backup (10.7.0.1) is used only when the PC's Ollama can't be reached; a
slow or timed-out PC answer is not treated as "down".

## Headers
HSTS `max-age=31536000; includeSubDomains`, `X-Robots-Tag: noindex, nofollow, noarchive` and `/robots.txt` disallow-all,
`Cache-Control: no-store` on everything except hashed bundles and cartridge art, CSP without inline handlers
(Cloudflare Web Analytics allowed: `static.cloudflareinsights.com` script, `cloudflareinsights.com` connect).
`TRUST_CF_ACCESS_HEADER` stays **off**: identity comes only from the verified Access JWT (or the local session).

## Sign out securely
`POST /api/auth/logout`: records the sign-out time (sessions and Access JWTs issued earlier are refused from then on,
persisted in `DATA_DIR/logouts.json`), clears `sb_session`, sends `Clear-Site-Data: "cache", "storage"`, then
redirects (303) to the Access **team** logout (`https://<team>/cdn-cgi/access/logout`), which ends the Access session for
every app, so the next visit asks for a new one-time PIN.

## LLM tools
* **toolsontab** (everyone): requests like "merge PDFs" / "compress this photo to 50 KB" get up to 3 buttons linking to
  the free client-side tools on toolsontab.com. Links only; nothing is uploaded by Study Buddy.
* **GEV status** (admin only, decided on the server from the verified identity): questions about GEV, model performance,
  VRAM, tok/s… trigger a read-only `GET` of `GEV_API_URL` (`http://10.7.0.1:4173`) paths in `GEV_API_PATHS`
  (JSON only, 4 s timeout, 64 KB cap). Guests can't trigger it. The God's Eye **button** stays available to the admin and
  redeemed guests.
