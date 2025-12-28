# GoToolkit

Boîte à outils 100 % navigateur pour produire vite des livrables partageables (planches, tableaux, diagrammes, timelines, comptes-rendus vocaux) avec aide IA optionnelle et liens de partage.

## Release notes

2025-12-28  
Module Voice : audio, webcam et partage d’écran. Transcription AssemblyAI intégrée.

2025-12-27  
Ajout du fournisseur IA OpenRouter et clarifications des conditions d’usage.

2025-12-24  
Uniformisation des retours utilisateurs dans tous les modules et gestion de la liste.

2025-12-20  
Nouveaux templates Grid pour la cartographie des données et la structure arborescente.

2025-12-17  
Lancement du module Grid avec génération de données et pilote IA WebLLM.

2025-12-16  
Brouillons et stockage local pour préserver les documents en cours.

2025-12-08  
Templates plus product. Harmonisation de l’interface. Isolation des prompts . Module Feedback.

2025-12-04  
Module Draw : diagrammes de classes, de flux et séquentiels avec Excalidraw.

2025-11-30  
Module Timeline : repères, actions et groupes sur Vis-timeline.

2025-11-24  
Homepage avec partage de liens, intégration Cloudflare + Firebase.

2025-11-22  
Initialisation du module Canvas + intégration OpenAI.

## Ce qui compose le projet
- Site statique dans `public/` : modules HTML/JS/CSS écrits à la main + assets vendoriés. Ouvrable directement ou via un serveur local.
- Pont React/Excalidraw dans `src/connect/index.tsx`, bundlé en `public/js/connect.bundle.js` avec `npm run build`.
- Workers Cloudflare dans `workers/` : proxy OpenAI, service de partage, collecte de feedback.
- Test de fumée Playwright dans `tests/` (`grid-mock.spec.ts`).

## Modules
- **Launcher** (`public/index.html`) : page d’entrée vers les modules avec le cache-buster `?v=2025.12.28` et une URL de partage par défaut.
- **Canvas** (`public/canvas.html`) : planches multi-slides alimentées par les templates de `public/js/prompt.js`. Exports PNG, PPTX, capsule JSON, brouillons locaux et lien de partage (collection Firestore `slides`).
- **Grid** (`public/grid.html`) : générateur de tableaux AG Grid avec modal de templates + bulles de critères (`prompt.js`, `public/js/template-criteria.js`). Pages multiples, export CSV/JSON, brouillons locaux, partage (`grids`). Couvert par le test Playwright.
- **Draw** (`public/draw.html`) : hôte Excalidraw branché sur `window.GoToolkitExcalidraw` (Mermaid → Excalidraw, application de scènes, accès API brut). Templates `prompt.js`, capsules, partage (`diagrams`), prompts IA pour générer un schéma.
- **Timeline** (`public/timeline.html`) : planning vis-timeline avec exports XLSX/PNG/JSON, capsule + partage (`timelines`) et IA pour rédiger un plan.
- **Voice** (`public/voice.html`) : enregistreur + dictée (Web Speech, transcription AssemblyAI via clé), éditeur de transcript, sujets temporisés, participants, résumés par page. Chaque enregistrement génère automatiquement une transcription AssemblyAI avec diarisation qui utilise la liste des participants pour afficher les étiquettes d’intervenants. Brouillons locaux, menu de partage (collection `voices` autorisée sur le worker Cloudflare), connectée à `GoToolkitIA`.

## IA et backends
- Config dans `public/js/ia-config.js` : OpenAI (direct ou proxy `https://openai.gotoolkit.workers.dev`), Ollama (URL/API key), WebLLM (liste de modèles) et fenêtre de contexte, stockés en `localStorage`.
- `public/js/ia-client.js` expose `GoToolkitIAClient.chatCompletion(payload)` et `GoToolkitIA.chatCompletion(payload)` ; normalise les flux SSE/NDJSON, streame les réponses et route vers le backend choisi (`GoToolkitAIBackend` gère la sélection + fallback proxy).
- WebLLM : service worker/worker dans `public/js/webllm-sw.js` et `public/js/webllm-worker.js`.
- Excalidraw : `src/connect/index.tsx` expose `window.GoToolkitExcalidraw` (`initialize`, `applyScene`, `convertMermaid`, `getApi`).

## Données, brouillons et partage
- IndexedDB via `public/js/idb-doc-store.js` pour les capsules locales (`public/js/capsule-drafts.js`) et l’historique des partages (`public/js/share-history.js`), avec fallback `localStorage`.
- Les liens de partage passent par `public/js/share-worker-client.js` et `window.GO_TOOLKIT_SHARE_API_URL(S)` (inclut `https://share.gotoolkit.workers.dev` par défaut). L’API Firestore dans `workers/share-proxy` autorise `slides`, `timelines`, `diagrams`, `grids`, `voices`.
- `public/config.json` porte les flags (seulement `enableTours` pour l’instant).

## Build, run, test
- Dépendances : `npm install`.
- Build du pont Excalidraw : `npm run build` (ou `npm run build:connect`) → écrit `public/js/connect.bundle.js` + assets.
- Serveur local : `npm start` (`npx serve public -l 5000`) ou ouverture directe des HTML de `public/`.
- Tests : `npm run test:playwright` exécute `tests/grid-mock.spec.ts` sur `public/grid.html`.

## Déploiement
- Déployer le dossier `public/` sur n’importe quel hébergeur statique. `firebase.json` est prêt (assets immuables, `index.html` no-cache).
- Anti-cache : requiert le `?v=2025.12.28` sur les liens du launcher et les scripts (ex. `js/prompt.js?v=...`) ; à incrémenter partout quand les assets changent.
- Workers Cloudflare :
  - `workers/openai-proxy` : CORS + quotas + garde-fous payload ; secrets `OPENAI_API_KEY` et KV `RATE_LIMIT`.
  - `workers/share-proxy` : partage Firestore ; `FIREBASE_SERVICE_ACCOUNT` (JSON), `FIREBASE_PROJECT_ID` optionnel, `SHARE_ALLOWED_ORIGINS`, KV `RATE_LIMIT`.
  - `workers/feedback-proxy` : collecte feedback ; mêmes secrets + KV.
  - `workers/assemblyai-proxy` : proxy du jeton AssemblyAI (requiert `X-AssemblyAI-Key`) pour contourner le CORS du token streaming et alimenter `voice.html`.

## Repères utiles
- Templates et métadonnées : `public/js/prompt.js`, `public/js/template-criteria.js`.
- CGU (modal) : `public/js/cgu.js`, styles `public/styles/cgu.css`.
- Shell visuel commun : `public/styles/app-shell.css`.
- Attendus Playwright : `tests/grid-mock.spec.ts`.
