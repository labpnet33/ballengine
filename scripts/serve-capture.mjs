#!/usr/bin/env node
// Read-only local preview server for authorized BallEngine web captures.
// This serves captured public static files; it does not implement backend APIs.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = resolve(repoRoot, "extra/wget/ballengine.app");
const portValue = process.env.PORT || process.argv[2] || "4173";
const port = Number(portValue);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Invalid PORT: " + portValue);
  process.exit(2);
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
  ".webmanifest": "application/manifest+json"
};
function send(res, code, body, type = "text/plain; charset=utf-8", headOnly = false) {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(headOnly ? undefined : body);
}
async function fileOrNull(p) {
  const full = resolve(root, "." + p);
  if (full !== root && !full.startsWith(root + sep)) return null;
  try {
    const info = await stat(full);
    return info.isFile() ? full : null;
  } catch {
    return null;
  }
}
const server = createServer(async (req, res) => {
  const method = req.method || "GET";
  const head = method === "HEAD";
  if (method !== "GET" && !head) {
    res.setHeader("Allow", "GET, HEAD");
    send(res, 405, "Only static GET/HEAD requests are available.", undefined, head);
    return;
  }
  let url;
  try { url = new URL(req.url || "/", "http://localhost"); } catch {
    send(res, 400, "Invalid URL", undefined, head); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch {
    send(res, 400, "Invalid encoded path", undefined, head); return;
  }
  if (pathname.includes("\0") || pathname.includes("\\") || pathname.split("/").includes("..")) {
    send(res, 400, "Invalid path", undefined, head); return;
  }
  // Do not return the SPA HTML as a successful API response; report missing backend.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    send(res, 501, JSON.stringify({
      error: "Backend endpoint not available from public website capture",
      path: pathname,
      required: "Authorized API integration or independently implemented replacement"
    }), "application/json; charset=utf-8", head);
    return;
  }
  const candidates = [];
  if (pathname === "/") candidates.push("/index.html");
  else if (pathname.endsWith("/")) candidates.push(pathname + "index.html");
  else {
    candidates.push(pathname);
    if (!extname(pathname)) {
      candidates.push(pathname + ".html");
      candidates.push(pathname + "/index.html");
    }
  }
  // SPA fallback for public client routes, but not for missing static assets.
  if (!extname(pathname) && !pathname.startsWith("/assets/")) candidates.push("/index.html");
  let target = null;
  for (const p of candidates) {
    target = await fileOrNull(p);
    if (target) break;
  }
  if (!target) { send(res, 404, "Captured asset not found", undefined, head); return; }
  try {
    const data = await readFile(target);
    const type = mime[extname(target).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(head ? undefined : data);
  } catch (err) {
    send(res, 500, "Could not serve captured file: " + err.code, undefined, head);
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log("Captured public website preview: http://127.0.0.1:" + port + "/");
  console.log("Studio path: http://127.0.0.1:" + port + "/studio");
  console.log("Static root: " + root);
  console.log("Note: Original account/backend functionality is unavailable.");
});
