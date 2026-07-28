const form = document.querySelector("#captcha-form");
const usernameInput = document.querySelector("#username");
const result = document.querySelector("#result");
const generatedUrl = document.querySelector("#generated-url");
const resultId = document.querySelector("#result-id");
const openLink = document.querySelector("#open-link");
const copyButton = document.querySelector("#copy-button");
const newLinkButton = document.querySelector("#new-link");

let lastConfig = null;

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

function showGeneratedLink(config) {
  const url = buildUrl(config);
  generatedUrl.value = url;
  resultId.textContent = `#${config.id}`;
  openLink.href = url;
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const user = usernameInput.value.trim().replace(/\s+/g, " ");
  const level = new FormData(form).get("level");
  if (!user) return usernameInput.focus();
  lastConfig = { id: createId(), user, level };
  showGeneratedLink(lastConfig);
});

newLinkButton.addEventListener("click", () => {
  if (!lastConfig) return;
  lastConfig.id = createId();
  showGeneratedLink(lastConfig);
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
