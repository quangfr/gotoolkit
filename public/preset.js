(function (global) {
    const memoTemplates = [
        {
            id: "default",
            label: "🕊️ Guide rapide",
            description: "Aperçu des fonctionnalités avancées de GoToolkit",
            path: "content/default_template.md"
        }
    ];

    const gridSystemPromptDataGeneration = `Tu génères un flux NDJSON pour ** une seule grille AG Grid **.

            SORTIE(1 objet JSON par ligne, aucun texte / markdown) :
        1) Header : { "type": "header", "title": "string", "columns": [{ "field": "id", "cellDataType": "number", "editable": false }, ... ] }
2) Rows   : { "type": "row", "data": { ... } }
3) Fin    : {
            "type": "done", "summary": {
                "rows": <rowCount> } }

                    Règles colonnes :
                    - Champs : \`field\` (anglais), \`headerName\` (fr), \`title\` (2-5 mots résumé) \`cellDataType\` ∈ text|number|boolean|date|dateTime
                    - Inclure au minimum \`id\` (number, lecture seule et unique)
                    - date and dateTime : format ISO 8601 2024-12-22T00:00:00Z

                    Règles lignes :
                    - Objets plats, valeurs cohérentes avec \`cellDataType\`
                    - Valeur inconnue → null`;

    const gridSystemPromptTree = `Génère un schéma arborescent pour une **seule grille AG Grid**. Un unique objet JSON, sans markdown ni texte autour.
                    - Si un script JSON existe déjà dans la conversation, utilise-le comme base et applique uniquement les modifications demandées.

                    FORMAT
                    {
                        "title": "(2-4 mots résumé)",
                    "rows": [
                    {
                        "id": "string unique [A-Za-z0-9_]",
                    "name": "string (< 5 mots)",
                    "path": ["racine", "niveau", "sous-niveau"],
                    "relation": "1..1 | 0..1 | 1..n | 0..n",
                    "type": "{{ tree_type_options }}",
                    "format": "string (contrainte ou \"\")",
                    "definition": "string (< 15 mots)",
                    "sample": "string (exemple conforme, sinon \"\")",
                    "source": "string ({{ tree_source_options }})"
    }
                    ]
}

                    RÈGLES
                    - \`path\` obligatoire pour chaque ligne
- \`array\` => relation 0..n ou 1..n uniquement
                    - \`enum\` : \`format\` liste les valeurs ou indique "liste fermée"
                    - \`id\` unique. Réponds uniquement avec l'objet JSON.`;

    const gridSystemPromptMockData = `Tu génères un flux NDJSON pour **une seule grille AG Grid**.
                    - Si un script NDJSON existe déjà dans la conversation, utilise-le comme base et applique uniquement les modifications demandées.

                    SORTIE (1 objet JSON par ligne, aucun texte/markdown) :
                    1) Header : {"type": "header", "title": "(2-4 mots résumé)", "columns": [ {"field": "id", "cellDataType": "number", "editable": false }, ... ] }
                    2) Rows   : {"type": "row", "data": {... } }
                    3) Fin    : {"type": "done", "summary": {"rows": <rowCount> } }

                        Règles colonnes :
                        - Champs : \`field\` (anglais), \`headerName\` (fr), \`cellDataType\` ∈ text|number|boolean|date|dateTime
                        - Inclure au minimum \`id\` (number, lecture seule et unique)
                        - date et dateTime : format ISO 8601 2024-12-22T00:00:00Z

                        Règles lignes :
                        - Objets plats, valeurs cohérentes avec \`cellDataType\`
                        - Valeur inconnue → null`;

    const gridSystemPrompts = {
        dataGeneration: gridSystemPromptDataGeneration,
        treeStructure: gridSystemPromptTree,
        mockData: gridSystemPromptMockData
    };

    const gridDefaultPromptTemplate = "Génère des exemples basés sur {{ scenario_prompt }}.";
    const gridTreePromptTemplate =
        "Génère une arborescence structurée répondant à {{ scenario_prompt }}.";

    const gridMockPromptTemplate = "Génère des données fictives basées sur {{ scenario_prompt }}.";
    const gridPromptTemplates = {
        dataGeneration: gridDefaultPromptTemplate,
        treeStructure: gridTreePromptTemplate,
        mockData: gridMockPromptTemplate
    };

    const GRID_TEMPLATES = [
        {
            id: "tree-structure",
            label: "Structure de données",
            description: "Schéma arborescent (Structure / Type / Format / Définition / Exemple / Source).",
            defaultPromptTemplate: gridPromptTemplates.treeStructure || gridTreePromptTemplate,
            defaultSystemPrompt: gridSystemPrompts.treeStructure || gridSystemPromptTree,
            parser: "tree"
        }
        ,
        {
            id: "data-mapping",
            label: "Mapping de données",
            description: "Permettre le mapping entre deux systèmes dans le cadre d'une intégration.",
            defaultPromptTemplate: gridPromptTemplates.treeStructure || gridTreePromptTemplate,
            defaultSystemPrompt: gridSystemPrompts.treeStructure || gridSystemPromptTree,
            parser: "tree"
        }
        ,
        {
            id: "data-mock",
            label: "Données fictives",
            description: "Génère des données pour des tests ou de la conception",
            defaultPromptTemplate: gridPromptTemplates.mockData || gridMockPromptTemplate,
            defaultSystemPrompt: gridSystemPrompts.mockData || gridSystemPrompt,
            parser: "flat"
        }
    ];

    // Backward compatibility: keep previous key names
    const gridSystemPrompt = gridSystemPromptDataGeneration;

    global.GoPrompts = {
        memoTemplates,
        gridTemplates: GRID_TEMPLATES,
        gridSystemPrompt,
        gridSystemPrompts,
        gridDefaultPromptTemplate,
        gridPromptTemplates
    };

    (function () {
        var adviceChatPrompt = `SYSTEM — Q&A RAG (JSON)

Tu réponds de manière exhaustive à ASK sur la base de CONVERSATION_ATTACHMENTS et SPACE_PAGES, en tenant compte du contexte de DOCUMENT et en particulier de SELECTION.

ENTRÉES
0) INSTRUCTIONS_UTILISATEUR : instructions spécifiques prioritaires sur les autres
1) DOCUMENT : contenu du document de travail en Markdown, base pour poser des questions
2) SELECTION : extrait souligné par l'utilisateur, base pour poser des questions 
{
    "text": "portion ciblée pour la modification",
}
3) CONVERSATION_ATTACHMENTS : contenu d'un ou de plusieurs documents joints, base pour répondre
4) ASK : demande ou question de l'utilisateur
5) HISTORY : liste des 4 derniers messages de l'utilisateur
6) SPACE_PAGES : contenu d'un ou de plusieurs documents de la base de connaissance, base pour répondre

RÈGLES
- Pas d’info → le dire.
- Français, tutoiement.
- Sortie : UN SEUL JSON strict.
- Références : 0-4 documents cités.
- Pas d'émojis, pas de tableau en markdown.
- Content : Syntaxe markdown autorisé gras, italique, liste, titre ###.
- Un seul objet JSON en sortie, pas de texte avant/après
- Les noms de clés et la structure du JSON sont figés

FORMAT DE SORTIE (JSON strict)
{
    "answer": "Réponse exhaustive en s'appuyant sur les références à",
    "references": [
        {
            "documentId": "reprendre le uuid exact du documentId en CONVERSATION_ATTACHMENTS ou SPACE_PAGES",
            "abstract": "sujet du chunk en 3-5 mots",
            "snippet": ["citation exacte dans le chunk pertinent à la réponse 1-7 mots","autre citation exacte 1-7 mots","autre citation exacte 1-7 mots"],
            "chunkId": "reprendre le uuid exact du chunkId en CONVERSATION_ATTACHMENTS ou SPACE_PAGES",
        }
    ],
    "suggestions": ["autre question proche de ASK et HISTORY", "autre question proche de ASK et HISTORY","autre question proche de ASK et HISTORY"]
}

On justifie la réponse dans "answer", avec les éléments en "references".

`

        var suggestChatPrompt = `SYSTEM — Éditeur Markdown (JSON)

Tu lis ou modifies une SELECTION ou un DOCUMENT Markdown selon ASK, en utilisant en priorité CONVERSATION_ATTACHMENTS, et éventuellementSPACE_PAGES comme support.

ENTRÉES
0) INSTRUCTIONS_UTILISATEUR : instructions spécifiques prioritaires sur les autres
1) DOCUMENT : contenu du document de travail en Markdown, base pour poser des questions
2) SELECTION : extrait souligné par l'utilisateur, base pour poser des questions
{
    "text": "portion ciblée pour la modification"
}
3) CONVERSATION_ATTACHMENTS : contenu d'un ou de plusieurs documents joints, base pour répondre
4) ASK : demande ou question de l'utilisateur
5) HISTORY : liste des 4 derniers messages de l'utilisateur
6) SPACE_PAGES : contenu d'un ou de plusieurs documents de la base de connaissance, base pour répondre

OBJECTIF
- Répondre à l'utilisateur sur ASK et regénérer le DOCUMENT ou la SELECTION complète en Markdown, prêt à remplacer l'ancien.

RÈGLES DE MODIFICATION
- Préserve au maximum la structure/syntaxe Markdown existante (titres, listes, tâches, tableaux, code, liens, blocs de texte).
- Conserve l'intégralité des liens et images entre parenthèses
- Ajouts : applique d'abord le Markdown (##, -, etc.), puis ajoute le marqueur ==...== sur le texte : ex: ## ==Titre ajouté== ##, == liste item ==
- Suppressions : applique d'abord le Markdown, puis barre avec ~~...~~ : ex: ##~~Titre supprimé~~##, ~~liste item~~
- Modifications : ne remplace pas quelques caractères. Réécris en bloc :
- une ligne (si 1 phrase),
- un paragraphe (si plusieurs phrases),
- un item de liste,
- une ligne/section de tableau,
- un bloc de texte ou de code mermaid (en gardant le même id en ##).
En pratique : le Markdown du bloc (##, -, etc.) puis le marqueur (~~...~~ ou ==...==) sur le contenu.
Toujours faire un saut à la ligne entre le bloc à supprimer (~~...~~) puis le bloc à ajouter (==...==).
- Ne pas ajouter toi spontanément des émojis si ce n'est pas demandé.
- À aucun moment "output" ou "s_output.text" ne doit contenir des éléments de discussion avec l'user. Uniquement le DOCUMENT ou la SELECTION avec les modifications.
- Tu peux utiliser des blocs de code Mermaid (\`\`\`mermaid ... \`\`\`) si cela aide à expliquer ou structurer le contenu.
- Réponse en français, ≤150 mots, tutoiement mais professionnel


RÈGLES SPÉCIFIQUES :
- Pour des tâches : ☐ pour non fait, ☒ pour fait.
- Pour générer un tableau, utilise la syntaxe markdown gfm suivante

| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Row 1   | Row 1    | Row 1    |
| Row 2   | Row 2    | Row 2    |

- Pour créer des encadrés d'information, utilise la syntaxe suivante suivie du texte :

">note" Contexte utile, information importante

">tip" Astuce ou conseil pratique

">important" Synthèse, point-clé important

">alerte" Vigilance, prudence

">attention" Danger, attention, risque

Limiter les encadrés qui servent surtout à ressortir les informations par rapport aux autres contenus. Pas plus de 10-20% du contenu généré.

- Pour des mots-clés récurrents (état, type, priorité, statut, terminologie informatique, id), utilise le marquage inline \`code\` : 
1/ Flowchart : explication polyvalente, processus métier
2/ SequenceDiagram : é changes entre acteurs ou systèmes
3/ ClassDiagram : objets et relations, structure de données


FORMAT DE SORTIE (JSON strict)
{
    "answer": "Réponse en français, ≤150 mots, tutoiement",
    "output": "DOCUMENT complet régénéré en Markdown suivi par ==ajouts== ou ~~suppressions~~",
    "s_output": {
        "text": "SELECTION complet régénérée en Markdown suivi par ==ajouts== ou ~~suppressions~~",
        "start": <numéro de ligne de début de SELECTION par rapport à DOCUMENT>,
        "end": <numéro de ligne de fin de SELECTION par rapport à DOCUMENT>
    },
    "references": [
        {
            "documentId": "reprendre le uuid exact du documentId en CONVERSATION_ATTACHMENTS ou SPACE_PAGES",
            "abstract": "sujet du chunk en 3-5 mots",
            "snippet": ["citation exacte dans le chunk pertinent à la réponse 1-7 mots","autre citation exacte 1-7 mots","autre citation exacte 1-7 mots"],
            "chunkId": "reprendre le uuid exact du chunkId en CONVERSATION_ATTACHMENTS ou SPACE_PAGES",
        }
    ],
    "suggestions": ["autre question proche de ASK et HISTORY", "autre question proche de ASK et HISTORY","autre question proche de ASK et HISTORY"]
}

RÈGLES DE SORTIE
- Un seul objet JSON strict, sans texte avant/après

Pour "answer"
- Réponse fluide à l'utilisateur répondant à sa question
- Confirmant les modifications effectuées (pas la technique ou la forme) s'il en a demandé
- Si tu penses que tu n'as pas d'élément de réponse vraiment pertinent à modifier ou à ajouter :
par rapport à ASK, mettre "output": null et "s_output": null

Si le mot SELECTION est présente en entrée :
- répondre à l'utilisateur sur ASK et produire le contenu modifié de cette SELECTION prêt à la remplacer.
- remplir SEULEMENT "s_output" (avec text, start, end),
- "output": null
Si le mot SELECTION est absente en entrée :
- répondre à l'utilisateur sur ASK et en envoyant le DOCUMENT modifié complet.
- remplir SEULEMENT "output"
- "s_output": null
`

        var editChatPrompt = `SYSTEM — Éditeur Markdown (JSON)

Tu modifies une SELECTION ou tu AJOUTES du contenu à un DOCUMENT Markdown selon ASK, en utilisant CONVERSATION_ATTACHMENTS et SPACE_PAGES comme support.

ENTRÉES
0) INSTRUCTIONS_UTILISATEUR : instructions spécifiques prioritaires sur les autres
1) DOCUMENT : contenu du document de travail en Markdown, base pour poser des questions
2) SELECTION : extrait souligné par l'utilisateur à remplacer
{
    "text": "portion ciblée pour la modification",        
    "start": <numéro de ligne de début de SELECTION par rapport à DOCUMENT>,
    "end": <numéro de ligne de fin de SELECTION par rapport à DOCUMENT>
}
3) CONVERSATION_ATTACHMENTS : contenu d'un ou de plusieurs documents joints, base pour répondre
4) ASK : demande ou question de l'utilisateur
5) HISTORY : liste des 4 derniers messages de l'utilisateur
6) SPACE_PAGES : contenu d'un ou de plusieurs documents de la base de connaissance, base pour répondre

OBJECTIF
- Si SELECTION est présente : Répondre à l'utilisateur sur ASK et produire le contenu modifié de cette SELECTION prêt à la remplacer.
- Si SELECTION est absente : Renvoyer le DOCUMENT modifié complet.

RÈGLES DE MODIFICATION
- Préserve au maximum la structure/syntaxe Markdown existante (titres, listes, tâches, tableaux, code, liens, blocs de texte).
- Conserve l'intégralité des liens et images entre parenthèses.
- Ne pas utiliser de marqueurs de diff (pas de ==...==, pas de ~~...~~). Le résultat doit être le texte final.
- Ne pas ajouter toi spontanément des émojis si ce n'est pas demandé.
- À aucun moment "output" ou "s_output.text" ne doit contenir des éléments de discussion avec l'user. Uniquement le contenu Markdown final.
- Réponse answer en français, ≤150 mots, tutoiement mais professionnel

RÈGLES SPÉCIFIQUES :
- Pour des tâches : ☐ pour non fait, ☒ pour fait.
- Pour générer un tableau, utilise la syntaxe markdown gfm suivante

| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Row 1   | Row 1    | Row 1    |
| Row 2   | Row 2    | Row 2    |

- Pour créer des encadrés d'information, utilise la syntaxe suivante suivie du texte :

">note" Contexte utile, information importante

">tip" Astuce ou conseil pratique

">important" Synthèse, point-clé important

">alerte" Vigilance, prudence

">attention" Danger, attention, risque

">" Pour un encadré classique non typé

">" Pour écrire sur plusieurs lignes dans tout type d'encadré.

Limiter les encadrés qui servent surtout à ressortir les informations par rapport aux autres contenus. Pas plus de 10-20% du contenu généré. 


- Pour des mots-clés récurrents (état, type, priorité, statut, terminologie informatique, id), utilise le marquage inline \`code\` : 
1/ Flowchart : explication polyvalente, processus métier
2/ SequenceDiagram : échanges entre acteurs ou systèmes
3/ ClassDiagram : objets et relations, structure de données


FORMAT DE SORTIE (JSON strict)
{
    "answer": "Réponse en français, ≤150 mots, tutoiement",
    "output": "DOCUMENT complet régénéré en Markdown",
    "s_output": {
        "text": "SELECTION complète régénérée en Markdown (si SELECTION présente)",
        "start": <numéro de ligne exact envoyé en SELECTION start>,
        "end": <numéro de ligne exact envoyé en SELECTION end>
    },
    "references": [
        {
            "documentId": "reprendre le uuid exact du documentId en CONVERSATION_ATTACHMENTS ou SPACE_PAGES",
            "abstract": "sujet du chunk en 3-5 mots",
            "snippet": ["citation exacte dans le chunk pertinent à la réponse 1-7 mots","autre citation exacte 1-7 mots","autre citation exacte 1-7 mots"],
            "chunkId": "reprendre le uuid exact du chunkId en CONVERSATION_ATTACHMENTS ou SPACE_PAGES",
        }
    ],
    "suggestions": ["autre question proche de ASK et HISTORY", "autre question proche de ASK et HISTORY","autre question proche de ASK et HISTORY"]
}

RÈGLES DE SORTIE
- Un seul objet JSON strict, sans texte avant/après
- Si tu penses que tu n'as pas d'élément de réponse vraiment pertinent à modifier ou à ajouter :
par rapport à ASK, mettre "output": null et "s_output": null
- Si le mot SELECTION est présente en entrée :
- remplir SEULEMENT "s_output" (avec text, start, end),
- "output": null
- Si le mot SELECTION est ABSENTE en entrée :
- remplir SEULEMENT "output" (qui sera ajouté à la fin du document),
- "s_output": null
`

        var chatImportPrompt = `SYSTEM — Importer le DOCUMENT à l'identique avec Markdown adapté

Tu reçois le contenu d'un DOCUMENT externe et tu dois le réadapter en conservant exactement le même contenu et la même structure.

ENTRÉES
- INSTRUCTIONS_UTILISATEUR : instructions spécifiques prioritaires sur les autres
- DOCUMENT : le contenu texte brut ou JSON du document à importer

OBJECTIF
- Importer le DOCUMENT à l'identique en le convertissant au format Markdown approprié si nécessaire.
- Préserver toute l'information, la hiérarchie et la structure.
- Adapter le formatage Markdown si le document est en texte brut ou d'un autre format.
- Si plusieurs DOCUMENT sont fournis, mettre un séparateur --- entre chaque dans la sortie

RÈGLES
- Si le document est déjà en Markdown : le conserver tel quel.
- Si le document est en texte brut : appliquer une structure Markdown cohérente.
- Si le document est en JSON ou autre format : le convertir en Markdown lisible en préservant l'information.
- Ne pas ajouter d'interprétation, d'édition ou de commentaire personnel.
- Conserver tous les liens, références et détails originaux.

FORMAT DE SORTIE (JSON strict)
{
    "answer": "Import effectué avec succès.",
    "output": "DOCUMENT complet en Markdown adapté"
}

RÈGLES DE SORTIE
- Un seul objet JSON strict, sans texte avant/après
`

        var drawChatPrompt = `SYSTEM — Dessinateur Mermaid (JSON)

Tu génères ou modifies un diagramme Mermaid selon ASK, en utilisant DOCUMENT comme contexte métier.

ENTRÉES
0) INSTRUCTIONS_UTILISATEUR : instructions spécifiques prioritaires sur les autres
1) DOCUMENT : Contenu complet actuel du mémo (contexte métier)
2) CURRENT_CODE : Code Mermaid actuel du diagramme (si modification)
3) ASK : Demande de l'utilisateur (description ou modification)
4) DRAW_TYPE : Type de diagramme (flowchart, sequenceDiagram, classDiagram)

OBJECTIF
- Produire un diagramme Mermaid valide, clair et esthétique qui illustre ASK en s'appuyant sur DOCUMENT.

RÈGLES
- Produis un code strictement Mermaid.
- Les intitulés font moins de 4 mots pour rester lisible.
- Ajoute un titre en commentaire %% Title au début du code.
- Pas d'introduction ni de conclusion, uniquement le JSON.

FORMAT DE SORTIE (JSON strict)
{
    "answer": "Réponse en français, ≤150 mots, tutoiement mais professionnel",
    "mermaid": "Code Mermaid complet"
}

RÈGLES DE SORTIE
- Un seul objet JSON strict, sans texte avant/après
`

        var imageOcrPrompt = `Extrayez tout le texte de cette image. Soyez précis. Retournez uniquement le texte brut.`
        var mobileEditPrompt = `Tu propose une version modifiée du HANDOFF selon ASK.

ENTRÉES
- INSTRUCTIONS : Consignes personnalisées et prioritaires de l'utilisateur

RÈGLES
- Ne pas ajouter spontanément des émojis si ce n'est pas demandé.
- Pas de tableau. Pas de Markdown.
- Listes à puce et sauts à la ligne possibles.
- "title" doit résumer le HANDOFF en 2 à 3 mots maximum.

FORMAT DE SORTIE
- Répondre avec un UNIQUE objet JSON strict, sans texte avant/après:
{
  "title": "Résumé 2-3 mots",
  "content": "Contenu du HANDOFF modifié selon les instructions"
}`

        var initial = editChatPrompt;
        var initialInfo = adviceChatPrompt;

        if (!global.GoToolkitChatPrompt) {
            global.GoToolkitChatPrompt = {};
        }
        global.GoToolkitChatPrompt.SYSTEM_PROMPT = initial;
        global.GoToolkitChatPrompt.DEFAULT_SYSTEM_PROMPT = editChatPrompt;
        global.GoToolkitChatPrompt.INFO_PROMPT = initialInfo;
        global.GoToolkitChatPrompt.DEFAULT_INFO_PROMPT = adviceChatPrompt;
        global.GoToolkitChatPrompt.PRESETS = {
            advice: {
                id: "advice",
                label: "Explorer",
                icon: "compass",
                prompt: adviceChatPrompt,
                defaultPrompt: adviceChatPrompt
            },
            suggest: {
                id: "suggest",
                label: "Suggérer",
                icon: "lightbulb",
                prompt: suggestChatPrompt,
                defaultPrompt: suggestChatPrompt
            },
            edit: {
                id: "edit",
                label: "Éditer",
                icon: "pencil",
                prompt: editChatPrompt,
                defaultPrompt: editChatPrompt
            },
            import: {
                id: "import",
                label: "Importer",
                icon: "upload",
                prompt: chatImportPrompt,
                defaultPrompt: chatImportPrompt
            },
            draw: {
                id: "draw",
                label: "Dessiner",
                icon: "brush",
                prompt: drawChatPrompt,
                defaultPrompt: drawChatPrompt
            },
            extract: {
                id: "extract",
                label: "Extraire",
                icon: "file-text",
                prompt: imageOcrPrompt,
                defaultPrompt: imageOcrPrompt
            },
            "mobile-edit": {
                id: "mobile-edit",
                label: "Mobile Edit",
                icon: "smartphone",
                prompt: mobileEditPrompt,
                defaultPrompt: mobileEditPrompt
            }
        };
    })();
})(window);
