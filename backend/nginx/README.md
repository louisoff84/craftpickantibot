# Configuration Nginx

La configuration utilise le domaine `captcha-api.craftpick.fr` et transmet les requêtes à Node.js sur `127.0.0.1:3000`.

## Installation

Depuis la racine du projet :

```bash
sudo cp backend/nginx/craftpick-captcha.conf /etc/nginx/sites-available/craftpick-captcha
sudo ln -s /etc/nginx/sites-available/craftpick-captcha /etc/nginx/sites-enabled/craftpick-captcha
sudo nginx -t
sudo systemctl reload nginx
```

Si un ancien lien existe déjà, ne relancez pas la commande `ln -s`.

## HTTPS avec Certbot

Vérifiez d'abord que le DNS de `captcha-api.craftpick.fr` pointe vers le serveur, puis lancez :

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d captcha-api.craftpick.fr
```

Certbot ajoutera le certificat, le bloc HTTPS et la redirection HTTP vers HTTPS.

## Backend

Dans `backend/.env` :

```env
PORT=3000
HOST=127.0.0.1
PUBLIC_API_URL=https://captcha-api.craftpick.fr
FRONTEND_URL=https://louisoff84.github.io
ALLOWED_REDIRECT_ORIGINS=*
TRUST_PROXY=true
```

Dans le fichier `config.js` du frontend :

```js
window.CRAFTPICK_API_URL = "https://captcha-api.craftpick.fr";
```

Testez ensuite :

```bash
curl https://captcha-api.craftpick.fr/health
```

La réponse doit contenir `"ok":true`.

## Cloudflare

Le proxy peut rester activé dans Cloudflare. Utilisez le mode SSL/TLS **Full (strict)** après la création du certificat Let's Encrypt.
