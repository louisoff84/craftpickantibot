const params = new URLSearchParams(window.location.search);
const id = params.get("id");
let user = (params.get("user") || "").trim().slice(0, 32);
let level = ["easy", "normal", "hard"].includes(params.get("level")) ? params.get("level") : "normal";
const localRedirectUri = (params.get("redirect_uri") || "").trim();
const apiUrl = (window.CRAFTPICK_API_URL || "").replace(/\/$/, "");

const flow = document.querySelector("#captcha-flow");
const invalidLink = document.querySelector("#invalid-link");
const targetUser = document.querySelector("#target-user");
const captchaId = document.querySelector("#captcha-id");
const checkbox = document.querySelector("#human-checkbox");
const challenge = document.querySelector("#challenge");
const title = document.querySelector("#challenge-title");
const canvas = document.querySelector("#captcha-canvas");
const captchaImage = document.querySelector("#captcha-image");
const mathQuestion = document.querySelector("#math-question");
const answerForm = document.querySelector("#answer-form");
const answerInput = document.querySelector("#answer");
const attemptMessage = document.querySelector("#attempt-message");
const refreshButton = document.querySelector("#refresh-challenge");
const successState = document.querySelector("#success-state");
const blockedState = document.querySelector("#blocked-state");
const verificationToken = document.querySelector("#verification-token");

let expectedAnswer = "";
let attempts = 0;
let refreshes = 0;
let interactionStartedAt = 0;
let serverChallenge = null;

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function generateTextChallenge(random) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const length = level === "hard" ? 7 : 6;
  expectedAnswer = Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
  title.textContent = "Recopiez le code affiché";
  mathQuestion.hidden = true;
  captchaImage.hidden = true;
  canvas.hidden = false;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#f6f2ff");
  gradient.addColorStop(1, "#d9d2ed");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 14; index += 1) {
    context.beginPath();
    context.strokeStyle = `hsla(${240 + random() * 80}, 60%, 42%, ${.12 + random() * .25})`;
    context.lineWidth = 1 + random() * 3;
    context.moveTo(random() * canvas.width, random() * canvas.height);
    context.bezierCurveTo(
      random() * canvas.width, random() * canvas.height,
      random() * canvas.width, random() * canvas.height,
      random() * canvas.width, random() * canvas.height
    );
    context.stroke();
  }

  const spacing = canvas.width / (expectedAnswer.length + 1);
  [...expectedAnswer].forEach((character, index) => {
    context.save();
    context.translate(spacing * (index + 1), canvas.height / 2 + (random() - .5) * 24);
    context.rotate((random() - .5) * .45);
    context.font = `800 ${58 + random() * 12}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = `hsl(${235 + random() * 55}, 48%, ${22 + random() * 18}%)`;
    context.fillText(character, 0, 0);
    context.restore();
  });

  for (let index = 0; index < 75; index += 1) {
    context.fillStyle = `rgba(40, 30, 80, ${.08 + random() * .2})`;
    context.beginPath();
    context.arc(random() * canvas.width, random() * canvas.height, random() * 2.2, 0, Math.PI * 2);
    context.fill();
  }
}

function generateMathChallenge(random) {
  const first = Math.floor(random() * 12) + 3;
  const second = Math.floor(random() * 10) + 2;
  const multiply = level === "hard" && random() > .45;
  expectedAnswer = String(multiply ? first * second : first + second);
  title.textContent = "Résolvez le calcul";
  canvas.hidden = true;
  captchaImage.hidden = true;
  mathQuestion.hidden = false;
  mathQuestion.textContent = `${first} ${multiply ? "×" : "+"} ${second} = ?`;
}

function createChallenge() {
  if (serverChallenge) {
    title.textContent = serverChallenge.prompt;
    if (serverChallenge.type === "image") {
      canvas.hidden = true;
      mathQuestion.hidden = true;
      captchaImage.src = new URL(serverChallenge.imageUrl, `${apiUrl}/`).href;
      captchaImage.onerror = () => {
        captchaImage.hidden = true;
        attemptMessage.textContent = "Impossible de charger l’image CAPTCHA. Actualisez la page.";
      };
      captchaImage.hidden = false;
    } else {
      canvas.hidden = true;
      captchaImage.hidden = true;
      mathQuestion.textContent = serverChallenge.prompt;
      mathQuestion.hidden = false;
    }
    answerInput.value = "";
    attemptMessage.textContent = "";
    answerInput.focus();
    return;
  }
  const random = seededRandom(hashString(`${id}:${level}:${refreshes}`));
  const useMath = level === "easy" || (level === "hard" && refreshes % 2 === 1);
  if (useMath) generateMathChallenge(random);
  else generateTextChallenge(random);
  answerInput.value = "";
  attemptMessage.textContent = "";
  answerInput.focus();
}

function completeVerification(serverResult = null) {
  checkbox.classList.add("checked");
  checkbox.setAttribute("aria-pressed", "true");
  checkbox.disabled = true;
  challenge.hidden = true;
  successState.hidden = false;
  const tokenSeed = hashString(`${id}:${user}:${Date.now()}:${performance.now()}`);
  const token = serverResult?.token || `CP-${id}-${tokenSeed.toString(36).toUpperCase()}`;
  verificationToken.textContent = `Jeton de vérification : ${token}`;
  sessionStorage.setItem(`craftpick-captcha-${id}`, JSON.stringify({
    verified: true,
    user,
    token,
    timestamp: Date.now()
  }));

  window.parent?.postMessage({
    type: "craftpick-captcha-success",
    id,
    user,
    token
  }, window.location.origin);

  const destination = serverResult?.redirectUrl || getLocalRedirectUrl(token);
  if (destination) {
    successState.querySelector("p").textContent = "Vérification réussie. Redirection en cours…";
    setTimeout(() => window.location.assign(destination), 1200);
  }
}

function getLocalRedirectUrl(token) {
  if (!localRedirectUri) return "";
  try {
    const url = new URL(localRedirectUri);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.searchParams.set("captcha_status", "success");
    url.searchParams.set("captcha_id", id);
    url.searchParams.set("captcha_token", token);
    return url.href;
  } catch {
    return "";
  }
}

function blockVerification() {
  checkbox.hidden = true;
  challenge.hidden = true;
  blockedState.hidden = false;
}

async function loadCaptcha() {
  if (!id || !/^\d{8}$/.test(id)) {
    invalidLink.hidden = false;
    captchaId.textContent = id ? `ID #${id}` : "ID absent";
    return;
  }

  if (apiUrl) {
    try {
      const response = await fetch(`${apiUrl}/api/captchas/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "CAPTCHA indisponible.");
      user = payload.user;
      level = payload.level;
      serverChallenge = payload.challenge;
      flow.hidden = false;
      targetUser.textContent = user;
      captchaId.textContent = `ID #${id}`;
      refreshButton.hidden = true;
      return;
    } catch (error) {
      invalidLink.hidden = false;
      invalidLink.textContent = error.message;
      captchaId.textContent = `ID #${id}`;
      return;
    }
  }

  if (!user) {
    invalidLink.hidden = false;
    captchaId.textContent = `ID #${id}`;
    return;
  }

  flow.hidden = false;
  targetUser.textContent = user;
  captchaId.textContent = `ID #${id}`;

  const existing = sessionStorage.getItem(`craftpick-captcha-${id}`);
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed.verified && Date.now() - parsed.timestamp < 15 * 60 * 1000) {
        checkbox.hidden = true;
        successState.hidden = false;
        verificationToken.textContent = `Jeton de vérification : ${parsed.token}`;
      }
    } catch {
      sessionStorage.removeItem(`craftpick-captcha-${id}`);
    }
  }
}

if (!id || !/^\d{8}$/.test(id)) {
  invalidLink.hidden = false;
  captchaId.textContent = id ? `ID #${id}` : "ID absent";
}
loadCaptcha();

checkbox.addEventListener("click", () => {
  if (checkbox.classList.contains("loading")) return;
  checkbox.classList.add("loading");
  interactionStartedAt = performance.now();
  setTimeout(() => {
    checkbox.classList.remove("loading");
    checkbox.classList.add("checked");
    checkbox.setAttribute("aria-pressed", "true");
    checkbox.disabled = true;
    challenge.hidden = false;
    createChallenge();
  }, 700 + Math.random() * 450);
});

refreshButton.addEventListener("click", () => {
  refreshes += 1;
  createChallenge();
});

answerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const elapsed = performance.now() - interactionStartedAt;
  const supplied = answerInput.value.trim().toUpperCase();

  if (elapsed < 900) {
    attemptMessage.textContent = "Validation trop rapide. Prenez le temps de lire le défi.";
    return;
  }

  if (apiUrl && serverChallenge) {
    const submitButton = answerForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const response = await fetch(`${apiUrl}/api/captchas/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: supplied })
      });
      const payload = await response.json();
      if (response.ok && payload.success) {
        completeVerification(payload);
        return;
      }
      attempts = 3 - (payload.attemptsRemaining ?? 0);
      attemptMessage.textContent = payload.error || "Réponse incorrecte.";
      if (payload.attemptsRemaining === 0) blockVerification();
    } catch {
      attemptMessage.textContent = "Impossible de contacter le serveur de vérification.";
    } finally {
      submitButton.disabled = false;
    }
    return;
  }

  if (supplied === expectedAnswer.toUpperCase()) {
    completeVerification();
    return;
  }

  attempts += 1;
  if (attempts >= 3) {
    blockVerification();
    return;
  }
  refreshes += 1;
  createChallenge();
  attemptMessage.textContent = `Réponse incorrecte. ${3 - attempts} tentative${3 - attempts > 1 ? "s" : ""} restante${3 - attempts > 1 ? "s" : ""}.`;
});
