import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAccountsService } from "../server/accounts.js";

function localIsoHour(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
}

test("account lifecycle, verification, digest, and deletion use hashed secrets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "air-india-account-test-"));
  const previous = {
    databasePath: process.env.DATABASE_PATH,
    tokenSecret: process.env.TOKEN_SECRET,
    baseUrl: process.env.BASE_URL,
    mailFrom: process.env.MAIL_FROM,
  };
  process.env.DATABASE_PATH = path.join(root, "accounts.sqlite");
  process.env.TOKEN_SECRET = "test-only-secret-with-at-least-32-characters";
  process.env.BASE_URL = "https://air.example.test";
  process.env.MAIL_FROM = "Air / India <test@example.test>";

  const messages = [];
  const now = Date.now();
  const hourlyTimes = Array.from({ length: 48 }, (_, index) => localIsoHour(new Date(now + index * 60 * 60 * 1000)));
  const mailer = { sendMail: async (message) => { messages.push(message); return { messageId: "test-message" }; } };
  const service = await createAccountsService({
    root,
    mailerOverride: mailer,
    loadProviderData: async () => ({
      air: [{
        current: { us_aqi: 120, pm2_5: 42 },
        hourly: { time: hourlyTimes, us_aqi: hourlyTimes.map((_, index) => 120 + (index % 5)) },
      }],
      weather: null,
      fetchedAt: new Date().toISOString(),
    }),
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (!service.handleRoute(request, response, url)) response.writeHead(404).end();
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const send = (route, options = {}) => fetch(`${baseUrl}${route}`, options);
    const registration = {
      email: "  User@Example.com ",
      password: "correct-horse-1",
      profile: "asthma",
      city: "Delhi",
      consent: true,
    };

    const anonymousMe = await send("/api/me");
    assert.equal(anonymousMe.status, 200);
    assert.equal((await anonymousMe.json()).user, null);
    const anonymousPatch = await send("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: "Delhi" }),
    });
    assert.equal(anonymousPatch.status, 401);

    const missingConsent = await send("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...registration, email: "no-consent@example.com", consent: false }),
    });
    assert.equal(missingConsent.status, 400);

    const created = await send("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registration),
    });
    assert.equal(created.status, 201);
    assert.equal(messages.length, 1);
    assert.match(messages[0].subject, /verify/i);
    assert.equal(messages[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

    const user = service.database.prepare("SELECT * FROM users WHERE email = ?").get("user@example.com");
    assert.notEqual(user.password_hash, registration.password);
    assert.equal(user.subscribed, 1);
    assert.equal(user.email_verified, 0);
    assert.match(user.verify_token, /^[a-f0-9]{64}$/);
    assert.notEqual(user.verify_token, messages[0].text.match(/token=([^\s]+)/)[1]);

    const verificationToken = messages[0].text.match(/\/api\/verify\?token=([^\s]+)/)[1];
    const unverifiedLogin = await send("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: registration.password }),
    });
    assert.equal(unverifiedLogin.status, 403);

    const duplicate = await send("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registration),
    });
    assert.equal(duplicate.status, 409);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const repeated = await send("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registration),
      });
      assert.equal(repeated.status, 409);
    }
    const limitedRegistration = await send("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registration),
    });
    assert.equal(limitedRegistration.status, 429);

    const verified = await send(`/api/verify?token=${encodeURIComponent(verificationToken)}`);
    assert.equal(verified.status, 200);
    assert.equal(service.database.prepare("SELECT email_verified FROM users WHERE id = ?").get(user.id).email_verified, 1);

    const incorrectPassword = await send("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "incorrect-horse-1" }),
    });
    assert.equal(incorrectPassword.status, 401);

    const login = await send("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: registration.password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const sessionToken = cookie.match(/^air-india-session=([^;]+)/)[1];
    const storedSession = service.database.prepare("SELECT token_hash FROM sessions WHERE user_id = ?").get(user.id);
    assert.equal(storedSession.token_hash, createHash("sha256").update(sessionToken).digest("hex"));
    assert.notEqual(storedSession.token_hash, sessionToken);

    const me = await send("/api/me", { headers: { Cookie: `air-india-session=${sessionToken}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.email, "user@example.com");

    const updated = await send("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: `air-india-session=${sessionToken}` },
      body: JSON.stringify({ profile: "child", city: "Mumbai", subscribed: true }),
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(
      (({ profile, city, subscribed }) => ({ profile, city, subscribed: Boolean(subscribed) }))((await updated.json()).user),
      { profile: "child", city: "Mumbai", subscribed: true },
    );

    await service.database.prepare("UPDATE users SET profile = ?, city = ? WHERE id = ?").run("asthma", "Delhi", user.id);
    await service.sendDailyDigest();
    assert.equal(messages.length, 2);
    assert.match(messages[1].subject, /Delhi/);
    assert.match(messages[1].text, /AQI: 120 \(Unhealthy for Sensitive Groups\)/);
    assert.match(messages[1].text, /reliever accessible/i);
    assert.match(messages[1].text, /next 24 hours/i);
    assert.match(messages[1].text, /not medical advice/i);
    assert.equal(messages[1].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

    const unsubscribeHeader = messages[0].headers["List-Unsubscribe"];
    const unsubscribeToken = new URL(unsubscribeHeader.slice(1, -1)).searchParams.get("token");
    const unsubscribe = await send(`/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    assert.equal(unsubscribe.status, 200);
    assert.equal(service.database.prepare("SELECT subscribed FROM users WHERE id = ?").get(user.id).subscribed, 0);
    assert.notEqual(service.database.prepare("SELECT unsubscribe_token FROM users WHERE id = ?").get(user.id).unsubscribe_token, unsubscribeToken);

    const deleted = await send("/api/me", {
      method: "DELETE",
      headers: { Cookie: `air-india-session=${sessionToken}` },
    });
    assert.equal(deleted.status, 200);
    assert.match(deleted.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal(service.database.prepare("SELECT id FROM users WHERE id = ?").get(user.id), undefined);
    assert.equal(service.database.prepare("SELECT id FROM sessions WHERE user_id = ?").get(user.id), undefined);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const repeated = await send("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "incorrect-horse-1" }),
      });
      assert.equal(repeated.status, 401);
    }
    const limitedLogin = await send("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "incorrect-horse-1" }),
    });
    assert.equal(limitedLogin.status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    service.scheduler.stop();
    service.database.close();
    await rm(root, { recursive: true, force: true });
    for (const [key, value] of Object.entries({
      DATABASE_PATH: previous.databasePath,
      TOKEN_SECRET: previous.tokenSecret,
      BASE_URL: previous.baseUrl,
      MAIL_FROM: previous.mailFrom,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
