import { resolve, join } from "path";
import { existsSync } from "fs";

const ROOT = resolve(import.meta.dir, "..");
const PYTHON = resolve(ROOT, "venv", "bin", "python3");
const EXTRACT_PY = resolve(ROOT, "server", "extract.py");
const SAMPLES_DIR = resolve(ROOT, "samples");
const CACHE_FILE = resolve(ROOT, ".sample-map-cache.json");
const CLIENT_DIST = resolve(ROOT, "client", "dist");

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

Bun.serve({
  port: 3720,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);

    // --- API routes ---

    // Serve sample data
    if (url.pathname === "/api/samples" && req.method === "GET") {
      try {
        let samples = (await loadOrExtract()) as Array<Record<string, unknown>>;

        // Filter by max duration (default 2s for one-shots)
        const maxDuration = parseFloat(
          url.searchParams.get("maxDuration") ?? "1.5",
        );
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
            const name = ((s.name as string) || "").toLowerCase();
            return !name.includes("loop");
          });
        }

        return Response.json(samples);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    }

    // Force re-extraction (bust cache)
    if (url.pathname === "/api/samples/refresh" && req.method === "GET") {
      cachedSamples = null;
      try {
        if (existsSync(CACHE_FILE)) await Bun.write(CACHE_FILE, "");
      } catch {
        /* ignore */
      }
      try {
        const samples = await loadOrExtract();
        return Response.json(samples);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    }

    // Serve audio files: /api/audio/path/to/sample.wav
    if (url.pathname.startsWith("/api/audio/") && req.method === "GET") {
      const relPath = decodeURIComponent(
        url.pathname.slice("/api/audio/".length),
      );
      const filePath = join(SAMPLES_DIR, relPath);

      // Prevent directory traversal
      if (!filePath.startsWith(SAMPLES_DIR)) {
        return new Response("Forbidden", { status: 403 });
      }

      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response("Not Found", { status: 404 });
      }

      const ext = relPath.split(".").pop()?.toLowerCase();
      const contentType = ext === "mp3" ? "audio/mpeg" : "audio/wav";

      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(file.size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    // --- Static file serving (client build) ---

    // Try to serve static files from client/dist
    let filePath = join(
      CLIENT_DIST,
      url.pathname === "/" ? "index.html" : url.pathname,
    );
    let file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback: serve index.html for non-file routes
    filePath = join(CLIENT_DIST, "index.html");
    file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log("Sample Map listening on http://localhost:3720");
