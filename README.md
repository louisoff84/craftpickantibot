# Craftpick Captcha

Un générateur de liens CAPTCHA statique, conçu pour être hébergé avec GitHub Pages.

## Utilisation

1. Ouvrez la page d'accueil.
2. Indiquez le nom de l'utilisateur et le niveau de difficulté.
3. Copiez l'URL générée.
4. Le visiteur ouvre le lien, coche « Je ne suis pas un robot » et résout le défi.

Exemple :

```text
https://louisoff84.github.io/craftpickantibot/captcha.html?id=65144351&user=Louis&level=normal
```

Le widget envoie aussi un événement `postMessage` de type `craftpick-captcha-success` quand il est intégré dans une iframe provenant de la même origine.

## Backend sécurisé

Le dossier [`backend`](backend/) contient l'API Node.js qui crée les défis, protège les réponses et signe les jetons de validation. Après avoir hébergé cette API :

1. configurez son fichier `backend/.env` ;
2. indiquez son URL publique dans `config.js` ;
3. redéployez le frontend GitHub Pages.

Si `CRAFTPICK_API_URL` est vide, le site utilise automatiquement son ancien mode de démonstration entièrement local.
