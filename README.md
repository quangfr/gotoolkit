# GoToolkit

GoToolkit est une application web statique avec logique frontend en `public/`, bundles React générés depuis `src/`, tests Playwright dans `tests/`, et proxies/backend dans `workers/`.

Ce README donne le minimum pour :
- installer le projet
- lancer l'application en local
- comprendre où modifier quoi

Pour le détail architecture, sécurité et tests, voir :
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/SECURITY.MD](docs/SECURITY.MD)
- [docs/TESTING.md](docs/TESTING.md)

## Prérequis

- Node.js 18+
- npm

## Installation

```bash
npm install
```

Le projet lit aussi certaines variables depuis `.env.local` pour les workers, l'auth et certains scénarios de test.

Exemple minimal :

```dotenv
# Playwright shared-space bootstrap
PW_TEST_SPACE_ID=gotoolkit
PW_TEST_SPACE_CODE=gotoolkit

# Optional: protected space rotation test
SHARE_SPACE_CREATE_SECRET=

# Optional: Microsoft OAuth Playwright flows
PW_MICROSOFT_LOGIN_EMAIL=
PW_MICROSOFT_LOGIN_PASSWORD=

# Optional: enable the real AssemblyAI integration spec
PW_ENABLE_LIVE_ASSEMBLYAI=0
```

## Lancer l'application en local

Serveur local standard :

```bash
npm start
```

Serveur local de test :

```bash
npm run start:test
```

Les deux servent le frontend sur `http://localhost:5000` ou `http://127.0.0.1:5000`.

## Développement frontend

Mode watch + serveur :

```bash
npm run dev
```

Build des bundles :

```bash
npm run build
```

Build optimisé :

```bash
npm run build:prod
```

Les bundles générés sont écrits dans `public/js/`.

Les 2 bundles frontend principaux sont :

- `public/js/memo.bundle.js` : bundle principal de l’expérience Docs, généré depuis `src/memo-bridge/index.tsx`.
- `public/js/draw.bundle.js` : bundle principal de l’expérience dessin/connect, généré depuis `src/draw-editor/index.tsx`.

## Tests Playwright

Exécution simple :

```bash
npx playwright test
```

Sur cette machine et sous WSL, utiliser de préférence le workflow repo :

```bash
npm run playwright:linux:test -- tests/<spec>.spec.ts --workers=1 --reporter=line
```

Bootstrap d'état d'auth Playwright :

```bash
npm run playwright:auth:bootstrap
```

Voir [docs/TESTING.md](docs/TESTING.md) pour le workflow complet, le miroir Linux, les fixtures et les conventions de couverture.

## Structure du dépôt

- `AGENTS.md` : guide opérationnel court pour agents IA et contributeurs.
- `public/` : frontend statique servi tel quel.
- `public/index.html` : point d’entrée principal de l’application Docs.
- `public/mobile.html` : point d’entrée mobile.
- `public/data/` : configuration statique frontend, catégories, presets et prompts.
- `public/docs/` : contenus Markdown servis au frontend.
- `public/js/` : runtime applicatif et bundles générés.
- `public/js/assist.js` : logique centrale de l’assistant, de l’import et d’une partie des flux Docs.
- `public/js/document-rag.js` : indexation et recherche locale RAG.
- `public/js/document-storage.js` : stockage local des documents.
- `public/js/document-api.js` : API frontend de manipulation des documents.
- `public/js/share-worker-client.js` : client frontend des workers de partage et sync.
- `public/sw.js` : service worker mobile/offline.
- `src/` : sources React/TypeScript compilées vers `public/js/`.
- `src/memo-bridge/index.tsx` : source du bundle `memo.bundle.js`.
- `src/draw-editor/index.tsx` : source du bundle `draw.bundle.js`.
- `workers/` : Cloudflare Workers utilisés comme proxies et backend.
- `tests/` : tests Playwright, helpers, fixtures et scripts de debug.
- `tests/helpers/` : helpers partagés pour les specs Playwright.
- `tests/fixtures/` : fichiers d’entrée réutilisables pour les tests.
- `tests/debug/` : scripts locaux de debug et repro.
- `tests/results/` : artefacts locaux d’exécution Playwright.
- `scripts/` : scripts utilitaires de build, CSP, versioning et Playwright.
- `playwright.config.ts` : configuration Playwright du projet.
- `.tmp/` : artefacts runtime locaux temporaires.

## Fichiers à garder à la racine

Ces fichiers doivent rester faciles à trouver et sont consommés directement par les outils :

- `package.json`
- `package-lock.json`
- `playwright.config.ts`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `tsconfig.json`
- `.env.local`

## Quand ouvrir les autres docs

- Architecture stockage, sync, cloud, partage :
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

- Sécurité frontend, CSP, auth, règles de partage :
  [docs/SECURITY.MD](docs/SECURITY.MD)

- Playwright, repro, couverture et workflow WSL :
  [docs/TESTING.md](docs/TESTING.md)
