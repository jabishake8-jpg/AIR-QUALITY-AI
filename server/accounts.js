import { DatabaseSync } from "node:sqlite";
import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import cron from "node-cron";
import nodemailer from "nodemailer";
import airGuidance from "../shared/air-guidance.cjs";

const scryptAsync = promisify(scrypt);
const sessionCookieName = "air-india-session";
const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
const bodyLimitBytes = 16 * 1024;
const rateWindowMs = 15 * 60 * 1000;
const rateLimitMax = 8;
const locationsByCity = new Map(airGuidance.locations.map((location) => [location.city, location]));
const validProfiles = new Set(airGuidance.profiles.map((profile) => profile.id));
const validCities = new Set(airGuidance.locations.map((location) => location.city));
const categoriesByName = new Map(airGuidance.categories.map((category) => [category.name, category]));

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "Send this request as JSON.");
  }
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > bodyLimitBytes) throw new ApiError(413, "Request body is too large.");
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > bodyLimitBytes) throw new ApiError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Expected an object");
    return parsed;
  } catch {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const [saltHex, keyHex, extra] = String(storedHash || "").split(":");
  if (!saltHex || !keyHex || extra) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scryptAsync(password, salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(expected, actual);
}

function normalizeEmail(value) {
  if (typeof value !== "string") throw new ApiError(400, "Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Enter a valid email address.");
  }
  return email;
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new ApiError(400, "Password must be between 8 and 128 characters.");
  }
  return value;
}

function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

function cookieValue(request) {
  return parseCookies(request.headers.cookie).get(sessionCookieName) || "";
}

function setSessionCookie(response, token, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`);
}

function safeUser(user) {
  return {
    id: user.id,
    email: user.email,
    profile: user.profile,
    city: user.city,
    subscribed: Boolean(user.subscribed),
    emailVerified: Boolean(user.email_verified),
    createdAt: user.created_at,
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function indiaDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function categoryForAqi(aqi) {
  return airGuidance.categories.find((category) => aqi >= category.min && aqi <= category.max)?.name || "No data";
}

export async function createAccountsService({ root, loadProviderData, mailerOverride = null }) {
  const databasePath = process.env.DATABASE_PATH
    ? path.resolve(root, process.env.DATABASE_PATH)
    : path.join(root, "data", "air-india.sqlite");
  await mkdir(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      profile TEXT NOT NULL,
      city TEXT NOT NULL,
      subscribed INTEGER NOT NULL DEFAULT 0 CHECK (subscribed IN (0, 1)),
      email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
      verify_token TEXT,
      verify_expires_at TEXT,
      unsubscribe_token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_emailed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  `);
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());

  const transporter = mailerOverride || (process.env.SMTP_HOST && process.env.MAIL_FROM
    ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
    : null);
  const baseUrl = (process.env.BASE_URL || `http://127.0.0.1:${Number(process.env.PORT) || 8000}`).replace(/\/+$/, "");
  const rateLimits = new Map();

  function getUnsubscribeToken(userId) {
    const secret = process.env.TOKEN_SECRET;
    if (!secret || secret.length < 32) throw new ApiError(503, "Set a TOKEN_SECRET of at least 32 characters before enabling accounts.");
    return createHmac("sha256", secret).update(`unsubscribe:${userId}`).digest("base64url");
  }

  function makeUnsubscribeUrl(user) {
    return `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(getUnsubscribeToken(user.id))}`;
  }

  function consumeRateLimit(request, endpoint) {
    const now = Date.now();
    const key = `${endpoint}:${request.socket.remoteAddress || "unknown"}`;
    const entry = rateLimits.get(key);
    if (!entry || now - entry.startedAt >= rateWindowMs) {
      rateLimits.set(key, { startedAt: now, count: 1 });
      return;
    }
    if (entry.count >= rateLimitMax) {
      throw new ApiError(429, "Too many attempts. Wait 15 minutes and try again.");
    }
    entry.count += 1;
    if (rateLimits.size > 1000) {
      for (const [entryKey, value] of rateLimits) {
        if (now - value.startedAt >= rateWindowMs) rateLimits.delete(entryKey);
      }
    }
  }

  function currentUserColumns() {
    return "id, email, profile, city, subscribed, email_verified, created_at";
  }

  function getSession(request) {
    const token = cookieValue(request);
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = database.prepare("SELECT id, user_id, expires_at FROM sessions WHERE token_hash = ?").get(tokenHash);
    if (!session) return null;
    if (Date.parse(session.expires_at) <= Date.now()) {
      database.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
      return null;
    }
    return database.prepare(`SELECT ${currentUserColumns()} FROM users WHERE id = ?`).get(session.user_id) || null;
  }

  function requireUser(request) {
    const user = getSession(request);
    if (!user) throw new ApiError(401, "Please log in to continue.");
    return user;
  }

  function createSession(userId, response) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + sessionDurationMs).toISOString();
    database.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), userId, hashToken(token), expiresAt);
    setSessionCookie(response, token, Math.floor(sessionDurationMs / 1000));
  }

  async function sendVerificationEmail(user, verifyToken) {
    const verifyUrl = `${baseUrl}/api/verify?token=${encodeURIComponent(verifyToken)}`;
    const unsubscribeUrl = makeUnsubscribeUrl(user);
    const escapedVerifyUrl = escapeHtml(verifyUrl);
    const escapedUnsubscribeUrl = escapeHtml(unsubscribeUrl);
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: user.email,
      subject: "Verify your Air / India account",
      text: `Verify your email: ${verifyUrl}\n\nYou requested email updates. To unsubscribe, visit: ${unsubscribeUrl}\n\nAir-quality guidance is general information, not medical advice.`,
      html: `<main style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;color:#18342d"><h1>Verify your Air / India account</h1><p>Confirm this email address to finish setting up your account.</p><p><a href="${escapedVerifyUrl}" style="display:inline-block;padding:12px 18px;background:#24775c;color:#fff;text-decoration:none;border-radius:4px">Verify email</a></p><p>This link expires in 24 hours.</p><hr><p style="font-size:13px;color:#58665f">You requested email updates. <a href="${escapedUnsubscribeUrl}">Unsubscribe</a>.</p><p style="font-size:12px;color:#77817c">Air-quality guidance is general information, not medical advice.</p></main>`,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  }

  async function register(request, response) {
    consumeRateLimit(request, "register");
    if (!transporter) throw new ApiError(503, "Email delivery is not configured. Set the SMTP values before registering.");
    const body = await readJsonBody(request);
    const email = normalizeEmail(body.email);
    const password = validatePassword(body.password);
    if (body.consent !== true) throw new ApiError(400, "Consent to email updates is required to register.");
    if (!validProfiles.has(body.profile)) throw new ApiError(400, "Choose a valid health profile.");
    if (!validCities.has(body.city)) throw new ApiError(400, "Choose a valid city.");

    const userId = randomUUID();
    const verifyToken = randomBytes(32).toString("base64url");
    const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const unsubscribeToken = getUnsubscribeToken(userId);
    const user = {
      id: userId,
      email,
      profile: body.profile,
      city: body.city,
      subscribed: 1,
      email_verified: 0,
    };
    const passwordHash = await hashPassword(password);
    try {
      database.prepare(`
        INSERT INTO users (id, email, password_hash, profile, city, subscribed, email_verified, verify_token, verify_expires_at, unsubscribe_token)
        VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
      `).run(userId, email, passwordHash, body.profile, body.city, hashToken(verifyToken), verifyExpiresAt, hashToken(unsubscribeToken));
    } catch (error) {
      if (error.code === "ERR_SQLITE_ERROR" && /UNIQUE/i.test(error.message)) {
        throw new ApiError(409, "An account with this email already exists.");
      }
      throw error;
    }

    try {
      await sendVerificationEmail(user, verifyToken);
    } catch (error) {
      database.prepare("DELETE FROM users WHERE id = ?").run(userId);
      console.error("Verification email delivery failed.", error.code || "SMTP_ERROR");
      throw new ApiError(502, "Could not send the verification email. Check SMTP settings and try again.");
    }
    sendJson(response, 201, { message: "Account created. Check your email to verify it before logging in." });
  }

  async function login(request, response) {
    consumeRateLimit(request, "login");
    const body = await readJsonBody(request);
    const email = normalizeEmail(body.email);
    const password = validatePassword(body.password);
    const user = database.prepare(`SELECT id, email, password_hash, email_verified FROM users WHERE email = ?`).get(email);
    const verified = await verifyPassword(password, user?.password_hash);
    if (!user || !verified) throw new ApiError(401, "Email or password is incorrect.");
    if (!user.email_verified) throw new ApiError(403, "Verify your email before logging in.");
    createSession(user.id, response);
    const currentUser = database.prepare(`SELECT ${currentUserColumns()} FROM users WHERE id = ?`).get(user.id);
    sendJson(response, 200, { user: safeUser(currentUser) });
  }

  function verifyEmail(request, response, url) {
    const token = url.searchParams.get("token") || "";
    if (token.length < 20 || token.length > 200) throw new ApiError(400, "Verification link is invalid or expired.");
    const result = database.prepare(`
      UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires_at = NULL
      WHERE verify_token = ? AND verify_expires_at > ?
    `).run(hashToken(token), new Date().toISOString());
    if (result.changes !== 1) throw new ApiError(400, "Verification link is invalid or expired.");
    sendJson(response, 200, { message: "Email verified. You can now log in." });
  }

  async function unsubscribe(request, response, url) {
    const token = url.searchParams.get("token") || "";
    if (token.length < 20 || token.length > 200) throw new ApiError(400, "Unsubscribe link is invalid.");
    if (request.method === "POST") {
      const chunks = [];
      let byteLength = 0;
      for await (const chunk of request) {
        byteLength += chunk.length;
        if (byteLength > 1024) throw new ApiError(413, "Unsubscribe request is too large.");
        chunks.push(chunk);
      }
      const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      if (form.get("List-Unsubscribe") !== "One-Click") {
        throw new ApiError(400, "One-click unsubscribe request is invalid.");
      }
    }
    const result = database.prepare("UPDATE users SET subscribed = 0 WHERE unsubscribe_token = ?")
      .run(hashToken(token));
    if (result.changes !== 1) throw new ApiError(400, "Unsubscribe link is invalid.");
    sendJson(response, 200, { message: "You have been unsubscribed from email updates." });
  }

  async function patchMe(request, response) {
    const user = requireUser(request);
    const body = await readJsonBody(request);
    const updates = [];
    const values = [];
    if (Object.hasOwn(body, "profile")) {
      if (!validProfiles.has(body.profile)) throw new ApiError(400, "Choose a valid health profile.");
      updates.push("profile = ?");
      values.push(body.profile);
    }
    if (Object.hasOwn(body, "city")) {
      if (!validCities.has(body.city)) throw new ApiError(400, "Choose a valid city.");
      updates.push("city = ?");
      values.push(body.city);
    }
    if (Object.hasOwn(body, "subscribed")) {
      if (typeof body.subscribed !== "boolean") throw new ApiError(400, "Subscription setting must be on or off.");
      updates.push("subscribed = ?");
      values.push(body.subscribed ? 1 : 0);
    }
    if (!updates.length) throw new ApiError(400, "No supported account settings were provided.");
    database.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values, user.id);
    const updated = database.prepare(`SELECT ${currentUserColumns()} FROM users WHERE id = ?`).get(user.id);
    sendJson(response, 200, { user: safeUser(updated) });
  }

  function removeAccount(request, response) {
    const user = requireUser(request);
    database.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    clearSessionCookie(response);
    sendJson(response, 200, { message: "Your account and saved account data have been deleted." });
  }

  function logOut(request, response) {
    const token = cookieValue(request);
    if (token) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    clearSessionCookie(response);
    sendJson(response, 200, { message: "Logged out." });
  }

  function handleRoute(request, response, url) {
    const routeKey = `${request.method} ${url.pathname}`;
    const routes = {
      "POST /api/register": () => register(request, response),
      "POST /api/login": () => login(request, response),
      "POST /api/logout": () => logOut(request, response),
      "GET /api/me": () => {
        const user = getSession(request);
        sendJson(response, 200, { user: user ? safeUser(user) : null });
      },
      "PATCH /api/me": () => patchMe(request, response),
      "DELETE /api/me": () => removeAccount(request, response),
      "GET /api/verify": () => verifyEmail(request, response, url),
      "GET /api/unsubscribe": () => unsubscribe(request, response, url),
      "POST /api/unsubscribe": () => unsubscribe(request, response, url),
    };
    const handler = routes[routeKey];
    if (!handler) return false;
    Promise.resolve()
      .then(handler)
      .catch((error) => {
        if (response.headersSent) return;
        if (error instanceof ApiError) {
          const headers = error.status === 429 ? { "Retry-After": String(Math.ceil(rateWindowMs / 1000)) } : {};
          sendJson(response, error.status, { error: error.message }, headers);
          return;
        }
        console.error("Account API request failed.", error.code || error.name || "ERROR");
        sendJson(response, 500, { error: "The account request could not be completed." });
      });
    return true;
  }

  async function loadCityEstimate(city) {
    const location = locationsByCity.get(city);
    if (!location) return null;
    const coordinates = { latitudes: [location.lat], longitudes: [location.lon] };
    const key = `${location.lat.toFixed(4)},${location.lon.toFixed(4)}`;
    const data = await loadProviderData(key, coordinates, false);
    const current = data.air?.[0]?.current;
    const hourly = data.air?.[0]?.hourly;
    if (!Number.isFinite(current?.us_aqi)) return null;
    const aqi = Math.max(0, Math.min(500, Math.round(current.us_aqi)));
    const category = categoryForAqi(aqi);
    const localParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
    const localHour = `${localParts.year}-${localParts.month}-${localParts.day}T${localParts.hour}`;
    const startIndex = Array.isArray(hourly?.time)
      ? hourly.time.findIndex((time) => time >= localHour)
      : -1;
    const outlook = startIndex >= 0 && Array.isArray(hourly?.us_aqi)
      ? hourly.us_aqi.slice(startIndex, startIndex + 24).filter(Number.isFinite)
      : [];
    const outlookText = outlook.length
      ? `Over the next 24 hours, forecast AQI ranges from ${Math.min(...outlook)} to ${Math.max(...outlook)}.`
      : "A 24-hour AQI outlook is not available right now.";
    return { aqi, category, outlookText };
  }

  async function sendDailyDigest() {
    if (!transporter) return;
    const users = database.prepare(`
      SELECT id, email, profile, city, unsubscribe_token, last_emailed_at
      FROM users WHERE subscribed = 1 AND email_verified = 1
    `).all();
    if (!users.length) return;

    const estimateEntries = await Promise.all([...new Set(users.map((user) => user.city))].map(async (city) => {
      try {
        return [city, await loadCityEstimate(city)];
      } catch (error) {
        console.error("Could not load digest air data.", error.code || error.name || "ERROR");
        return [city, null];
      }
    }));
    const estimates = new Map(estimateEntries);
    const today = indiaDateKey(new Date());

    for (const user of users) {
      if (user.last_emailed_at && indiaDateKey(new Date(user.last_emailed_at)) === today) continue;
      const estimate = estimates.get(user.city);
      if (!estimate) continue;
      const advice = airGuidance.guidance[user.profile]?.[estimate.category] || airGuidance.guidance.general[estimate.category];
      const unsubscribeUrl = makeUnsubscribeUrl(user);
      const escapedCity = escapeHtml(user.city);
      const escapedCategory = escapeHtml(estimate.category);
      const escapedAdvice = escapeHtml(advice);
      const escapedOutlook = escapeHtml(estimate.outlookText);
      const escapedUnsubscribeUrl = escapeHtml(unsubscribeUrl);
      try {
        await transporter.sendMail({
          from: process.env.MAIL_FROM,
          to: user.email,
          subject: `Air / India daily outlook for ${user.city}`,
          text: `${user.city} AQI: ${estimate.aqi} (${estimate.category}).\n\n${estimate.outlookText}\n\n${advice}\n\nGeneral information only, not medical advice.\n\nUnsubscribe: ${unsubscribeUrl}`,
          html: `<main style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;color:#18342d"><h1>Air / India daily outlook</h1><p>${escapedCity} · CAMS global model estimate</p><p style="font-size:28px;font-weight:bold">AQI ${estimate.aqi} <span style="font-size:16px">${escapedCategory}</span></p><p><strong>24-hour outlook</strong><br>${escapedOutlook}</p><p><strong>For your profile</strong><br>${escapedAdvice}</p><p style="font-size:12px;color:#77817c">General information only, not medical advice. Follow local public-health guidance.</p><hr><p style="font-size:13px;color:#58665f"><a href="${escapedUnsubscribeUrl}">Unsubscribe from email updates</a></p></main>`,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        database.prepare("UPDATE users SET last_emailed_at = ? WHERE id = ?")
          .run(new Date().toISOString(), user.id);
      } catch (error) {
        console.error("Daily digest delivery failed.", error.code || "SMTP_ERROR");
      }
    }
  }

  const scheduler = cron.schedule("0 7 * * *", () => {
    void sendDailyDigest().catch((error) => {
      console.error("Daily digest job failed.", error.code || error.name || "ERROR");
    });
  }, { timezone: "Asia/Kolkata", noOverlap: true });

  return { handleRoute, sendDailyDigest, database, scheduler };
}
