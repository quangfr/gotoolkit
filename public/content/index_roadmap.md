## Module Assist `T1 2026`
- Indexation par fichier (sharding) `Faisable`
- Reconnaissance texte des images `À étudier`
- Transcription des fichiers audios `À étudier`

### Plan: Indexation par fichier (sharding) pour la création de chunks
Faisabilité : OUI, facilement implémentable ✓

État actuel du code
- Structure des chunks (document-rag.js:1805) : docId, id unique, conversationId, metadata, path, rawChunk, pageNumber.
- Flux d'ingestion (document-rag.js:1479) : boucle par fichier, extraction individuelle, création des chunks, embedding batch, chunkCount.
- Stockage IndexedDB (document-rag.js:1158) : chunks indexés par conversationId, documents indexés par conversationId + fileHash, keyword_meta existant.

Implémentation proposée
- Ajouter un index docId au store chunks pour retrouver rapidement les chunks d'un fichier.
- Ajouter un index composé conversationId + docId pour filtrer les embeddings par document.
- Ajouter des métadonnées de sharding dans baseEntry : shardId = docId, chunkIndices = [0, 1, 2, ...].

## Module Mémo `T1 2026`
- Insertion et prévisualisation Draw dans l'éditeur `À étudier`

## Module Grid (Le Cardinal)`T1 2026`
- Intégration de Bibliothèque et d'Assist `À planifier`

## Module Draw (Indélibile)`T1 2026`
- Ajout de Bibliothèque et d'Assist `À planifier`

## Accès ressources tiers (Polène)`À étudier`
- Fichiers Sharepoint / Outlook / OneDrive 
- Fichiers Gmail / Google Drive 

## Confidentialité des données `A étudier`
- Pseudonymisation des données sensibles envoyées et hébergées en ligne 
- Connexion à un service IA cloud ou auto-hébergé 
- Reconstruction locale suite à pseudonomisation 

## Compte en ligne sécurisé `À étudier` 
- Accès à l'espace de partage en ligne sur d’autres appareils `À planifier` 
- Quota par utilisateur pour les requêtes API `À planifier`
