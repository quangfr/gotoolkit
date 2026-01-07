# Module Assist

Ce guide décrit comment l'assistant transforme les documents en réponses : chercher, filtrer, contextualiser et référencer.

## 1. Rassembler et préparer les connaissances
- Les sources (notes, uploads, pièces jointes) sont examinées pour extraire des fragments et leurs métadonnées. Tout reste en mémoire pour éviter de relire les fichiers à chaque question.
- Chaque texte est découpé en morceaux d'environ 360 caractères avec 120 de recouvrement. Seuls les contenus très denses restent en mode « medium » (600/210). Le mode « small » se déclenche également quand un document dépasse 80 000 caractères, 1 500 retours à la ligne, 30 puces ou 80 séparateurs de tableaux afin de limiter la redondance et préserver le budget de contexte.

## 2. Filtrer ce qui compte pour la question
- La longueur de la question pilote la profondeur de la recherche : topK diminue de 18 à 8 quand le texte s'allonge, tandis que minScore monte de 0,05 à 0,12. Les fragments sont classés (méthodes, outils, contexte, pièces jointes) puis réduits à 6‑10 résultats pertinents.
- Le moteur hybride commence par 200 candidats issus des mots-clés, puis lance une recherche vectorielle sur ces candidats (et sur l'ensemble si nécessaire) avant de fusionner les meilleurs scores. Si aucune réponse utile n'apparaît, un second essai se déclenche avec 400 candidats, un topK multiplié par 1,5 et un minScore abaissé de 0,03 (mais jamais en dessous de 0,03).

## 3. Composer le contexte adressé à l'IA
- Le prompt assemble les instructions système, la question puis deux blocs KNOWLEDGE et CONTEXT composés uniquement des fragments retenus (identifiant de chunk, document, extrait). Ces fragments restent liés à la réponse en attente pour pouvoir citer précisément la source.
- La requête vers l'IA est toujours envoyée avec une température de 1 afin de garantir un équilibre stable entre créativité et cohérence.

## 4. Afficher la réponse et les références
- Dès que la réponse arrive, les fragments cités, les suggestions et le contenu sont formatés pour rester lisibles et affichés en streaming. Le flux est désencapsulé afin que answer.content, references et suggestions correspondent aux attentes de l'utilisateur.
- La réponse finale est enregistrée avec les mêmes fragments de contexte pour conserver la traçabilité des références.

## 5. Explorer un document depuis une référence
- Quand l'utilisateur clique sur une référence, la sidebar retrouve le document (cache ou gestionnaire) et recharge la suite de chunks liés.
- Les morceaux sont réassemblés dans l'ordre, sans répéter les chevauchements : chaque chunk s'ajoute au précédent et le texte reste fluide.
- La prévisualisation restitue le document complet, avec les identifiants de chunk visibles et la sélection limitée à la portion affichée.

## 6. Base de connaissance et documents locaux
- Le compteur de documents ouvre la modal « Base de connaissance » qui liste les fichiers disponibles (local ou Web) et indique s'ils sont indexés.
- Le bouton « + Ajouter » importe un fichier local, l'intègre à l'index et affiche son origine et sa description ; le crayon permet de modifier ces métadonnées.
- Si un document local est décoché, il est retiré de l'index et n'alimente plus la recherche.

---

# Module Canvas

`canvas.html` est la zone "slides" de GoToolkit, pensée pour transformer des notes ou idées en livrables visuels (présentations, pitch decks, plans).

## 1. Création de modules visuels
- Les utilisateurs rassemblent des blocs (textes, images, formes) pour composer des slides, puis peuvent les réorganiser librement dans l'interface statique.
- Chaque page peut fonctionner de façon autonome : on peut ouvrir `canvas.html` directement, ajouter du contenu et générer une narration visuelle à partir de la même interface que celle qui pilote le reste de l'app.

## 2. Templates & prompts
- Les modèles disponibles (depuis `public/js/prompt.js`) fournissent des suggestions de structure et des prompts pour guider la création : pitch, rapport, plan stratégique, etc.
- Les templates s'appuient sur les filtres métier et les critères définis dans `public/js/template-criteria.js`, ce qui permet de lancer une présentation avec les données et la tonalité attendues.

## 3. Export & partage
- La page exporte les slides en PPTX, PNG et JSON, facilitant la diffusion sur un canal ou l'intégration dans un document plus large.
- Les partages utilisent le même moteur (`GoToolkitShareWorker`) qui alimente les autres modules, donc un canvas partagé reste fidèle à son état (images, textes, structure).

---

# Module Draw

`draw.html` est la zone de dessin vecteur collaborative qui s'appuie sur Excalidraw via le pont `GoToolkitExcalidraw`.

## 1. L'interface Excalidraw
- Le launcher embarque Excalidraw avec un thème clair, des templates Mermaid et l'API exposée sur `window.GoToolkitExcalidraw`.
- Les utilisateurs peuvent dessiner des diagrammes, insérer des formes, et bénéficier de la conversion automatique de schémas Mermaid en éléments Excalidraw.

## 2. Templates métier
- Les gabarits proposés sont gérés dans `public/js/prompt.js` et `public/js/template-criteria.js` pour lancer immédiatement un diagramme d'architecture, de flow ou de carte mentale.
- Ces templates restent accessibles à tout moment et servent de point de départ à chaque nouveau dessin, ce qui accélère la création de visuels cohérents avec la charte GoToolkit.

## 3. Export & partage
- Les exports (PNG, SVG, JSON) restent compatibles avec le reste de la suite et peuvent être partagés via le worker avec la même logique de `canvas`, `grid` et `timeline`.

## 4. Partage et historique

- Le partage repose sur `GoToolkitShareWorker`, tout comme les autres modules : la version enregistrée comprend les métadonnées Excalidraw, ce qui permet de rouvrir un dessin exactement tel qu'il a été enregistré.
- Les drafts sont conservés dans IndexedDB (capsule-drafts) comme sur les autres modules, pour revenir sur un diagramme commencé sans le perdre.

---

# Module Grid

`grid.html` expose un tableau multi-page piloté par AG Grid, conçu pour explorer des jeux de données et générer des exports prêts à partager.

## 1. Navigation & filtres
- Les données sont présentées avec des onglets, des filtres et la possibilité de trier/zoomer pour comparer rapidement des lignes ou mettre en valeur un sujet précis.
- Les comportements sont pensés pour les utilisateurs métier : chaque onglet peut représenter une perspective (projets, clients, idées) et les filtres sont persistants.

## 2. Templates métier
- Les templates sont gérés via `public/js/template-criteria.js`, ce qui permet de sauvegarder des critères (titre, synthèse, colonnes focus) et de les réappliquer rapidement.
- Le module propose aussi de compléter un template avec une synthèse automatique, facilitant la préparation d'un rapport ou d'un partage.

## 3. Export & qualité
- L'utilisateur peut exporter le tableau au format CSV ou JSON, avec un cache automatique (`?v=2025.12.29`) pour servir les assets statiques depuis `public/js`.
- Les comportements critiques sont couverts par des tests Playwright (`tests/grid-mock.spec.ts`), garantissant que la grille se charge correctement depuis `public/grid.html`.

## 4. Partage & historique
- Comme les autres modules, le module Grid s'appuie sur le worker de partage pour générer une URL (dans la collection `grids`) qui peut être diffusée à d'autres utilisateurs.
- L'historique stocke les exports et les versions partagées dans `localStorage`, permettant de retrouver une configuration ou un critère à posteriori.

---

# Module Page d'accueil

`index.html` sert de lanceur central pour accéder aux modules Canvas, Grid, Draw, Timeline et Voice, tout en donnant une vue d'ensemble de la vision GoToolkit.

## 1. Navigation principale
- Le site liste les modules accessibles (`canvas.html`, `grid.html`, `draw.html`, `timeline.html`, `voice.html`) en conservant le cache-buster `?v=2025.12.29` pour être sûr de charger les dernières versions côté client.
- Chaque module peut être ouvert directement et reçoit automatiquement la variable `window.GO_TOOLKIT_SHARE_API_URL` pour que l'utilisateur puisse lancer des partages ou récupérer un lien simplement.

## 2. Présentation et contextes
- L'accueil expose l'idée de GoToolkit (notes, brainstorming, suivi visuel), liste les fonctionnalités clés de chaque module et oriente vers les ressources de documentation (releases, roadmap, superpowers).
- On y trouve aussi les instructions pour configurer les backends (OpenAI, WebLLM) via le panel de réglages global, ce qui garde la configuration synchronisée entre tous les modules.

## 3. Partage et évolutions
- L'index centralise les liens de partage vers `https://share.gotoolkit.workers.dev` et `https://gotoolkit.workers.dev`, et c'est depuis là qu'on voit les mises à jour de version et les nouveautés côté worker (OpenAI proxy, feedback).
- La page rappelle aussi que l'historique local (drafts/capsules/partages) vit dans `localStorage` et IndexedDB, permettant de retrouver ses contenus même après avoir fermé le navigateur.

---

# Module Mémo

`memo.html` est l'éditeur de texte riche de GoToolkit, conçu pour la prise de notes structurée et l'édition collaborative avec assistance IA intégrée.

## 1. Écriture et formatage
- L'éditeur propose un ensemble complet de formatage : titres, listes, images, tableaux, liens, souligné, barré et surligné.
- Chaque bloc de texte peut être annoté ou modifié rapidement ; le toolbar en haut reste accessible pour appliquer des styles sans lever les mains du clavier.

## 2. Révision et validation avec l'IA
- Sélectionner un bloc de texte ouvre un petit éditeur flottant qui permet de demander à l'IA de récrire, clarifier ou améliorer la passage.
- La réponse de l'IA apparaît dans la sélection avec des suggestions en jaune (à garder) ou barré (à rejeter), facilitant la validation avant de valider les modifications.

## 3. Chat & assistance contextuelle
- Un sidebar chat à droite donne accès à la base de documents et aux assistants RAG pour poser des questions ou enrichir le contenu directement dans le mémo.
- Depuis le chat, on peut aussi demander une génération de contenu qui s'insère dans le document actuel, permettant d'itérer rapidement sur la structure.

## 4. Multi-onglets & persistance
- Plusieurs mémos peuvent rester ouverts en parallèle, chacun dans un onglet ; les contenus se sauvegardent automatiquement en local.
- On peut à tout moment importer ou exporter le mémo en Markdown ou JSON, facilitant la collaboration ou l'intégration dans d'autres outils.

## 5. Export & partage
- Le mémo peut être exporté en PDF, Markdown ou JSON pour être diffusé, archivé ou intégré dans un rapport.
- Un lien de partage peut être généré via `GoToolkitShareWorker`, mettant le document en lecture seule ou permettant une collaboration en temps quasi-réel.

## 6. Marques de révision & collaboration
- Le surlignage jaune et le barré permettent de tracer les suggestions d'amélioration sans les appliquer directement, créant une piste d'audit des modifications proposées.
- Plusieurs utilisateurs peuvent contribuer à la même révision, chacun voyant les marques et pouvant valider ou refuser les changements progressivement.

---

# Module Timeline

`timeline.html` propose une frise chronologique visuelle, idéale pour raconter un projet ou un historique.

## 1. Construction de la frise
- Les données peuvent être ajoutées manuellement, importées, ou générées à partir des documents partagés. Chaque événement peut contenir un titre, une durée, des images et des métadonnées.
- Le rendu repose sur `vis-timeline` pour placer les événements sur une ligne temporelle, avec zoom, navigation et aide à l'alignement des plages.

## 2. Export & partage
- La frise peut être exportée vers XLSX, PNG ou JSON ; l'utilisateur choisit le format qui lui convient pour intégrer ou diffuser la timeline.
- Un lien de partage est généré via `GoToolkitShareWorker` sur `https://share.gotoolkit.workers.dev`, permettant de diffuser la frise complète ou la consulter dans d'autres contextes.

## 3. Intégration au reste de l'expérience
- Initialement accessible depuis la page d'accueil, la timeline garde les mêmes balises de cache `?v=2025.12.29` que les autres modules pour rester alignée avec le reste de l'application.
- Les exports s'inscrivent dans la même logique que les autres modules (Canvas, Draw, Grid) : les données restent hors ligne tant que l'utilisateur ne partage pas explicitement.

---

# Module Voice

La page `voice.html` transforme chaque conversation vocale en un canevas complet : enregistrement, transcription, speakers, résumé.

## 1. Enregistrement & streaming
- L'utilisateur déclenche l'enregistrement puis l'interface collecte le flux audio tout en affichant l'état d'écoute. L'idée est d'écrire facilement un sujet, une réunion ou un brainstorming sans toucher le clavier.
- Chaque enregistrement est envoyé à un service STT (AssemblyAI) via un proxy (workers/assemblyai-proxy) qui gère l'authentification et contourne les limites CORS.

## 2. Transcription & diarisation
- Dès la fin de l'enregistrement, une transcription s'affiche dans `voice.html`; elle est segmentée par locuteur grâce à la diarisation d'AssemblyAI et associe chaque segment à un identifiant de participant.
- La page garde un suivi par sujet/participant et permet de corriger les noms avant de générer le verbatim final.

## 3. Résumés & partage
- Le module propose des exports (texte, PDF, share) et un panneau "subjects / participants" pour structurer les résumés par thème.
- Chaque session est historisée dans la collection `voices` du système de partage et peut être réouverte ou partagée via les URL construites avec `GoToolkitShareWorker`. L'historique local conserve aussi les drafts dans IndexedDB.

## 4. Sécurité & expérience
- L'utilisateur contrôle ses données : les clés AssemblyAI sont fournies côté client, le worker ne contient aucun secret, et les quotas/RATE_LIMIT sont gérés sur la plateforme Cloudflare.
- Si l'enregistrement est interrompu ou que la transcription échoue, des messages explicites guident la reprise.
