import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAccountsService } from "./server/accounts.js";

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const port = Number(process.env.PORT) || 8000;
const host = process.env.HOST || "127.0.0.1";
const cacheTtl = 5 * 60 * 1000;
const responseCache = new Map();
const pendingRequests = new Map();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const publicPages = new Set([
  "README.md",
  "account.html",
  "compare.html",
  "forecast.html",
  "health.html",
  "index.html",
  "login.html",
  "lungs.html",
  "planner.html",
  "register.html",
]);
const publicAssetDirectories = new Set(["css", "js", "shared"]);

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function parseCoordinates(url) {
  const latitudeValues = url.searchParams.get("latitude") || "";
  const longitudeValues = url.searchParams.get("longitude") || "";
  if (!latitudeValues.trim() || !longitudeValues.trim()) return null;
  const latitudeParts = latitudeValues.split(",");
  const longitudeParts = longitudeValues.split(",");
  if (latitudeParts.some((value) => !value.trim()) || longitudeParts.some((value) => !value.trim())) return null;
  const latitudes = latitudeParts.map(Number);
  const longitudes = longitudeParts.map(Number);
  if (!latitudes.length || latitudes.length > 9 || latitudes.length !== longitudes.length) return null;
  if (latitudes.some((value) => !Number.isFinite(value) || value < -90 || value > 90)) return null;
  if (longitudes.some((value) => !Number.isFinite(value) || value < -180 || value > 180)) return null;
  return { latitudes, longitudes };
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return response.json();
}

function asLocationList(payload) {
  if (payload === null) return null;
  return Array.isArray(payload) ? payload : [payload];
}

async function loadProviderData(key, coordinates, forceRefresh) {
  const cached = responseCache.get(key);
  if (!forceRefresh && cached && Date.now() - cached.cachedAt < cacheTtl) {
    return { ...cached.data, cacheAgeSeconds: Math.floor((Date.now() - cached.cachedAt) / 1000) };
  }
  if (pendingRequests.has(key)) return pendingRequests.get(key);

  const request = (async () => {
    const sharedParams = {
      latitude: coordinates.latitudes.join(","),
      longitude: coordinates.longitudes.join(","),
      timezone: "Asia/Kolkata",
    };
    const airParams = new URLSearchParams({
      ...sharedParams,
      current: "us_aqi,pm2_5",
      hourly: "us_aqi",
      forecast_hours: "48",
    });
    const weatherParams = new URLSearchParams({
      ...sharedParams,
      current: "temperature_2m,relative_humidity_2m,wind_speed_10m",
      wind_speed_unit: "ms",
    });
    const [airResult, weatherResult] = await Promise.allSettled([
      fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`),
      fetchJson(`https://api.open-meteo.com/v1/forecast?${weatherParams}`),
    ]);
    if (airResult.status === "rejected" && weatherResult.status === "rejected") {
      throw new Error("Both Open-Meteo data feeds are unavailable");
    }

    const data = {
      air: airResult.status === "fulfilled" ? asLocationList(airResult.value) : null,
      weather: weatherResult.status === "fulfilled" ? asLocationList(weatherResult.value) : null,
      errors: {
        air: airResult.status === "rejected" ? airResult.reason.message : null,
        weather: weatherResult.status === "rejected" ? weatherResult.reason.message : null,
      },
      fetchedAt: new Date().toISOString(),
      cacheAgeSeconds: 0,
    };
    responseCache.set(key, { data, cachedAt: Date.now() });
    return data;
  })();

  pendingRequests.set(key, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(key);
  }
}

async function handleApiRequest(url, response) {
  const coordinates = parseCoordinates(url);
  if (!coordinates) {
    sendJson(response, 400, { error: "Provide matching latitude/longitude lists for up to nine locations." });
    return;
  }
  const key = coordinates.latitudes.map((latitude, index) => `${latitude.toFixed(4)},${coordinates.longitudes[index].toFixed(4)}`).join("|");
  try {
    const data = await loadProviderData(key, coordinates, url.searchParams.get("refresh") === "1");
    sendJson(response, 200, data);
  } catch (error) {
    sendJson(response, 502, { error: "Air-quality providers are unavailable.", detail: error.message });
  }
}

async function handleStaticRequest(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const filePath = path.resolve(root, `.${pathname}`);
  const relativePath = path.relative(root, filePath).replaceAll(path.sep, "/");
  const firstSegment = relativePath.split("/")[0];
  const isPublicFile = publicPages.has(relativePath) || publicAssetDirectories.has(firstSegment);
  if (!filePath.startsWith(`${root}${path.sep}`) || path.basename(filePath).startsWith(".") || !isPublicFile) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    const content = await readFile(filePath);
    response.writeHead(200, {
          "Cache-Control": "no-cache",
      "Content-Length": content.length,
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

const accounts = await createAccountsService({ root, loadProviderData });
const accountRouteMethods = new Map([
  ["/api/register", ["POST"]],
  ["/api/login", ["POST"]],
  ["/api/logout", ["POST"]],
  ["/api/me", ["GET", "PATCH", "DELETE"]],
  ["/api/verify", ["GET"]],
  ["/api/unsubscribe", ["GET", "POST"]],
]);

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/api/air-quality") {
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" }).end("Method not allowed");
      return;
    }
    void handleApiRequest(url, response);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    if (accounts.handleRoute(request, response, url)) return;
    const allowedMethods = accountRouteMethods.get(url.pathname);
    if (allowedMethods) {
      response.writeHead(405, { Allow: allowedMethods.join(", ") }).end("Method not allowed");
      return;
    }
    sendJson(response, 404, { error: "API route not found." });
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  void handleStaticRequest(request, response, url);
});

server.listen(port, host, () => {
  console.log(`Air / India backend listening on http://${host}:${port}`);
});
