# Go-Toolkit — Guide utilisateur

## 1) Pour qui ?
Ce guide s’adresse à un(e) consultant(e) Product Owner qui veut produire vite des livrables clairs : notes de cadrage, comptes‑rendus d’ateliers, spécifications, analyses, supports de décision.
L’objectif : vous donner une prise en main fluide, orientée usage, sans jargon technique inutile.

---

## 2) Démarrer en 3 minutes
1. Depuis l’accueil, ouvrez **Mémo**.
2. Créez un document ou choisissez un **Modèle Go‑Live**.
3. Rédigez une première section, puis activez **Assist** pour accélérer la suite.

Astuce : si vous avez déjà des documents de projet (CR, backlog, études), importez‑les dès le départ pour bénéficier du mode **Explorer**.

---

## 3) Mémo : votre espace de travail principal
### 3.1 Bibliothèque locale
- La **bibliothèque locale** liste tous vos documents.
- Les documents restent stockés dans votre navigateur : pas besoin de serveur pour commencer.
- Vous pouvez ouvrir plusieurs documents en parallèle (onglets).

### 3.2 Création, édition, renommage
- **Nouveau** : crée un document vide.
- **Éditer** : changez le titre, la description et les superpouvoirs.
- **Supprimer** : supprime un document local (irréversible).

### 3.3 Modèles et publication
- **Appliquer un modèle** : sélectionnez un modèle puis cliquez **Utiliser**.
- **Publier un modèle** : renseignez votre **Prénom** (mode publication), puis cliquez **Publier**.
- **Filtres** : filtrez les modèles par superpouvoirs ou par prénom.

Exemples de modèles utiles pour un PO :
- Note de cadrage
- CR atelier de priorisation
- Spec fonctionnelle (User Stories + critères d’acceptation)
- Synthèse décisionnelle

### 3.4 Partage & export
- **Exporter** : Word, PDF, HTML, Markdown, Texte.
- **Partager** : génère un lien pour validation rapide par un client ou un sponsor.

---

## 4) Assist : l’IA qui vous fait gagner du temps
### 4.1 Ce que fait Assist
- Reformuler des passages trop longs.
- Proposer une structure claire.
- Résumer un document en 5 points.
- Générer des sections manquantes.
- Citer vos sources si vous utilisez **Explorer**.

### 4.2 Les modes principaux
- **Demander** : réponse libre (idéal pour démarrer une section).
- **Explorer** : s’appuie sur vos documents importés (réponse sourcée).
- **Suggérer** : enrichit un contenu existant.
- **Éditer** : transforme une sélection (ton, clarté, format).
- **Dessiner** : produit un diagramme Mermaid.

Nouveau : avec la dernière évolution, **Éditer** et **Suggérer** peuvent aussi s’appuyer sur la **Mémoire** (documents importés), même si les références ne sont pas citées.

### 4.3 Bon usage d’Assist
- Formulez un objectif clair : « Écris une intro de note de cadrage en 6 lignes ».
- Ajoutez un contexte : « Projet CRM, cible équipes commerciales, délai 3 mois ».
- Limitez à une demande par prompt : c’est plus rapide et plus fiable.

---

## 5) Draw : diagrammes et schémas rapides
### 5.1 Ce que Draw permet
- Créer des **diagrammes Mermaid** pour visualiser un flux.
- Représenter un parcours utilisateur, un processus, un enchaînement de décisions.

### 5.2 Exemples utiles pour un PO
- Parcours de validation (demande → contrôle → validation → exécution).
- Flux d’escalade (support niveau 1 → niveau 2 → expert).
- Séquence API / données (appel → traitement → réponse).

---

## 6) Dix cas d’usage (PO) avec Mémo + Assist
Chaque cas propose un **prompt** et un **pas à pas** pour obtenir un résultat rapide.

### 6.1 Enrichir une documentation technique
- **Prompt** : « Complète cette doc technique avec : prérequis, flux, endpoints, erreurs, exemples. »
- **Pas à pas (outil)** :
	1. Importer la doc existante (menu fichier → **Importer**) pour conversion **Markdown**.
	2. Sélectionner la section à enrichir.
	3. **Assist** → **Suggérer** avec le prompt.
	4. Intégrer les ajouts dans **Mémo**.

### 6.2 Rédiger des user stories + critères d’acceptation
- **Prompt** : « Écris 8 user stories avec critères d’acceptation pour [fonctionnalité]. »
- **Pas à pas (outil)** :
	1. Ouvrir **Mémo** → section « User stories ».
	2. **Assist** → **Demander** avec le prompt.
	3. Ajuster la granularité et les critères.

### 6.3 Générer des cas de test (happy path + edge cases)
- **Prompt** : « Propose des cas de test : happy path, erreurs, cas limites pour [feature]. »
- **Pas à pas (outil)** :
	1. Coller le besoin dans **Mémo**.
	2. **Assist** → **Suggérer**.
	3. Exporter en Markdown si besoin.

### 6.4 Spécifier un endpoint API
- **Prompt** : « Rédige la spec d’un endpoint : input, output, codes erreurs, exemples. »
- **Pas à pas (outil)** :
	1. Créer une section « API » dans **Mémo**.
	2. **Assist** → **Demander**.
	3. Compléter avec contraintes techniques.

### 6.5 Extraction depuis une note manuscrite (OCR)
- **Prompt** : « Transforme ces notes en liste d’actions + décisions. »
- **Pas à pas (outil)** :
	1. Ajouter la photo via **Mémoire** → **Ajouter** (OCR automatique).
	2. **Assist** → **Explorer** avec le prompt.
	3. Insérer le résultat dans **Mémo**.

### 6.6 Transcription vocale d’un brief audio
- **Prompt** : « Résume le brief audio en 6 points clés + questions ouvertes. »
- **Pas à pas (outil)** :
	1. Ajouter le fichier audio via **Mémoire** → **Ajouter** (transcription).
	2. **Assist** → **Explorer**.
	3. Coller la synthèse dans **Mémo**.

### 6.7 Exploiter un doc externe en RAG (réponse sourcée)
- **Prompt** : « À partir des documents, quelles contraintes techniques dois‑je respecter ? »
- **Pas à pas (outil)** :
	1. Ajouter les sources via **trombone** ou **Mémoire** → **Ajouter**.
	2. **Assist** → **Explorer**.
	3. Récupérer la réponse sourcée.

### 6.8 Convertir un livrable externe en Markdown
- **Prompt** : « Nettoie et structure ce document en sections claires. »
- **Pas à pas (outil)** :
	1. Importer le fichier via **Importer** (conversion **Markdown**).
	2. **Assist** → **Éditer** pour restructurer.
	3. Sauvegarder la version finale dans **Mémo**.

### 6.9 Compléter une matrice d’exigences (NFR)
- **Prompt** : « Propose une matrice NFR : perf, sécurité, accessibilité, RGPD, SLA. »
- **Pas à pas (outil)** :
	1. **Assist** → **Demander**.
	2. Ajouter contraintes métier/techniques.
	3. Coller la matrice dans **Mémo**.

### 6.10 Clarifier un bug report pour les devs
- **Prompt** : « Reformule ce bug : contexte, étapes, attendu, obtenu, impact. »
- **Pas à pas (outil)** :
	1. Coller le bug brut dans **Mémo**.
	2. **Assist** → **Éditer**.
	3. Partager le bloc structuré.

---

## 7) Données & stockage
- **Local‑first** : vos documents restent dans votre navigateur.
- Le partage génère un lien si la configuration est active.
- Les imports alimentent la base de connaissances pour le mode **Explorer**.

---

## 8) Import & base de connaissances (RAG)
### 8.1 À quoi sert l’import ?
L’import alimente votre **base de connaissances** pour qu’Assist puisse répondre en s’appuyant sur vos documents.
Pour un(e) PO, cela permet de :
- retrouver rapidement une décision prise en atelier,
- citer une contrainte métier issue d’un document,
- s’appuyer sur un backlog ou une étude existante.

### 8.2 Le principe en clair
1. Vous ajoutez un fichier via l’un des modes d’import.
2. Go‑Toolkit transforme le contenu en **texte** (OCR/transcription si besoin).
3. Le système **RAG** indexe les passages utiles pour enrichir les réponses d’Assist.

Plus vous importez des documents pertinents, plus Assist est fiable.

### 8.3 Les modes d’import (où, comment, à quoi ça sert)
#### A) Depuis le menu fichier (Importer)
- **Où** : Mémo → bibliothèque → **Importer**.
- **Ce que fait Go‑Toolkit** : conversion du document **en Markdown** pour le rendre éditable.
- **Intérêt** : récupérer un livrable existant et le retravailler comme un document Mémo.

#### B) Depuis la trombone dans la conversation
- **Où** : Assist → icône **trombone** dans la conversation.
- **Ce que fait Go‑Toolkit** : **indexation pour la conversation** (mémoire de chat).
- **Intérêt** : apporter un fichier pour répondre **dans le fil en cours** sans créer de document.

#### C) Depuis le bouton « Ajouter » dans Mémoire
- **Où** : panneau **Mémoire** → **Ajouter**.
- **Ce que fait Go‑Toolkit** : **indexation pour la conversation** (mémoire de chat).
- **Intérêt** : constituer un socle de sources **réutilisable** dans Assist.

### 8.4 Formats supportés (principaux)
#### Documents
PDF, DOCX, PPTX, XLSX, JSON, CSV, TSV, TXT, MD, ODF, RTF, logs.

#### Images (OCR)
PNG, JPG/JPEG, WebP, GIF, BMP, TIFF.

#### Audio / vidéo (transcription)
MP3, WAV, MP4/M4A, AAC, OGG, WebM, FLAC.

### 8.5 Limites recommandées
- Documents texte : jusqu’à **5 Mo**.
- CSV/JSON/TSV : jusqu’à **2 Mo**.
- Images : jusqu’à **20 Mo**.
- Médias : jusqu’à **5 Go** (ou ~2 h).

### 8.6 Comment Assist exploite vos sources (RAG)
Le RAG (Retrieval‑Augmented Generation) fonctionne en 3 étapes :
1. **Recherche** : Assist sélectionne les passages les plus pertinents dans vos sources.
2. **Injection** : ces passages sont ajoutés au prompt pour guider la réponse.
3. **Réponse** : l’IA rédige en s’appuyant sur ces extraits.

#### Mode Explorer
- Cherche les passages pertinents.
- Injecte ces passages dans le prompt IA.
- Affiche des **références** si disponibles.

#### Si aucune source n’est trouvée
- Assist répond quand même, mais sans citation.
- Reformuler la question peut aider.

### 8.7 OCR & transcription (automatique)
- **Images** : l’OCR extrait le texte pour l’indexation.
- **Audio/vidéo** : la transcription est transformée en texte puis indexée.
- Seul le **texte** est utilisé dans la base de connaissances.

### 8.8 Bonnes pratiques (PO)
- Importer les documents clés du projet (backlog, specs, CR, contrats).
- Préférer des documents clairs, datés, et nommés explicitement.
- Éviter les documents très longs non structurés.

### 8.9 Confidentialité & stockage
- **Local‑first** : vos sources restent dans votre navigateur.
- Les appels externes ne concernent que l’OCR ou la transcription si besoin.

### 8.10 Dépannage rapide
- **Le document n’apparaît pas en Explorer** : relancez l’import, vérifiez le format.
- **Pas de sources affichées** : reformulez la question.
- **Import lent** : découpez le fichier ou réduisez la taille.

### 8.11 Astuces avancées (pour bien l’utiliser dans Assist)
- Donnez un **objectif précis** (« Résume en 5 points », « Propose une structure »).
- Privilégiez des **questions ciblées** plutôt qu’un prompt fourre‑tout.
- Si la réponse est trop vague, **reformulez** ou précisez le périmètre.
- Groupez vos fichiers par sujet (ex : « Atelier Priorisation »).
- Utilisez **Explorer** pour des réponses sourcées.
- Après un atelier, importez le CR et demandez : « Résume les décisions clés ».

---

## 9) Dépannage rapide
- **Le bouton Publier n’apparaît pas** : renseignez **Prénom**, sortez du champ.
- **L’IA ne cite pas de source** : utilisez **Explorer** + vérifiez vos imports.
- **Un document ne s’ouvre pas** : rafraîchissez la bibliothèque.
- **Export Word/PDF échoue** : enregistrez le document puis réessayez.

---

## 10) Conseils de consultant(e) PO
- Préférez des titres explicites et datés.
- Utilisez des listes courtes pour faciliter la lecture.
- Structurez vos livrables pour une décision rapide.
- Ajoutez un diagramme quand un flux est ambigu en texte.
