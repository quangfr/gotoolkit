# Module Assist

Ce document décrit de manière métier le cheminement des connaissances lorsque la sidebar de chat répond à l’utilisateur. L’objectif : orchestrer la recherche dans les documents, fournir un contexte pertinent à l’IA et afficher des références exploitables.

## 1. Rassembler et préparer les connaissances
- Les documents disponibles (notes, uploads, pièces jointes) sont inspectés pour en extraire des fragments indexables : nom, description courte, source. Cette préparation permet d’avoir immédiatement sous la main les données à mobiliser sans relancer de longue analyse.
- L’application garde ces résultats en mémoire afin de les réutiliser tout au long de la conversation, sans multiplier les requêtes vers le stockage.

## 2. Filtrer ce qui compte pour la question
- Dès que l’utilisateur envoie une question, la sidebar évalue la longueur de la requête pour choisir une profondeur de recherche : plus la question est longue, plus elle resserre le nombre de fragments (`topK` : 18, 14, 10, 8 ; `minScore`: 0.05, 0.08, 0.1, 0.12).
- Les fragments retournés sont classés (méthodes, outils, contexte, pièces jointes) puis fusionnés entre recherche vectorielle et mots-clés afin de garder entre 6 et 10 fragments les plus probables pour la réponse.

## 3. Composer le contexte adressé à l’IA
- Le prompt envoyé à l’IA commence par les instructions système, ajoute la question de l’utilisateur, puis insère les blocs `KNOWLEDGE` et `CONTEXT` construits à partir des fragments retenus.
- Chaque bloc `KNOWLEDGE/CONTEXT` ne transmet que des lignes JSON structurées : identifiant de chunk, document associé, extrait textuel. Les autres sections peuvent rester en langage lisible lorsque cela aide à comprendre le contexte.
- Ces mêmes fragments sont stockés avec la réponse en attente pour pouvoir lier plus tard les références à leur source concrète.

## 4. Afficher la réponse et les références
- Le flux d’IA est traité dès qu’il arrive : les fragments cités, les suggestions et le contenu sont alignés au format attendu, ce qui permet d’afficher immédiatement une réponse même partielle (“streaming”) avec les références associées.
- La réponse finale est désencapsulée pour s’assurer que `answer.content`, `references` et `suggestions` prennent la forme attendue, puis elle est enregistrée pour que l’historique reste cohérent.

## 5. Explorer un document depuis une référence
- Lorsque l’utilisateur clique sur une référence, la sidebar retrouve le document correspondant (via cache ou gestionnaire) et récupère la suite de chunks liés.
- Les morceaux sont réorganisés pour restituer le document dans l’ordre, sans répéter les chevauchements : chaque chunk se colle au précédent, le texte circule sur une seule ligne et le surlignage ne touche que la portion visible concernée.
- La prévisualisation montre ainsi le document complet, taggé avec les identifiants de chunk, de façon continue et navigable.

## 6. Conserver l’expérience entre les sessions
- Largeur du volet, mode ouvert/fermé, preset choisi et conversation sont sauvegardés côté utilisateur pour rouvrir la session dans le même état.
- Les indicateurs de documents, les statistiques et les index s’ajustent au fil des uploads, mais la logique RAG garde une réponse crédible même lorsque l’accès aux documents est momentanément indisponible.
