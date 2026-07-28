# Backend Craftpick Captcha

API Node.js sans dépendance externe. Elle crée les défis côté serveur, garde la réponse secrète, limite les essais et délivre un jeton HMAC vérifiable.

## Installation

```bash
cd backend
cp .env.example .env
nano .env
npm start
```

Node.js 20 ou plus récent est nécessaire. Les variables du fichier `.env` ne sont pas chargées automatiquement sans gestionnaire de processus. Avec Pterodactyl, Docker ou systemd, ajoutez-les directement dans l'environnement du serveur.

Créez les deux secrets avec :

```bash
openssl rand -hex 32
```

## Variables

| Variable | Description |
|---|---|
| `PORT` | Port HTTP, `3000` par défaut |
| `HOST` | Adresse d'écoute, `0.0.0.0` par défaut |
| `PUBLIC_API_URL` | URL publique HTTPS de l'API |
| `FRONTEND_URL` | Origine autorisée, par défaut `https://louisoff84.github.io` |
| `ALLOWED_REDIRECT_ORIGINS` | Origines autorisées séparées par des virgules, ou `*` pour accepter toutes les origines HTTPS |
| `TOKEN_SECRET` | Secret HMAC d'au moins 32 caractères |
| `ADMIN_API_KEY` | Clé privée utilisée pour vérifier les jetons |
| `TRUST_PROXY` | `true` derrière Nginx ou Cloudflare |

## API

### Créer un CAPTCHA

```http
POST /api/captchas
Content-Type: application/json

{"user":"Louis","level":"normal","redirectUri":"https://craftpick.fr/connexion/terminee"}
```

Après validation, l'API ajoute automatiquement à la redirection :

```text
?captcha_status=success&captcha_id=65144351&captcha_token=JETON_SIGNE
```

L'origine de `redirectUri` doit être présente dans `ALLOWED_REDIRECT_ORIGINS`.
Cette valeur est enregistrée côté serveur depuis le dashboard et n'est pas exposée dans le lien CAPTCHA public.

Pour accepter tous les domaines HTTPS :

```env
ALLOWED_REDIRECT_ORIGINS=*
```

Le backend continue de refuser les protocoles dangereux comme `javascript:`, `data:` et `file:`.

### Obtenir le défi

```http
GET /api/captchas/65144351
```

### Valider la réponse

```http
POST /api/captchas/65144351/verify
Content-Type: application/json

{"answer":"ABC123"}
```

### Vérifier le jeton depuis votre serveur

Ne faites jamais cet appel depuis du JavaScript public, car `ADMIN_API_KEY` doit rester privée.

```bash
curl -X POST https://captcha-api.example.com/api/tokens/verify \
  -H "Content-Type: application/json" \
  -H "X-API-Key: VOTRE_CLE_PRIVEE" \
  -d '{"token":"JETON_RECU"}'
```

## Important

Chaque défi visuel expire après cinq minutes, mais son ID reste réutilisable : l'API génère automatiquement un nouveau défi pour le même lien après expiration ou après une validation réussie. Chaque réussite produit un nouveau jeton signé. Un redémarrage du processus invalide les ID en mémoire. Pour conserver les ID après redémarrage ou utiliser plusieurs instances, remplacez les `Map` par Redis ou une base de données.

## Nginx et HTTPS

Une configuration prête pour `captcha-api.craftpick.fr` et les commandes Certbot se trouvent dans [`nginx/`](nginx/).
