# Go-Toolkit — Documentation technique du RAG

## 1) Objectif & périmètre
Ce document décrit le fonctionnement **RAG** (Retrieval Augmented Generation) utilisé dans **Mémo + Assist** :
- ingestion des documents,
- indexation locale (vecteurs + mots-clés),
- récupération des passages pertinents,
- intégration dans les prompts IA.

Ce flux est **local-first** : la base de connaissances est stockée dans IndexedDB, côté navigateur. Des appels externes ne sont faits que pour l’OCR et la transcription audio/vidéo.

---

## 2) Glossaire (rapide)
- **Document** : fichier importé (PDF, DOCX, CSV, etc.) ou média transcrit.
- **Chunk** : portion de texte issue d’un document, utilisée pour l’indexation vectorielle.
- **Embedding** : vecteur numérique (384 dimensions) représentant un chunk.
- **RAG** : stratégie d’IA qui récupère des passages pertinents avant de générer une réponse.
- **ConversationId** : séparation logique des index (mémoire globale vs conversation/assist).
- **Memo context** : liens entre documents et un mémo spécifique.

---

## 3) Architecture globale du RAG
Le pipeline RAG se déroule en 4 étapes :

1. **Ingestion** (import)
	- validation du fichier,
	- extraction/ocr/transcription,
	- chunking.
2. **Indexation**
	- embeddings (vecteurs),
	- index mots-clés.
3. **Stockage local**
	- IndexedDB dédiée (`gotoolkit-documents`).
4. **Retrieval**
	- recherche vectorielle,
	- fallback mots-clés,
	- sélection des passages.

---

## 4) Stockage IndexedDB (local)
**Base** : `gotoolkit-documents` (v6)

### Stores principaux
| Store | Rôle | Indexes |
|---|---|---|
| `documents` | Métadonnées document + config chunking | `conversationId`, `fileHash`, `memoId` |
| `chunks` | Chunks + embeddings (quantifiés) | `conversationId`, `docId`, `sourceDocId` |
| `keyword_meta` | Index mots-clés | `id` |
| `memo_context_embeddings` | Liens documents ⇄ mémo | `memoId`, `docId`, `fileHash` |

### Champs clés
- `fileHash` : déduplication stricte des fichiers.
- `docId` : identifiant d’un document ingéré.
- `sourceDocId` : réutilisation de chunks existants sans re-embedding.
- `emb` : embedding 384 dims stocké en `Int8Array` (quantifié).

---

## 5) Ingestion : formats & limites
### Documents texte
Formats : PDF, DOCX, PPTX, XLSX, JSON, CSV, TSV, TXT, MD, ODF, RTF, logs.

### Images (OCR)
Formats : PNG, JPG/JPEG, WebP, GIF, BMP, TIFF.

### Audio/vidéo (transcription)
Audio : MP3, WAV, MP4/M4A, AAC, OGG, WebM, FLAC
Vidéo : MP4, WebM, MOV, AVI (audio extrait uniquement)

### Limites (validation client)
- Média : **5 Go**, **2 h** max.
- TXT/MD : **5 Mo** max.
- JSON/CSV/TSV : **2 Mo** max.
- PDF/DOCX/ODT/RTF : **5 Mo** max.
- PPTX : **5 Mo** max.
- XLSX/ODS : **5 Mo** max.
- Images : **20 Mo** max.

---

## 6) OCR (images)
### Moteur utilisé
- **Qwen 2.5 VL** via OpenRouter : `qwen/qwen-2.5-vl-7b-instruct`.
- Requêtes en batch (jusqu’à 5 images).
- Prompt d’extraction : `GoToolkitChatPrompt.PRESETS.extract`.

### Sortie OCR
- Texte brut (extraction), ensuite chunking + indexation.
- En cas d’échec : message “Traitement d'image impossible”.

---

## 7) Transcription audio/vidéo
### Pipeline AssemblyAI (proxy)
1. Upload → `/upload`
2. Demande transcription → `/transcript`
3. Polling → `/transcript/{id}`

### Options activées
- diarisation (speaker labels),
- détection langue EN/FR,
- chapitrage automatique,
- filtre de vulgarité.

### Politique de stockage
- **Import** : seul le texte transcrit est stocké dans `gotoolkit-documents`.
- **Enregistrement local (◉)** : les blobs audio/vidéo sont stockés dans `voice-recordings` (autre base).

---

## 8) Chunking & Embeddings
### Chunking
- Heuristiques par format : petits fichiers (chunks courts), formats lourds (chunks plus larges).
- Normalisation préalable : suppression d’artefacts (caractères de contrôle), nettoyage HTML/RTF, consolidation des retours ligne.
- Stratégies par type :
	- **PDF/DOCX/PPTX** : extraction page/slide/section puis regroupement en paragraphes.
	- **XLSX/CSV/TSV/JSON** : conversion en texte tabulaire (lignes/colonnes) puis segmentation par blocs logiques.
	- **TXT/MD/logs** : segmentation par sections, titres, ou blocs de lignes.
	- **OCR** : segmentation par zones d’image ou paragraphes reconstruits.
	- **Transcriptions** : segmentation par phrases/utterances.
- Chaque chunk reçoit :
	- texte normalisé,
	- métadonnées (source, page/slide/ligne si disponible),
	- identifiants (`docId`, `conversationId`, `memoId` si applicable),
	- index de position pour reconstituer l’ordre si besoin.

### Configuration de chunking
- Paramètres internes (non exposés UI) : taille cible, seuil minimal, stratégie par format.
- Objectif : maximiser la pertinence RAG tout en gardant des chunks assez courts pour la recherche vectorielle.
- Le **hash** du fichier et la configuration de chunking participent à la déduplication.

### Embeddings
- Modèle local : **Xenova/all-MiniLM-L6-v2**.
- Dimension : **384**.
- Quantification : **int8** pour réduire l’empreinte.
- Cache embeddings : stockés en IndexedDB pour réutilisation.
- Flux :
	1. génération embedding pour chaque chunk,
	2. quantification int8,
	3. insertion dans `chunks` (avec `emb` + métadonnées).
- Résilience : en cas d’échec partiel, l’import reste cohérent (chunks déjà écrits conservés).
- Optimisation : réutilisation via `sourceDocId` si un document déjà connu est ré-importé.

---

## 9) Déduplication & réutilisation
- `fileHash` identifie les doublons.
- Si un document est déjà indexé (`status=ready`), les chunks sont copiés avec `sourceDocId`.
- **Pas de re-embedding**, uniquement duplication des métadonnées.

---

## 10) Retrieval (RAG)
### Recherche vectorielle
- `vectorSearch()` :
	- création d’un embedding de la requête utilisateur,
	- déquantification des embeddings stockés,
	- calcul de similarité cosine.
- Seuil minimal : **0,1**.
- Top-K : **10** passages par requête.
- Résultat : liste de chunks ordonnés par score de similarité.

### Recherche mots-clés (fallback)
- `keyword_meta` fournit un pré-filtrage des chunks.
- Utilisé si la recherche vectorielle est trop faible ou ambiguë.
- Mécanisme :
	- extraction de candidats lexicaux,
	- sélection rapide d’un sous-ensemble de chunks,
	- puis scoring et filtrage.

### Portée des recherches
- Index séparé par `conversationId`.
- Mémoire **globale** vs **conversation** (Assist) : pas de mélange.
- Un prompt IA **n’indexe jamais** : il ne fait que lire l’existant.

### Assemblage des passages
- Déduplication des passages (éviter plusieurs chunks identiques).
- Conservation de métadonnées de provenance : doc, page, section, fichier.
- Les passages sont injectés au prompt sous forme de citations ou de blocs de contexte.

### Gouvernance des résultats
- Si aucun passage ne dépasse le seuil, le système peut répondre en mode “sans source”.
- La RAG reste **non bloquante** : l’IA répond même si l’index est vide.

---

## 11) Lien Mémo ↔ Contexte
Le store `memo_context_embeddings` permet de relier un ensemble de documents à un mémo précis.
- utile pour limiter le RAG au contexte d’un mémo,
- permet des suppression ciblées par mémo.

---

## 12) Cycle de vie & suppression
- Suppression d’un document : supprime `documents` + `chunks` + liens `memo_context_embeddings`.
- Les liens memo ↔ doc sont nettoyés lors des suppressions.
- Les embeddings déjà existants restent uniquement si utilisés ailleurs (via `sourceDocId`).

---

## 13) Confidentialité & réseau
- **Local-first** : indexation et stockage sur le navigateur.
- Appels externes limités à :
  - OCR (OpenRouter),
  - transcription (AssemblyAI proxy).
- Clés API stockées localement (localStorage / paramètres utilisateur).

---

## 14) Points d’entrée techniques
- `public/js/document-rag.js` — ingestion, chunking, embeddings, retrieval.
- `public/js/assist.js` — orchestration UI + import/transcription.
- `public/js/voice-transcript.js` — appels AssemblyAI.
- `public/js/ia-client.js` / `public/js/ia-config.js` — routing IA + OpenRouter.
- `public/js/document-storage.js` — gestion IndexedDB.
