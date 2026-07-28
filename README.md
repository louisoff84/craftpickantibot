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

## Limite de sécurité

Ce projet fonctionne entièrement dans le navigateur. Il convient à une démonstration et à un filtrage léger, mais il ne remplace pas une vérification anti-bot côté serveur : le JavaScript public peut être inspecté ou contourné. Une version de production doit faire signer et vérifier les jetons par une API privée.
