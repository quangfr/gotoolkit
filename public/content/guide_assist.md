# Module Assist

Ce guide décrit comment l'assistant transforme les documents en réponses : chercher, filtrer, contextualiser et référencer.

## 1. Rassembler et préparer les connaissances
- Les sources (notes, uploads, pièces jointes) sont examinées pour extraire des fragments et leurs métadonnées. Tout reste en mémoire pour éviter de relire les fichiers à chaque question.
- Chaque texte est découpé en morceaux d’environ 360 caractères avec 120 de recouvrement. Seuls les contenus très denses restent en mode « medium » (600/210). Le mode « small » se déclenche également quand un document dépasse 80 000 caractères, 1 500 retours à la ligne, 30 puces ou 80 séparateurs de tableaux afin de limiter la redondance et préserver le budget de contexte.

## 2. Filtrer ce qui compte pour la question
- La longueur de la question pilote la profondeur de la recherche : topK diminue de 18 à 8 quand le texte s’allonge, tandis que minScore monte de 0,05 à 0,12. Les fragments sont classés (méthodes, outils, contexte, pièces jointes) puis réduits à 6‑10 résultats pertinents.
- Le moteur hybride commence par 200 candidats issus des mots-clés, puis lance une recherche vectorielle sur ces candidats (et sur l’ensemble si nécessaire) avant de fusionner les meilleurs scores. Si aucune réponse utile n’apparaît, un second essai se déclenche avec 400 candidats, un topK multiplié par 1,5 et un minScore abaissé de 0,03 (mais jamais en dessous de 0,03).

## 3. Composer le contexte adressé à l’IA
- Le prompt assemble les instructions système, la question puis deux blocs KNOWLEDGE et CONTEXT composés uniquement des fragments retenus (identifiant de chunk, document, extrait). Ces fragments restent liés à la réponse en attente pour pouvoir citer précisément la source.
- La requête vers l’IA est toujours envoyée avec une température de 1 afin de garantir un équilibre stable entre créativité et cohérence.

## 4. Afficher la réponse et les références
- Dès que la réponse arrive, les fragments cités, les suggestions et le contenu sont formatés pour rester lisibles et affichés en streaming. Le flux est désencapsulé afin que answer.content, references et suggestions correspondent aux attentes de l’utilisateur.
- La réponse finale est enregistrée avec les mêmes fragments de contexte pour conserver la traçabilité des références.

## 5. Explorer un document depuis une référence
- Quand l’utilisateur clique sur une référence, la sidebar retrouve le document (cache ou gestionnaire) et recharge la suite de chunks liés.
- Les morceaux sont réassemblés dans l’ordre, sans répéter les chevauchements : chaque chunk s’ajoute au précédent et le texte reste fluide.
- La prévisualisation restitue le document complet, avec les identifiants de chunk visibles et la sélection limitée à la portion affichée.

## 6. Base de connaissance et documents locaux
- Le compteur de documents ouvre la modal « Base de connaissance » qui liste les fichiers disponibles (local ou Web) et indique s’ils sont indexés.
- Le bouton « + Ajouter » importe un fichier local, l’intègre à l’index et affiche son origine et sa description ; le crayon permet de modifier ces métadonnées.
- Si un document local est décoché, il est retiré de l’index et n’alimente plus la recherche.
