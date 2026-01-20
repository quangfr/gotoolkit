# GoToolkit

Boîte à outils 100 % navigateur conçue pour les consultants. GoToolkit combine rédaction intelligente, schémas dynamiques et analyse de données avec une approche "Private by Design" : vos données et votre IA restent locales.

## 🚀 Modules Principaux

- **Mémo** : Espace de rédaction Markdown enrichi. Supporte les diagrammes Mermaid (IA assistée), l'édition par sélection et le RAG (Retrieval-Augmented Generation) pour discuter avec vos propres documents.
- **Grid** : Générateur de tableaux structurés (AG Grid). Idéal pour les mappings de données, les structures d'APIs et la génération de jeux de données fictifs via l'IA.

## 🧠 L'Assistant (Assist)

L'Assist est votre compagnon IA intégré, capable de puiser dans votre base de connaissances locale :
- **RAG Local** : Importez vos fichiers (PDF, Word, Excel, JSON, etc.). Ils sont indexés dans votre navigateur (IndexedDB) et ne quittent jamais votre machine.
- **Modes Explorer & Demander** : Choisissez entre une recherche sourcée dans vos documents ou une génération libre.
- **Outils Dédiés** : Suggérer des idées, Éditer une sélection, ou Dessiner des schémas Mermaid.
- **Transcription Vocale** : Dictée en temps réel via AssemblyAI.

## ⚡️ Super-pouvoirs
GoToolkit n'est pas qu'un éditeur, c'est un levier méthodologique pour :
- **Structurer la pensée** : Passer de l'idée brute au schéma structuré.
- **Accélérer les livrables** : Générer des bases solides de documentation ou de mappings techniques.
- **Concevoir orienté données** : Faciliter la manipulation de structures complexes.

## 🛠 IA et Backends
- **Moteurs supportés** : OpenRouter (recommandé), OpenAI.
- **Confidentialité** : Les clés API et les données indexées sont stockées uniquement dans le `localStorage` et l' `IndexedDB` de votre navigateur.
- **RAG Architecture** : Utilise Transformers.js pour les embeddings on-device (all-MiniLM-L6-v2) et une recherche vectorielle locale.

## 🏗 Structure du Projet
- **Frontend** : Site statique dans `public/`. HTML/JS/CSS natif pour une performance maximale et une portabilité totale.
- **Bridges React** : Ponts spécialisés dans `src/` (Excalidraw pour les schémas, Tiptap pour le Mémo) bundlés via esbuild.
- **Workers Cloudflare** : Proxies légers dans `workers/` pour la gestion des clés API, le partage de documents et le feedback.

## 🚦 Démarrage Rapide

### Installation
```bash
npm install
```

### Développement
```bash
# Lance le build en mode watch et le serveur local (F5 dans VS Code)
npm run dev
```

### Build de production
```bash
npm run build
```

## 📦 Déploiement
- Le dossier `public/` peut être servi par n'importe quel hébergeur statique (Vercel, Netlify, GitHub Pages).
- **Anti-cache** : Le projet utilise des cache-busters (`?v=...`). Veillez à incrémenter la version dans `package.json` et les fichiers HTML avant de déployer.

---
_GoToolkit est un projet "Browser-only" — Vos données vous appartiennent._

