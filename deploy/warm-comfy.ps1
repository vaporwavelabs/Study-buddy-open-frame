# Kawaii Me: warm SDXL into VRAM/RAM once ComfyUI is up (tiny dummy render), so the first real render isn't a cold load from D:.
$root = "D:\KawaiiMe"; $base = "http://127.0.0.1:8188"; $log = "$root\warm.log"
function L($m) { "$((Get-Date).ToString('s')) $m" | Add-Content $log }
$t0 = Get-Date
for ($i = 0; $i -lt 180; $i++) { try { Invoke-RestMethod "$base/system_stats" -TimeoutSec 3 | Out-Null; break } catch { Start-Sleep 2 } }
$lora = if ($env:KAWAII_LORA) { $env:KAWAII_LORA } else { "chibistylexl-v1-2.safetensors" }
$wf = @{
  "1" = @{ class_type = "CheckpointLoaderSimple"; inputs = @{ ckpt_name = "sd_xl_base_1.0.safetensors" } }
  "2" = @{ class_type = "LoraLoader"; inputs = @{ model = @("1",0); clip = @("1",1); lora_name = $lora; strength_model = 1.0; strength_clip = 1.0 } }
  "3" = @{ class_type = "CLIPTextEncode"; inputs = @{ clip = @("2",1); text = "chibi figurine" } }
  "4" = @{ class_type = "CLIPTextEncode"; inputs = @{ clip = @("2",1); text = "" } }
  "5" = @{ class_type = "EmptyLatentImage"; inputs = @{ width = 512; height = 512; batch_size = 1 } }
  "6" = @{ class_type = "KSampler"; inputs = @{ model = @("2",0); positive = @("3",0); negative = @("4",0); latent_image = @("5",0); seed = 1; steps = 2; cfg = 5.0; sampler_name = "euler"; scheduler = "normal"; denoise = 1.0 } }
  "7" = @{ class_type = "VAEDecode"; inputs = @{ samples = @("6",0); vae = @("1",2) } }
  "8" = @{ class_type = "PreviewImage"; inputs = @{ images = @("7",0) } }
}
try {
  $q = Invoke-RestMethod "$base/prompt" -Method Post -ContentType "application/json" -Body (@{ prompt = $wf } | ConvertTo-Json -Depth 8) -TimeoutSec 20
  for ($i = 0; $i -lt 300; $i++) { Start-Sleep 3; $h = Invoke-RestMethod "$base/history/$($q.prompt_id)" -TimeoutSec 10; if ($h.$($q.prompt_id)) { break } }
  L "warm-up done in $([int]((Get-Date)-$t0).TotalSeconds)s"
} catch { L "warm-up failed: $($_.Exception.Message)" }
Get-ChildItem "$root\temp" -File -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
