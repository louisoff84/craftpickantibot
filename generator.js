const form = document.querySelector("#captcha-form");
const usernameInput = document.querySelector("#username");
const result = document.querySelector("#result");
const generatedUrl = document.querySelector("#generated-url");
const resultId = document.querySelector("#result-id");
const openLink = document.querySelector("#open-link");
const copyButton = document.querySelector("#copy-button");
const newLinkButton = document.querySelector("#new-link");

let lastConfig = null;
const apiUrl = (window.CRAFTPICK_API_URL || "").replace(/\/$/, "");

function createId() {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return String(values[0] % 90000000 + 10000000);
}

function buildUrl(config) {
  const url = new URL("captcha.html", window.location.href);
  url.searchParams.set("id", config.id);
  url.searchParams.set("user", config.user);
  url.searchParams.set("level", config.level);
  return url.href;
}

function showGeneratedLink(config, suppliedUrl = "") {
  const url = suppliedUrl || buildUrl(config);
  generatedUrl.value = url;
  resultId.textContent = `#${config.id}`;
  openLink.href = url;
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function generateLink() {
  const user = usernameInput.value.trim().replace(/\s+/g, " ");
  const level = new FormData(form).get("level");
  if (!user) return usernameInput.focus();

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Génération en cours…";
  try {
    if (apiUrl) {
      const response = await fetch(`${apiUrl}/api/captchas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, level })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible de générer le CAPTCHA.");
      lastConfig = { id: payload.id, user, level };
      showGeneratedLink(lastConfig, payload.url);
    } else {
      lastConfig = { id: createId(), user, level };
      showGeneratedLink(lastConfig);
    }
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Générer mon lien <span aria-hidden="true">→</span>';
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await generateLink();
});

newLinkButton.addEventListener("click", async () => {
  if (!lastConfig) return;
  await generateLink();
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(generatedUrl.value);
  } catch {
    generatedUrl.select();
    document.execCommand("copy");
  }
  const oldText = copyButton.textContent;
  copyButton.textContent = "Copié !";
  setTimeout(() => { copyButton.textContent = oldText; }, 1600);
});
