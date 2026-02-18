import { resolve, join } from "path";
import { existsSync } from "fs";

const ROOT = resolve(import.meta.dir, "..");
const PYTHON = resolve(ROOT, "venv", "bin", "python3");
const EXTRACT_PY = resolve(ROOT, "server", "extract.py");
const SAMPLES_DIR = resolve(ROOT, "samples");
const CACHE_FILE = resolve(ROOT, ".sample-map-cache.json");

let cachedSamples: unknown[] | null = null;

async function loadOrExtract(): Promise<unknown[]> {
  if (cachedSamples) return cachedSamples;

  // Try loading from disk cache
  if (existsSync(CACHE_FILE)) {
    try {
      const text = await Bun.file(CACHE_FILE).text();
      cachedSamples = JSON.parse(text);
      console.log(`Loaded ${cachedSamples!.length} samples from cache`);
      return cachedSamples!;
    } catch {
      console.log("Cache file corrupt, re-extracting...");
    }
  }

  // Run Python extraction
  console.log("Running Python feature extraction + t-SNE...");
  const proc = Bun.spawn([PYTHON, EXTRACT_PY, SAMPLES_DIR], {
    stdout: "pipe",
    stderr: "inherit",
  });

  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;

  if (code !== 0) {
    throw new Error(`Python exited with code ${code}`);
  }

  cachedSamples = JSON.parse(stdout);
  console.log(`Extracted ${cachedSamples!.length} samples`);

  // Write disk cache
  await Bun.write(CACHE_FILE, JSON.stringify(cachedSamples, null, 2));
  console.log(`Cache written to ${CACHE_FILE}`);

  return cachedSamples!;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "http://localhost:3721",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
};

Bun.serve({
  port: 3720,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Serve sample data
    if (url.pathname === "/api/samples" && req.method === "GET") {
      try {
        let samples = await loadOrExtract() as Array<Record<string, unknown>>;

        // Filter by max duration (default 2s for one-shots)
        const maxDuration = parseFloat(url.searchParams.get("maxDuration") ?? "2");
        if (maxDuration > 0 && isFinite(maxDuration)) {
          samples = samples.filter((s) => {
            const dur = s.duration as number | undefined;
            return dur !== undefined && dur <= maxDuration;
          });
        }

        // Filter out loops by name
        const excludeLoops = url.searchParams.get("excludeLoops") !== "false";
        if (excludeLoops) {
          samples = samples.filter((s) => {
            const name = (s.name as string || "").toLowerCase();
            return !name.includes("loop");
          });
        }

        return Response.json(samples, { headers: CORS_HEADERS });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS });
      }
    }

    // Force re-extraction (bust cache)
    if (url.pathname === "/api/samples/refresh" && req.method === "GET") {
      cachedSamples = null;
      try {
        if (existsSync(CACHE_FILE)) await Bun.write(CACHE_FILE, "");
      } catch { /* ignore */ }
      try {
        const samples = await loadOrExtract();
        return Response.json(samples, { headers: CORS_HEADERS });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS });
      }
    }

    // Serve audio files: /audio/path/to/sample.wav
    if (url.pathname.startsWith("/audio/") && req.method === "GET") {
      const relPath = decodeURIComponent(url.pathname.slice("/audio/".length));
      const filePath = join(SAMPLES_DIR, relPath);

      // Prevent directory traversal
      if (!filePath.startsWith(SAMPLES_DIR)) {
        return new Response("Forbidden", { status: 403, headers: CORS_HEADERS });
      }

      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
      }

      const ext = relPath.split(".").pop()?.toLowerCase();
      const contentType = ext === "mp3" ? "audio/mpeg" : "audio/wav";

      return new Response(file, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": contentType,
          "Content-Length": String(file.size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    if (url.pathname === "/" && req.method === "GET") {
      return Response.json({ status: "ok", cached: cachedSamples !== null }, { headers: CORS_HEADERS });
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
});

console.log("Sample Map server listening on http://localhost:3720");
