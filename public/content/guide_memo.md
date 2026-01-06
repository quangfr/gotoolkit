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
