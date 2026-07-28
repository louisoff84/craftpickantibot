import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual
} from "node:crypto";

if (existsSync(new URL(".env", import.meta.url))) {
  const envFile = readFileSync(new URL(".env", import.meta.url), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  publicApiUrl: (process.env.PUBLIC_API_URL || "").replace(/\/$/, ""),
  frontendUrl: (process.env.FRONTEND_URL || "https://louisoff84.github.io").replace(/\/$/, ""),
  allowedRedirectOrigins: new Set(
    (process.env.ALLOWED_REDIRECT_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  ),
  allowAllRedirectOrigins: (process.env.ALLOWED_REDIRECT_ORIGINS || "")
    .split(",")
    .some((origin) => origin.trim() === "*"),
  tokenSecret: process.env.TOKEN_SECRET || "",
  adminApiKey: process.env.ADMIN_API_KEY || "",
  trustProxy: process.env.TRUST_PROXY === "true"
};

if (config.tokenSecret.length < 32) {
  console.error("ERREUR: TOKEN_SECRET doit contenir au moins 32 caractères.");
  process.exit(1);
}

const challenges = new Map();
const rateLimits = new Map();
const CHALLENGE_TTL = 5 * 60 * 1000;
const VERIFIED_TTL = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const BODY_LIMIT = 16 * 1024;

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function getClientIp(request) {
  if (config.trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

function isRateLimited(key, maximum, windowMs) {
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > maximum;
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  const allowedOrigins = new Set([
    config.frontendUrl,
    `${config.frontendUrl}/`,
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ]);
  if (origin && allowedOrigins.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
  }
  return {};
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw Object.assign(new Error("Corps trop volumineux."), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("JSON invalide."), { status: 400 });
  }
}

function normalizeUser(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 32);
}

function normalizeLevel(value) {
  return ["easy", "normal", "hard"].includes(value) ? value : "normal";
}

function normalizeRedirectUri(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 500) {
    throw Object.assign(new Error("L’URL de redirection est invalide."), { status: 400 });
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error("L’URL de redirection est invalide."), { status: 400 });
  }
  const isLocalhost = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isLocalhost && url.protocol === "http:")) {
    throw Object.assign(new Error("L’URL de redirection doit utiliser HTTPS."), { status: 400 });
  }
  if (!config.allowAllRedirectOrigins && !config.allowedRedirectOrigins.has(url.origin)) {
    throw Object.assign(new Error("Cette origine de redirection n’est pas autorisée."), { status: 400 });
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  return url.href;
}

function hashAnswer(answer, salt) {
  return createHmac("sha256", config.tokenSecret)
    .update(`${salt}:${String(answer).trim().toUpperCase()}`)
    .digest();
}

function generateId() {
  let id;
  do id = String(randomInt(10_000_000, 100_000_000));
  while (challenges.has(id));
  return id;
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&apos;"
  })[character]);
}

function makeSvgCaptcha(answer) {
  const characters = [...answer];
  const noise = Array.from({ length: 18 }, () => {
    const x1 = randomInt(0, 520);
    const y1 = randomInt(0, 150);
    const x2 = randomInt(0, 520);
    const y2 = randomInt(0, 150);
    return `<path d="M${x1} ${y1} Q${randomInt(0, 520)} ${randomInt(0, 150)} ${x2} ${y2}" stroke="hsl(${randomInt(230, 295)} 55% 38% / .25)" stroke-width="${randomInt(1, 4)}" fill="none"/>`;
  }).join("");

  const letters = characters.map((character, index) => {
    const x = 58 + index * (405 / Math.max(1, characters.length - 1));
    const y = randomInt(82, 110);
    const rotation = randomInt(-18, 19);
    const size = randomInt(53, 70);
    return `<text x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y})" font-family="Arial,sans-serif" font-size="${size}" font-weight="800" text-anchor="middle" fill="hsl(${randomInt(235, 290)} 50% 28%)">${escapeXml(character)}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="150" viewBox="0 0 520 150">
  <defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="#f6f2ff"/><stop offset="1" stop-color="#d9d2ed"/></linearGradient></defs>
  <rect width="520" height="150" rx="10" fill="url(#bg)"/>
  ${noise}
  ${letters}
</svg>`;
}

function createChallenge(level) {
  if (level === "easy") {
    const first = randomInt(3, 16);
    const second = randomInt(2, 12);
    return {
      type: "math",
      prompt: `${first} + ${second} = ?`,
      answer: String(first + second)
    };
  }

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const length = level === "hard" ? 7 : 6;
  const answer = Array.from({ length }, () => alphabet[randomInt(0, alphabet.length)]).join("");
  return {
    type: "image",
    prompt: "Recopiez le code affiché",
    answer,
    svg: makeSvgCaptcha(answer)
  };
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signToken(payload) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", config.tokenSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  if (typeof token !== "string") return null;
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) return null;
  const expectedSignature = createHmac("sha256", config.tokenSecret).update(encoded).digest();
  let signature;
  try {
    signature = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  if (signature.length !== expectedSignature.length || !timingSafeEqual(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function cleanExpiredData() {
  const now = Date.now();
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(id);
  }
  for (const [key, limit] of rateLimits) {
    if (limit.resetAt <= now) rateLimits.delete(key);
  }
}

setInterval(cleanExpiredData, 60_000).unref();

const server = createServer(async (request, response) => {
  const cors = corsHeaders(request);
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const path = requestUrl.pathname.replace(/\/+$/, "") || "/";
  const ip = getClientIp(request);

  if (request.method === "OPTIONS") {
    response.writeHead(204, cors);
    return response.end();
  }

  try {
    if (request.method === "GET" && path === "/") {
      return sendJson(response, 200, {
        service: "Craftpick Captcha API",
        status: "online",
        version: "1.0.0"
      }, cors);
    }

    if (request.method === "GET" && path === "/health") {
      return sendJson(response, 200, {
        ok: true,
        activeChallenges: challenges.size,
        uptime: Math.floor(process.uptime())
      }, cors);
    }

    if (request.method === "POST" && path === "/api/captchas") {
      if (isRateLimited(`create:${ip}`, 20, 60_000)) {
        return sendJson(response, 429, { error: "Trop de CAPTCHA générés. Réessayez dans une minute." }, cors);
      }

      const body = await readJson(request);
      const user = normalizeUser(body.user);
      const level = normalizeLevel(body.level);
      const redirectUri = normalizeRedirectUri(body.redirectUri);
      if (!user) return sendJson(response, 400, { error: "Le nom de l'utilisateur est obligatoire." }, cors);

      const id = generateId();
      const generated = createChallenge(level);
      const salt = randomBytes(16).toString("hex");
      const now = Date.now();
      challenges.set(id, {
        id,
        user,
        level,
        redirectUri,
        type: generated.type,
        prompt: generated.prompt,
        svg: generated.svg,
        answerHash: hashAnswer(generated.answer, salt),
        salt,
        attempts: 0,
        createdAt: now,
        firstDisplayedAt: null,
        expiresAt: now + CHALLENGE_TTL
      });

      const frontendLink = new URL(`${config.frontendUrl}/craftpickantibot/captcha.html`);
      frontendLink.searchParams.set("id", id);
      return sendJson(response, 201, {
        id,
        user,
        level,
        url: frontendLink.href,
        expiresAt: new Date(now + CHALLENGE_TTL).toISOString()
      }, cors);
    }

    const imageMatch = path.match(/^\/api\/captchas\/(\d{8})\/image\.svg$/);
    if (request.method === "GET" && imageMatch) {
      const item = challenges.get(imageMatch[1]);
      if (!item || item.expiresAt <= Date.now() || !item.svg) {
        return sendJson(response, 404, { error: "Image CAPTCHA introuvable." }, cors);
      }
      response.writeHead(200, {
        ...cors,
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "Cross-Origin-Resource-Policy": "cross-origin"
      });
      return response.end(item.svg);
    }

    const captchaMatch = path.match(/^\/api\/captchas\/(\d{8})$/);
    if (request.method === "GET" && captchaMatch) {
      if (isRateLimited(`display:${ip}`, 60, 60_000)) {
        return sendJson(response, 429, { error: "Trop de demandes." }, cors);
      }
      const item = challenges.get(captchaMatch[1]);
      if (!item || item.expiresAt <= Date.now()) {
        challenges.delete(captchaMatch[1]);
        return sendJson(response, 404, { error: "Ce CAPTCHA est introuvable ou expiré." }, cors);
      }
      if (!item.firstDisplayedAt) item.firstDisplayedAt = Date.now();
      return sendJson(response, 200, {
        id: item.id,
        user: item.user,
        level: item.level,
        challenge: {
          type: item.type,
          prompt: item.prompt,
          imageUrl: item.type === "image"
            ? `/api/captchas/${item.id}/image.svg`
            : null
        },
        attemptsRemaining: MAX_ATTEMPTS - item.attempts,
        expiresAt: new Date(item.expiresAt).toISOString()
      }, cors);
    }

    const verifyMatch = path.match(/^\/api\/captchas\/(\d{8})\/verify$/);
    if (request.method === "POST" && verifyMatch) {
      if (isRateLimited(`verify:${ip}`, 30, 60_000)) {
        return sendJson(response, 429, { error: "Trop de tentatives de vérification." }, cors);
      }

      const item = challenges.get(verifyMatch[1]);
      if (!item || item.expiresAt <= Date.now()) {
        challenges.delete(verifyMatch[1]);
        return sendJson(response, 404, { error: "Ce CAPTCHA est introuvable ou expiré." }, cors);
      }
      if (item.attempts >= MAX_ATTEMPTS) {
        return sendJson(response, 403, { error: "Ce CAPTCHA est bloqué." }, cors);
      }
      if (!item.firstDisplayedAt || Date.now() - item.firstDisplayedAt < 900) {
        return sendJson(response, 400, { error: "Validation trop rapide." }, cors);
      }

      const body = await readJson(request);
      const suppliedHash = hashAnswer(body.answer || "", item.salt);
      const valid = suppliedHash.length === item.answerHash.length &&
        timingSafeEqual(suppliedHash, item.answerHash);

      if (!valid) {
        item.attempts += 1;
        const attemptsRemaining = MAX_ATTEMPTS - item.attempts;
        return sendJson(response, attemptsRemaining ? 400 : 403, {
          success: false,
          error: attemptsRemaining ? "Réponse incorrecte." : "Ce CAPTCHA est maintenant bloqué.",
          attemptsRemaining
        }, cors);
      }

      const now = Date.now();
      const token = signToken({
        iss: "craftpick-captcha",
        sub: item.user,
        captchaId: item.id,
        iat: now,
        exp: now + VERIFIED_TTL,
        nonce: randomBytes(12).toString("hex")
      });
      let redirectUrl = null;
      if (item.redirectUri) {
        const destination = new URL(item.redirectUri);
        destination.searchParams.set("captcha_status", "success");
        destination.searchParams.set("captcha_id", item.id);
        destination.searchParams.set("captcha_token", token);
        redirectUrl = destination.href;
      }
      challenges.delete(item.id);
      return sendJson(response, 200, {
        success: true,
        token,
        redirectUrl,
        expiresAt: new Date(now + VERIFIED_TTL).toISOString()
      }, cors);
    }

    if (request.method === "POST" && path === "/api/tokens/verify") {
      if (!config.adminApiKey || request.headers["x-api-key"] !== config.adminApiKey) {
        return sendJson(response, 401, { valid: false, error: "Clé API invalide." }, cors);
      }
      const body = await readJson(request);
      const payload = verifyToken(body.token);
      return sendJson(response, payload ? 200 : 401, {
        valid: Boolean(payload),
        payload
      }, cors);
    }

    return sendJson(response, 404, { error: "Route introuvable." }, cors);
  } catch (error) {
    if (!error.status || error.status >= 500) console.error(error);
    return sendJson(response, error.status || 500, {
      error: error.status ? error.message : "Erreur interne du serveur."
    }, cors);
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Craftpick Captcha API démarrée sur http://${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} reçu, arrêt du serveur...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
