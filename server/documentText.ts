/** Turn an uploaded .txt/.pdf data URL into plain text so text-only models (Ollama) can read it. */
const MAX_CHARS = Number(process.env.UPLOAD_TEXT_MAX_CHARS) || 12000;

export async function dataUrlToText(dataUrl: unknown): Promise<string | null> {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:([\w.+-]+\/[\w.+-]+)?(;[^,]*)?,/.exec(dataUrl);
  if (!m) return null;
  const mime = (m[1] || "").toLowerCase();
  const isB64 = /;base64/i.test(m[2] || "");
  const payload = dataUrl.slice(m[0].length);
  const bytes = isB64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  let text: string | null = null;
  if (mime.startsWith("text/") || mime === "application/json" || mime === "") {
    text = bytes.toString("utf8");
  } else if (mime === "application/pdf") {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } catch {
      return "";
    }
  } else {
    return null; // images/audio: not text
  }
  text = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n[...truncated]` : text;
}
