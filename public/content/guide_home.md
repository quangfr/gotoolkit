# Page d’accueil

`index.html` sert de lanceur central pour accéder aux modules Canvas, Grid, Draw, Timeline et Voice, tout en donnant une vue d’ensemble de la vision GoToolkit.

## 1. Navigation principale
- Le site liste les modules accessibles (`canvas.html`, `grid.html`, `draw.html`, `timeline.html`, `voice.html`) en conservant le cache-buster `?v=2025.12.29` pour être sûr de charger les dernières versions côté client.
- Chaque module peut être ouvert directement et reçoit automatiquement la variable `window.GO_TOOLKIT_SHARE_API_URL` pour que l’utilisateur puisse lancer des partages ou récupérer un lien simplement.

## 2. Présentation et contextes
- L’accueil expose l’idée de GoToolkit (notes, brainstorming, suivi visuel), liste les fonctionnalités clés de chaque module et oriente vers les ressources de documentation (releases, roadmap, superpowers).
- On y trouve aussi les instructions pour configurer les backends (OpenAI, WebLLM) via le panel de réglages global, ce qui garde la configuration synchronisée entre tous les modules.

## 3. Partage et évolutions
- L’index centralise les liens de partage vers `https://share.gotoolkit.workers.dev` et `https://gotoolkit.workers.dev`, et c’est depuis là qu’on voit les mises à jour de version et les nouveautés côté worker (OpenAI proxy, feedback).
- La page rappelle aussi que l’historique local (drafts/capsules/partages) vit dans `localStorage` et IndexedDB, permettant de retrouver ses contenus même après avoir fermé le navigateur.
