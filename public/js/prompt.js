(function (global) {
    const memoTemplates = [
        {
            id: "default",
            label: "🕊️ Générique",
            description: "Structure de base pour démarrer un mémo",
            markdown:
                "# Mémo — Guide rapide\n" +
                "\n" +
                "## Mise en forme\n" +
                "- **Gras**, *italique*, ~~barré~~, `code` (tous les styles Markdown standard fonctionnent dans l’éditeur).\n" +
                "- ==Surligné== : utilise-le pour marquer les ajouts IA, puis supprime ou garde selon la relecture.\n" +
                "- Liens : [GoToolkit](https://gotoolkit.workers.dev) ou vers tout document de référence.\n" +
                "\n" +
                "### Listes\n" +
                "- Utilise des puces (-) pour les idées, et complète chaque item par 1–2 phrases contextuelles.\n" +
                "- Pour les workflows, préférer des listes numérotées (1., 2., 3.) avec action-clé associée.\n" +
                "\n" +
                "### Tâches (cases à cocher)\n" +
                "- [ ] Mentionne le responsable et l'échéance sur la même ligne pour garder la traçabilité.\n" +
                "- [x] Ajoute un commentaire sur le résultat ou le suivi afin de capitaliser sur les actions closes.\n" +
                "\n" +
                "## Tableaux\n" +
                "| Sujet | Statut | Priorité | Détails |\n" +
                "| --- | --- | --- | --- |\n" +
                "| Rédaction | En cours | Haute | Définir le message clé proposé à l'équipe marketing. |\n" +
                "| Relecture | À faire | Moyenne | Vérifier les références et les liens partagés. |\n" +
                "- Ajoute une colonne « Détails » ou « Prochaines étapes » pour expliciter le suivi.\n" +
                "- Tu peux imbriquer un mini-tableau ou une liste dans une cellule si ça apporte de la clarté.\n" +
                "\n" +
                "## Citations\n" +
                "> La simplicité est la sophistication suprême.\n" +
                "> — Léonard de Vinci\n" +
                "- Pour indiquer le contexte, ajoute un second paragraphe en italique (ex : *Retours de l’atelier du 05/01*).\n" +
                "\n" +
                "## Bloc de code\n" +
                "```js\n" +
                "const message = 'Hello';\n" +
                "console.log(message);\n" +
                "// Utilise des commentaires dans le bloc pour expliquer les choix techniques.\n" +
                "```\n" +
                "\n" +
                "## IA — mode édition (sélection ou document)\n" +
                "- **Sélection** : sélectionne du texte puis demande une modification (l'IA renvoie seulement la sélection).\n" +
                "- **Document complet** : ne sélectionne rien si tu veux une réécriture globale.\n" +
                "- L'IA marque les **ajouts** avec ==...== et les **suppressions** avec ~~...~~.\n" +
                "- Tu peux **garder** le résultat ou **annuler** (notamment en sélection).\n" +
                "- Ajoute des documents en **contexte** pour aider l'IA (brief, specs, notes...).\n"
        }
    ];

    const canvasTemplates = [
        {
            id: "roadmap",
            name: "🗺️ Roadmap",
            label: "Planifie maintenant, bientôt, plus tard",
            defaultTitle: "Roadmap",
            description:
                "Planifie maintenant, bientôt, plus tard.\n" +
                "☐ Temporalité\n" +
                "☐ Objectifs\n" +
                "☐ Moyens\n" +
                "☐ Indicateurs",
            columns: [
                { stage: "first-col", label: "Maintenant" },
                { stage: "second-col", label: "Prochainement" },
                { stage: "third-col", label: "Plus tard" }
            ],
            sections: [
                {
                    key: "objectif",
                    label: "Objectif",
                    examples: ""
                },
                {
                    key: "moyens",
                    label: "Moyens",
                    examples: ""
                },
                {
                    key: "indicateurs",
                    label: "Indicateurs",
                    examples: ""
                }
            ]
        },
        {
            id: "arbitrage",
            name: "⚖️ Arbitrage",
            label: "Comparer pour et contre clairement",
            defaultTitle: "Arbitrage",
            description:
                "Comparer pour et contre clairement.\n" +
                "☐ Décisions\n" +
                "☐ Données\n" +
                "☐ Fonctionnalités\n" +
                "☐ Ergonomie",
            columns: [
                { stage: "first-col", label: "Pour" },
                { stage: "second-col", label: "Contre" },
                { stage: "third-col", label: "Synthèse" }
            ],
            sections: [
                {
                    key: "donnees",
                    label: "Données",
                    examples: ""
                },
                {
                    key: "fonctionnalites",
                    label: "Fonctionnalités",
                    examples: ""
                },
                {
                    key: "ergonomie",
                    label: "Ergonomie",
                    examples: ""
                }
            ]
        },
        {
            id: "comparaison",
            name: "🆚 Comparaison",
            label: "Choisir entre options et solutions",
            defaultTitle: "Comparaison",
            description:
                "Choisir entre options et solutions.\n" +
                "☐ Choix\n" +
                "☐ Solutions\n" +
                "☐ Fonctionnalités\n" +
                "☐ Avantages\n" +
                "☐ Inconvénients\n",

            columns: [
                { stage: "first-col", label: "Choix 1-2-3" },
                { stage: "second-col", label: "Fonctionnalité 1-2-3" },
                { stage: "third-col", label: "Solution 1-2-3" }
            ],
            sections: [
                {
                    key: "solutions",
                    label: "Solutions",
                    examples: ""
                },
                {
                    key: "avantages",
                    label: "Avantages",
                    examples: ""
                },
                {
                    key: "inconvenients",
                    label: "Inconvénients",
                    examples: ""
                }
            ]
        },
        {
            id: "evaluation",
            name: "📈 Évaluation",
            label: "Qualifier impact et effort par initiative",
            defaultTitle: "Évaluation",
            description:
                "Qualifier impact et effort par initiative.\n" +
                "☐ Initiative\n" +
                "☐ Impact\n" +
                "☐ Effort\n" +
                "☐ Choix\n" +
                "☐ Fonctionnalités\n" +
                "☐ Solutions",
            columns: [
                { stage: "first-col", label: "Choix 1-2-3" },
                { stage: "second-col", label: "Fonctionnalité 1-2-3" },
                { stage: "third-col", label: "Solution 1-2-3" }
            ],
            sections: [
                {
                    key: "initiative",
                    label: "Initiative",
                    examples: ""
                },
                {
                    key: "impact",
                    label: "Impact",
                    examples: ""
                },
                {
                    key: "effort",
                    label: "Effort",
                    examples: ""
                }
            ]
        },
        {
            id: "parcours",
            name: "🚶 Parcours",
            label: "Cartographier étapes, problèmes, opportunités",
            defaultTitle: "Parcours",
            description:
                "Cartographier étapes, problèmes, opportunités.\n" +
                "☐ Étapes\n" +
                "☐ Problématique\n" +
                "☐ Opportunités\n" +
                "☐ Temporalité",
            columns: [
                { stage: "first-col", label: "Étape 1-2-3" },
                { stage: "second-col", label: "Problématique 1-2-3" },
                { stage: "third-col", label: "Opportunité 1-2-3" }
            ],
            sections: [
                {
                    key: "debut",
                    label: "Début",
                    examples: ""
                },
                {
                    key: "intermediaire",
                    label: "Intermédiaire",
                    examples: ""
                },
                {
                    key: "fin",
                    label: "Fin",
                    examples: ""
                }
            ]
        },
        {
            id: "alignement",
            name: "🤝 Alignement",
            label: "Aligner acteurs, besoins et contraintes",
            defaultTitle: "Alignement",
            description:
                "Aligner acteurs, besoins et contraintes.\n" +
                "☐ Acteurs\n" +
                "☐ Besoins\n" +
                "☐ Contraintes\n" +
                "☐ Business\n" +
                "☐ Tech\n" +
                "☐ UX",
            columns: [
                { stage: "first-col", label: "Acteur 1-2-3" },
                { stage: "second-col", label: "Besoin 1-2-3" },
                { stage: "third-col", label: "Contrainte 1-2-3" }
            ],
            sections: [
                {
                    key: "business",
                    label: "Business",
                    examples: ""
                },
                {
                    key: "tech",
                    label: "Tech",
                    examples: ""
                },
                {
                    key: "ux",
                    label: "Expérience Utilisateur",
                    examples: ""
                }
            ]
        },
        {
            id: "priorisation",
            name: "🎯 Priorisation",
            label: "Prioriser initiatives dans le temps",
            defaultTitle: "Priorisation",
            description:
                "Prioriser initiatives dans le temps.\n" +
                "☐ Temporalité\n" +
                "☐ Initiative\n" +
                "☐ Impact\n" +
                "☐ Effort\n",
            columns: [
                { stage: "first-col", label: "Court terme" },
                { stage: "second-col", label: "Moyen terme" },
                { stage: "third-col", label: "Long terme" }
            ],
            sections: [
                {
                    key: "initiative",
                    label: "Initiative",
                    examples: ""
                },
                {
                    key: "impact",
                    label: "Impact",
                    examples: ""
                },
                {
                    key: "effort",
                    label: "Effort",
                    examples: ""
                }
            ]
        },
        {
            id: "decision",
            name: "🔎 Observation",
            label: "Observer données et conclure simplement",
            defaultTitle: "Observation",
            description:
                "Observer données et conclure simplement.\n" +
                "☐ Hypothèses\n" +
                "☐ Données\n" +
                "☐ Insights\n" +
                "☐ Décision",
            columns: [
                { stage: "first-col", label: "Hypothèse 1-2-3" },
                { stage: "second-col", label: "Donnée 1-2-3" },
                { stage: "third-col", label: "Insight 1-2-3" }
            ],
            sections: [
                {
                    key: "quantitatif",
                    label: "Quantitatif",
                    examples: ""
                },
                {
                    key: "qualitatif",
                    label: "Qualitatif",
                    examples: ""
                },
                {
                    key: "synthese",
                    label: "Synthèse",
                    examples: ""
                }
            ]
        },
        {
            id: "default",
            name: "🕊️ Générique",
            label: "Modèle générique pour structurer tes idées",
            defaultTitle: "Générique",
            description:
                "Modèle générique pour structurer tes idées.\n",
            columns: [
                { stage: "first-col", label: "Colonne 1" },
                { stage: "second-col", label: "Colonne 2" }
            ],
            sections: [
                {
                    key: "first-section",
                    label: "Section 1",
                    examples: ""
                },
                {
                    key: "second-section",
                    label: "Section 2",
                    examples: ""
                }
            ]
        }
    ];

    // Remove unused `examples` keys and generate a per-template bottom placeholder.
    // This keeps the source objects tidy at runtime and provides a custom
    // placeholder/tooltip for the bottom (synthèse) textarea based on the
    // template description and section labels.
    canvasTemplates.forEach(template => {
        if (Array.isArray(template.sections)) {
            template.sections.forEach(section => {
                if (Object.prototype.hasOwnProperty.call(section, "examples")) {
                    delete section.examples;
                }
            });
        }
        const sectionLabels = (template.sections || []).map(s => s.label).filter(Boolean).join(', ');
        const firstSentence = (template.description || '').split(/[\.\?\!]/)[0] || template.name || '';
        template.bottomPlaceholder = (
            `• ${firstSentence} \n• Résume les ${sectionLabels} en 1–2 bullets concis (<15 mots).`
        ).trim();
    });

    const canvasExamples = {
        roadmap: {
            "first-col": {
                objectif:
                    "• Décrire l’objectif immédiat à sécuriser (ex : stabiliser, corriger, clarifier).\n" +
                    "• Préciser le résultat concret attendu dans les prochaines semaines.",
                moyens:
                    "• Lister les actions opérationnelles déjà décidées ou faciles à lancer.\n" +
                    "• Indiquer les ressources disponibles tout de suite (équipe, budget, temps).",
                indicateurs:
                    "• Noter 2–3 indicateurs simples à suivre dès maintenant.\n" +
                    "• Exemples : bugs, satisfaction, délais, usage quotidien."
            },
            "second-col": {
                objectif:
                    "• Formuler les objectifs des prochains chantiers à engager.\n" +
                    "• Exemples : étendre une fonctionnalité, adresser une dette, ouvrir un nouveau use case.",
                moyens:
                    "• Lister moyens à préparer pour ces chantiers (compétences, outils, cadrage).\n" +
                    "• Mentionner dépendances clés à lever avant de démarrer.",
                indicateurs:
                    "• Définir 2–3 indicateurs de progression pour ces prochains chantiers.\n" +
                    "• Exemples : adoption d’une feature, réduction de dette, amélioration de performance."
            },
            "third-col": {
                objectif:
                    "• Décrire les paris ou ambitions long terme (vision à 12–24 mois).\n" +
                    "• Exemples : repositionnement produit, nouvelle offre, changement d’échelle.",
                moyens:
                    "• Noter les briques à construire pour rendre ces paris possibles.\n" +
                    "• Exemples : socles techniques, nouvelles expertises, partenariats stratégiques.",
                indicateurs:
                    "• Identifier quelques signaux faibles qui diront que le pari prend.\n" +
                    "• Exemples : nouveaux segments adressés, croissance durable, maturité organisationnelle."
            }
        },
        arbitrage: {
            "first-col": {
                donnees:
                    "• Lister les données objectives qui soutiennent ce POUR.\n" +
                    "• Exemples : volumes, usages, retours clients positifs, benchmarks marché.",
                fonctionnalites:
                    "• Décrire les fonctionnalités renforcées ou rendues possibles si on choisit cette option.\n" +
                    "• Exemples : simplification du parcours, couverture d’un besoin clé.",
                ergonomie:
                    "• Noter les bénéfices UX attendus si on tranche en faveur de cette option.\n" +
                    "• Exemples : moins d’étapes, interface plus lisible, charge cognitive réduite."
            },
            "second-col": {
                donnees:
                    "• Lister les données qui freinent ou questionnent cette option.\n" +
                    "• Exemples : faible usage, coûts élevés, risques techniques identifiés.",
                fonctionnalites:
                    "• Noter les fonctionnalités perdues, dégradées ou rendues plus complexes.\n" +
                    "• Exemples : parcours cassés, scénarios non couverts, cas limites mal gérés.",
                ergonomie:
                    "• Décrire les impacts négatifs sur l’ergonomie si on suit cette voie.\n" +
                    "• Exemples : écrans surchargés, interactions confuses, effort utilisateur accru."
            },
            "third-col": {
                donnees:
                    "• Résumer les 2–3 données clés qui orientent la décision.\n" +
                    "• Préciser comment elles arbitrent entre Pour et Contre.",
                fonctionnalites:
                    "• Synthétiser le compromis fonctionnel retenu.\n" +
                    "• Exemples : fonctionnalités maintenues, mises en attente ou abandonnées.",
                ergonomie:
                    "• Poser la position finale côté UX (acceptables vs inacceptables).\n" +
                    "• Exemples : concessions assumées, points à surveiller ou à itérer plus tard."
            }
        },
        comparaison: {
            "first-col": {
                description:
                    "• Décrire brièvement chaque choix (A/B/C) et son positionnement.\n" +
                    "• Préciser pour qui il est pensé et dans quel contexte.",
                avantages:
                    "• Lister les principaux atouts de chaque choix.\n" +
                    "• Exemples : valeur perçue, simplicité, différenciation, rapidité d’exécution.",
                inconvenients:
                    "• Noter les limites ou risques propres à chaque choix.\n" +
                    "• Exemples : coûts, dette technique, dépendances, fragilité business."
            },
            "second-col": {
                description:
                    "• Décrire la fonctionnalité évaluée (ce qu’elle permet concrètement).\n" +
                    "• Préciser les entrées/sorties et règles clés.",
                avantages:
                    "• Lister les bénéfices concrets de la fonctionnalité.\n" +
                    "• Exemples : gain de temps, réduction d’erreurs, meilleure autonomie utilisateur.",
                inconvenients:
                    "• Identifier les zones de fragilité de la fonctionnalité.\n" +
                    "• Exemples : complexité d’usage, impact perf, maintenance lourde."
            },
            "third-col": {
                description:
                    "• Décrire la solution technique ou organisationnelle envisagée.\n" +
                    "• Préciser brièvement l’architecture ou le mode opératoire.",
                avantages:
                    "• Noter les avantages principaux de chaque solution.\n" +
                    "• Exemples : robustesse, scalabilité, alignement avec le existant.",
                inconvenients:
                    "• Lister les contraintes de chaque solution.\n" +
                    "• Exemples : coûts d’implémentation, risques, dépendances externes."
            }
        },
        evaluation: {
            "first-col": {
                initiative:
                    "• Nommer chaque choix d’initiative et le problème adressé.\n" +
                    "• Exemples : refonte module X, automatisation Y, expérimentation Z.",
                impact:
                    "• Estimer l’impact produit/biz de chaque initiative.\n" +
                    "• Exemples : +NPS, -SLA, +CA, réduction des frictions majeures.",
                effort:
                    "• Cadrer rapidement l’effort global pour chaque choix.\n" +
                    "• Exemples : taille d’équipe, complexité technique, dépendances critiques."
            },
            "second-col": {
                initiative:
                    "• Relier chaque initiative aux fonctionnalités concernées.\n" +
                    "• Exemples : écrans, APIs, parcours, back-office impactés.",
                impact:
                    "• Décrire l’impact par fonctionnalité : amélioration ou risque.\n" +
                    "• Exemples : meilleure découvrabilité, cohérence UX, dette réduite.",
                effort:
                    "• Estimer l’effort par fonctionnalité.\n" +
                    "• Exemples : refonte complète, ajustements légers, travail de fond sur la data."
            },
            "third-col": {
                initiative:
                    "• Noter la ou les solutions envisagées pour chaque initiative.\n" +
                    "• Exemples : quick fix, refonte, expérimentation contrôlée.",
                impact:
                    "• Évaluer l’impact des solutions retenues sur le système.\n" +
                    "• Exemples : stabilité, performance, capacité à évoluer.",
                effort:
                    "• Comparer l’effort des différentes solutions possibles.\n" +
                    "• Exemples : build vs buy, réemploi existant, mise en production."
            }
        },
        parcours: {
            "first-col": {
                avant:
                    "• Décrire le contexte de départ de l’utilisateur à cette étape.\n" +
                    "• Exemples : canal d’entrée, état d’esprit, informations déjà connues.",
                pendant:
                    "• Raconter ce que fait concrètement l’utilisateur à l’étape.\n" +
                    "• Exemples : actions, clics, décisions, interactions clés.",
                apres:
                    "• Noter la situation juste après cette étape.\n" +
                    "• Exemples : nouvelle information obtenue, sentiment, prochaines attentes."
            },
            "second-col": {
                avant:
                    "• Identifier les premiers signaux de problématique avant l’étape.\n" +
                    "• Exemples : incompréhensions, ralentissements, points de friction récurrents.",
                pendant:
                    "• Détailler les problèmes vécus en temps réel.\n" +
                    "• Exemples : blocages, erreurs, hésitations, allers-retours inutiles.",
                apres:
                    "• Noter les conséquences de la problématique après l’étape.\n" +
                    "• Exemples : abandon, support sollicité, contournements, frustration."
            },
            "third-col": {
                avant:
                    "• Repérer les opportunités d’amélioration en amont.\n" +
                    "• Exemples : mieux orienter, mieux informer, pré-remplir des données.",
                pendant:
                    "• Imaginer des leviers pendant l’étape.\n" +
                    "• Exemples : guidage, simplification, automatisation, feedback en direct.",
                apres:
                    "• Lister les opportunités de rebond post-étape.\n" +
                    "• Exemples : relance intelligente, recommandation, suivi personnalisé."
            }
        },
        alignement: {
            "first-col": {
                business:
                    "• Décrire le rôle business de l’acteur (sponsor, décideur, client...).\n" +
                    "• Préciser ses enjeux principaux : CA, risque, image, délais.",
                tech:
                    "• Positionner l’acteur côté tech (équipe, expert, fournisseur...).\n" +
                    "• Noter ses responsabilités et périmètre sur le système.",
                ux:
                    "• Caractériser le profil utilisateur représenté (expérience, contexte d’usage).\n" +
                    "• Exemples : novice, expert, multi-écran, mobilité."
            },
            "second-col": {
                business:
                    "• Formuler les besoins business explicites de cet acteur.\n" +
                    "• Exemples : visibilité, pilotage, conformité, croissance.",
                tech:
                    "• Décrire les besoins tech (qualité, observabilité, stabilité, intégration).\n" +
                    "• Exemples : logs, monitoring, APIs cohérentes.",
                ux:
                    "• Noter les besoins d’expérience pour cet acteur.\n" +
                    "• Exemples : confiance, clarté, rapidité, autonomie."
            },
            "third-col": {
                business:
                    "• Lister les contraintes business imposées ou subies.\n" +
                    "• Exemples : budget limité, calendrier, obligations légales.",
                tech:
                    "• Détailler les contraintes techniques structurantes.\n" +
                    "• Exemples : legacy, SLA, sécurité, dépendances fortes.",
                ux:
                    "• Identifier les contraintes UX.\n" +
                    "• Exemples : accessibilité, contraintes de device, charge mentale acceptable."
            }
        },
        priorisation: {
            "first-col": {
                initiative:
                    "• Lister les initiatives très court terme (0–3 mois).\n" +
                    "• Exemples : quick wins, corrections urgentes, petits ajustements utiles.",
                impact:
                    "• Décrire l’impact immédiat attendu.\n" +
                    "• Exemples : baisse des irritants, amélioration visible pour l’utilisateur.",
                effort:
                    "• Estimer l’effort pour ces actions rapides.\n" +
                    "• Exemples : 1 sprint, une petite squad, risque limité."
            },
            "second-col": {
                initiative:
                    "• Noter les initiatives de moyen terme (3–12 mois).\n" +
                    "• Exemples : refonte ciblée, nouveau module, socle partagé.",
                impact:
                    "• Décrire l’impact à horizon moyen.\n" +
                    "• Exemples : montée en gamme, réduction de dette, meilleure efficacité interne.",
                effort:
                    "• Estimer l’effort associé.\n" +
                    "• Exemples : plusieurs sprints, coordination inter-équipes, risques maîtrisables."
            },
            "third-col": {
                initiative:
                    "• Lister les initiatives long terme ou structurantes.\n" +
                    "• Exemples : refonte globale, pivot produit, nouvelle plateforme.",
                impact:
                    "• Qualifier les effets de long terme.\n" +
                    "• Exemples : avantage compétitif durable, nouveau business, évolution organisationnelle.",
                effort:
                    "• Évaluer l’effort lourd et les paris associés.\n" +
                    "• Exemples : investissement important, forte incertitude, dépendances multiples."
            }
        },
        decision: {
            "first-col": {
                quantitatif:
                    "• Noter les hypothèses chiffrées posées au départ.\n" +
                    "• Exemples : taux de conversion cible, volume espéré, seuil de succès.",
                qualitatif:
                    "• Décrire les hypothèses qualitatives de départ.\n" +
                    "• Exemples : motivations, freins supposés, comportements attendus.",
                synthese:
                    "• Résumer la promesse ou l’intuition initiale.\n" +
                    "• Préciser ce que l’on cherche à vérifier ou infirmer."
            },
            "second-col": {
                quantitatif:
                    "• Lister les chiffres observés (réel vs attendu).\n" +
                    "• Exemples : usages, abandons, temps, taux d’erreur.",
                qualitatif:
                    "• Noter les retours utilisateurs collectés.\n" +
                    "• Exemples : verbatim, observations, feedbacks support ou terrain.",
                synthese:
                    "• Synthétiser ce que les données disent réellement.\n" +
                    "• Exemples : hypothèse confirmée, partiellement vraie ou contredite."
            },
            "third-col": {
                quantitatif:
                    "• Isoler les chiffres qui changent la décision.\n" +
                    "• Exemples : seuils critiques dépassés, tendances claires.",
                qualitatif:
                    "• Extraire les enseignements clés des retours.\n" +
                    "• Exemples : attentes majeures, signaux faibles récurrents.",
                synthese:
                    "• Formuler l’insight actionnable issu du croisement quanti/quali.\n" +
                    "• Exemples : décision à prendre, expérience à mener, question à creuser."
            }
        },
        default: {
            "first-col": {
                "first-section":
                    "" +
                    "",
                "second-section":
                    "" +
                    "",
                "third-section":
                    "" +
                    ""
            },
            "second-col": {
                "first-section":
                    "" +
                    "",
                "second-section":
                    "" +
                    "",
                "third-section":
                    "" +
                    ""
            },
            "third-col": {
                "first-section":
                    "" +
                    "",
                "second-section":
                    "" +
                    "",
                "third-section":
                    "" +
                    ""
            }
        }
    };

    const drawDefaultPromptTemplate =
        "Sur la base de {{field_input}}, produis un code strictement mermaid\n- " +
        "sous forme d'un diagramme de {{draw_type}}.\n- " +
        "Les intitulés font moins de 4 mots.\n- " +
        "Ajoute un titre en commentaire %% Title dans la réponse.\n- " +
        "Ne fais pas d'introduction ou de conclusion, donne uniquement le bloc de code.";

    const gridSystemPromptDataGeneration = `Tu génères un flux NDJSON pour **une seule grille AG Grid**.

SORTIE (1 objet JSON par ligne, aucun texte/markdown) :
1) Header : { "type": "header", "title":"string" , "columns": [ { "field": "id", "cellDataType": "number", "editable": false }, ... ] }
2) Rows   : { "type": "row", "data": { ... } }
3) Fin    : { "type": "done", "summary": { "rows": <rowCount> } }

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
      "type": "{{tree_type_options}}",
      "format": "string (contrainte ou \"\")",
      "definition": "string (< 15 mots)",
      "sample": "string (exemple conforme, sinon \"\")",
      "source": "string ({{tree_source_options}})"
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
1) Header : { "type": "header", "title": "(2-4 mots résumé)", "columns": [ { "field": "id", "cellDataType": "number", "editable": false }, ... ] }
2) Rows   : { "type": "row", "data": { ... } }
3) Fin    : { "type": "done", "summary": { "rows": <rowCount> } }

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

    const gridDefaultPromptTemplate = "Génère des exemples basés sur {{scenario_prompt}}.";
    const gridTreePromptTemplate =
        "Génère une arborescence structurée répondant à {{scenario_prompt}}.";

    const gridMockPromptTemplate = "Génère des données fictives basées sur {{scenario_prompt}}.";
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

    const canvasDefaultPromptTemplate =
        "Sur la base de \"{{slideTitle}}\", du contexte \"{{globalContext}}\" et \"{{pageContext}}\",\n- " +
        "et dans le cadre de \"{{columnTitle}}\", reformuler \"{{fieldValue}}\"\n- " +
        "sous forme de 2 à 3 \"{{sectionTitle}}\" (un • de < 15 mots pour chaque).\n- " +
        "Sans introduction préalable ni émoji.";

    const canvasBottomPromptTemplate =
        "Sur la base du contexte \"{{globalContext}}\" et de \"{{pageContext}}\",\n- " +
        "et avec {{columnSections}}, répond à {{slideTitle}} en 2 phrases de moins de 15 mots précédés d'un •\n- " +
        "(< 15 mots pour chaque).";

    const canvasSuggestionsPromptTemplate = `
- En partant du contexte "{{globalContext}}" et en connaissant la section "{{sectionLabel}}" de {{columnSection}},
- Si {{fieldValue}} est vide, propose exactement deux conseils • de moins de 15 mots chacune, pour remplir cette saisie ; (le deuxième étant des mots clés d'exemples de réponse) ;
- Si {{fieldValue}} est rempli, suggère deux points positifs de la saisie (précédés chacun de + et commençant par un nom)
- Et suggère deux critiques constructives sur la saisie (précédés chacun de - et commençant par un verbe)
- Réponds uniquement sans autre texte ni émoji avec moins de 15 mots par point
`;

    const drawPrompts = [
        {
            id: "sequence-service",
            label: "🚶‍♂️ Happy path",
            description:
                "Tracer le scénario nominal et ses interactions clés.\n" +
                "☐ Services\n" +
                "☐ Acteurs\n" +
                "☐ User story\n" +
                "☐ Événements",
            drawType: "sequence",
            defaultScript: `%% Title: Happy Path
sequenceDiagram
    participant Client
    participant Conseiller
    participant Service
    Client->>Conseiller: Exprime un besoin
    Conseiller->>Service: Analyse la demande
    Service-->>Conseiller: Proposition validée
    Conseiller-->>Client: Présente la solution
    Client->>Conseiller: Accepte
    Conseiller->>Service: Lance l’exécution
    Service-->>Client: Livraison du service`
        },
        {
            id: "flow-bpmn",
            label: "💼 Processus métier",
            description:
                "Cartographier le processus métier et ses décisions clés.\n" +
                "☐ Étapes\n" +
                "☐ Décisions\n" +
                "☐ Événements\n" +
                "☐ Swimlanes",
            drawType: "flow",
            defaultScript: `%% Title: Processus métier — décisions clés
flowchart TD
    A[Démarrage] --> B[Réception demande]
    B --> C{Demande complète ?}
    C -- Oui --> D[Analyse métier]
    C -- Non --> E[Demande de compléments]
    E --> B
    D --> F{Décision}
    F -- Acceptée --> G[Mise en œuvre]
    F -- Refusée --> H[Clôture]
    G --> I[Fin]
    H --> I`
        },
        {
            id: "class-domaine",
            label: "🧭 Modèle métier",
            description:
                "Structurer les entités et relations du domaine.\n" +
                "☐ Entités\n" +
                "☐ Attributs\n" +
                "☐ Relations\n" +
                "☐ Agrégats",
            drawType: "class",
            defaultScript: `%% Title: Modèle métier
classDiagram
    class Client {
        nom
        besoin
    }
    class Conseiller {
        nom
        spécialité
    }
    class Service {
        libellé
        durée
    }
    class RendezVous {
        date
        lieu
    }
    Client "1" --> "0..*" RendezVous : demande
    Conseiller "1" --> "0..*" RendezVous : anime
    RendezVous "1" --> "1" Service : concerne`
        },
        {
            id: "class-api",
            label: "🔌 Objets API",
            description:
                "Lister les objets API et leurs relations.\n" +
                "☐ Endpoints\n" +
                "☐ Payloads\n" +
                "☐ Relations\n" +
                "☐ Webhooks",
            drawType: "class",
            defaultScript: `%% Title: Objets API
classDiagram
    class User {
        id
        email
        status
    }
    class Order {
        id
        date
        total
    }
    class Product {
        id
        name
        price
    }
    class Payment {
        id
        method
        state
    }
    User "1" --> "0..*" Order : places
    Order "1" --> "1..*" Product : contains
    Order "1" --> "0..1" Payment : paidBy`
        },
        {
            id: "sequence-communication",
            label: "📡 Communication inter-service",
            description:
                "Décrire les échanges et contrôles entre services.\n" +
                "☐ Authentification\n" +
                "☐ Permissions\n" +
                "☐ Validation\n" +
                "☐ Erreurs",
            drawType: "sequence",
            defaultScript: `%% Title: Communication inter-services
sequenceDiagram
    participant Frontend
    participant API
    participant ServiceA
    participant ServiceB
    Frontend->>API: Requête utilisateur
    API->>ServiceA: Validation des données
    ServiceA-->>API: OK
    API->>ServiceB: Traitement métier
    ServiceB-->>API: Résultat
    API-->>Frontend: Réponse consolidée`
        },
        {
            id: "flow-data",
            label: "📊 Flux de données",
            description:
                "Visualiser le parcours complet des données.\n" +
                "☐ Sources\n" +
                "☐ Traitements\n" +
                "☐ Stockages\n" +
                "☐ Consommateurs",
            drawType: "flow",
            defaultScript: `%% Title: Parcours des données — flux non linéaire
flowchart LR
    A[Sources données] --> B[Collecte]
    B --> C[Contrôle qualité]
    C -->|Valide| D[Transformation]
    C -->|Anomalie| E[Correction]
    E --> C
    D --> F[Stockage]
    F --> G[Exploitation]
    G -->|Analyse| D
    G -->|Diffusion| H[Restitution]`
        },
        {
            id: "class-events",
            label: "🛰️ Événements métiers",
            description:
                "Cartographier les événements métiers et leurs flux.\n" +
                "☐ Événements\n" +
                "☐ Producteurs\n" +
                "☐ Consommateurs\n" +
                "☐ Payloads",
            drawType: "flow",
            defaultScript: `%% Title: Événements métiers
flowchart TD
    E1[Événement déclencheur] --> A[Action métier]
    A --> E2[Événement intermédiaire]
    E2 --> B[Décision métier]
    B -->|Ajustement| A
    B -->|Validation| C[Exécution]
    C --> E3[Événement de sortie]
    E3 --> D[Notification]
    D --> B`
        },
        {
            id: "sequence-role",
            label: "🧰 Rôles et responsabilités",
            description:
                "Clarifier rôles, décisions et notifications clés.\n" +
                "☐ Rôles\n" +
                "☐ SLA\n" +
                "☐ Décisions\n" +
                "☐ Notifications",
            drawType: "sequence",
            defaultScript: `%% Title: Rôles et responsabilités
sequenceDiagram
    participant Collaborateur
    participant Responsable
    participant Direction
    Collaborateur->>Responsable: Formule une demande
    Responsable->>Responsable: Analyse et arbitrage
    Responsable->>Direction: Soumet la décision
    Direction-->>Responsable: Validation formelle
    Responsable-->>Collaborateur: Notification de la décision`
        },
        {
            id: "class-resources",
            label: "📦 Modèle de ressources",
            description:
                "Décrire ressources, permissions et liens associés.\n" +
                "☐ Ressources\n" +
                "☐ Permissions\n" +
                "☐ Groupes\n" +
                "☐ Liens",
            drawType: "class",
            defaultScript: `%% Title: Modèle de ressources
classDiagram
    class Utilisateur {
        id
        type
    }
    class Ressource {
        nom
        état
    }

    class Admin
    class UtilisateurSaisie
    class Systeme BI

    Utilisateur <|-- Admin
    Utilisateur <|-- UtilisateurSaisie
    Utilisateur <|-- SystemeBI

    Admin --> Ressource : valide
    UtilisateurSaisie --> Ressource : saisit
    Systeme BI --> Ressource : consulte`
        }
    ];

    const voicePrompts = [

        {
            id: "default",
            title: "🕊️ Générique",
            text:
                ".\n" +
                "☐ Informations\n" +
                "☐ Décisions\n" +
                "☐ Actions"
        },
        {
            id: "backlog-grooming",
            title: "🧹 Backlog Grooming",
            text:
                "Affiner les stories avant le sprint.\n" +
                "☐ Priorités et risques\n" +
                "☐ Clarification des critères\n" +
                "☐ Estimations ou dépendances"
        },
        {
            id: "sprint-review",
            title: "🔁 Sprint Review",
            text:
                "Partager les incréments du sprint.\n" +
                "☐ Objectifs atteints\n" +
                "☐ Démo des livrables\n" +
                "☐ Feedback et décisions"
        },
        {
            id: "feature-demo",
            title: "🎬 Feature Demo",
            text:
                "Mettre en scène une nouvelle fonctionnalité.\n" +
                "☐ Commande utilisateur\n" +
                "☐ Valeur métier\n" +
                "☐ Points de vigilance"
        },
        {
            id: "brainstorm-ux",
            title: "✨ Brainstorm UX",
            text:
                "Explorer des pistes d'expérience.\n" +
                "☐ Problème et contexte\n" +
                "☐ Variations d'interaction\n" +
                "☐ Critères de choix"
        },
        {
            id: "workshop-ux",
            title: "🧠 Workshop UX",
            text:
                "Animer un atelier collaboratif.\n" +
                "☐ Participants et rôles\n" +
                "☐ Activités et livrables\n" +
                "☐ Planning minute"
        },
        {
            id: "daily-tech",
            title: "🔧 Daily Tech",
            text:
                "Synchroniser l'équipe technique.\n" +
                "☐ Avancées\n" +
                "☐ Blocages\n" +
                "☐ Priorités du jour"
        },
        {
            id: "comite-tech",
            title: "🏛️ Comité Tech",
            text:
                "Arbitrer les sujets techniques.\n" +
                "☐ Décisions à prendre\n" +
                "☐ Impacts produit/infra\n" +
                "☐ Actions et responsables"
        },
        {
            id: "pitch-produit",
            title: "📢 Pitch produit",
            text:
                "Présenter la valeur d’un produit ou d’une release.\n" +
                "☐ Problème / besoin adressé\n" +
                "☐ Proposition de valeur\n" +
                "☐ Démo rapide / points clés\n" +
                "☐ Appel à l’action"
        },
        {
            id: "recueil-besoins",
            title: "🧾 Recueil de besoins",
            text:
                "Capturer les attentes et contraintes d’un demandeur.\n" +
                "☐ Contexte métier\n" +
                "☐ Objectifs / KPIs\n" +
                "☐ Contraintes / priorités\n" +
                "☐ Prochaines étapes"
        },
        {
            id: "entretien-candidat",
            title: "👥 Entretien candidat",
            text:
                "Structurer un entretien de recrutement.\n" +
                "☐ Parcours / réalisations\n" +
                "☐ Compétences clés\n" +
                "☐ Situations vécues\n" +
                "☐ Motivations / fit"
        },
        {
            id: "entretien-client",
            title: "🤝 Entretien client",
            text:
                "Explorer les besoins et irritants d’un client.\n" +
                "☐ Contexte et enjeux\n" +
                "☐ Problèmes rencontrés\n" +
                "☐ Attentes / priorités\n" +
                "☐ Actions / suivis"
        }
    ];

    const voiceCreateSystemTemplate = `Tu es un product owner expérimenté chargé de générer une trame de discussion pour une réunion.

Contexte utilisateur : {{scenario_prompt}}
Objectifs de la réunion : {{template_text}}

RÈGLES MÉTIER :
- subjects contient exactement 3 éléments
- keySentences contient exactement 3 phrases
- Les timeframes doivent couvrir toute la durée sans chevauchement
- Le dernier timeframe.end = duration
- Le contenu doit être adapté à une réunion professionnelle
- Ne pas mettre d'autres participants à part soi si non spécifié par l'utilisateur

⚠️ SORTIE STRICTE
- Réponds UNIQUEMENT avec un objet JSON valide
- Aucune phrase explicative, aucun markdown, aucun commentaire
- Toutes les clés sont obligatoires
- Respecte strictement les types et cardinalités

STRUCTURE ATTENDUE :

{
  "title": "string (3 à 7 mots, titre synthétique de la réunion)",
  "duration": number (durée totale estimée en minutes, entier > 0),

  "participants": [
    {
      "name": "string (prénom ou identifiant court)",
      "role": "string (rôle fonctionnel, ex: Product Owner, Dev, Client)"
    }
  ],

  "subjects": [
    {
      "title": "string (nom court du sujet, max 5 mots)",
      "keySentences": [
        {
          "text": "string (phrase clé 1, action ou décision attendue)",
          "match": "missing"
        }
      ],
      "timeframe": {
        "start": number (minute de début, >= 0), // 0 pour le premier sujet
        "end": number (minute de fin, > start) // selon l'ampleur du sujet
      }
    }
  ]
}`
        ;

    const voiceSummaryPrompt = `Tu es un assistant qui synthétise des échanges oraux en français.

Consigne :
- Résume le contenu ci-dessous en 5 phrases maximum.
- Appuie-toi sur le modèle "{{template_text}}" pour conserver uniquement l'essentiel.
- Mets en avant décisions, actions (avec responsable si présent) et points ouverts.

Transcription à résumer :
{{transcript_content}}

Réponds en texte brut, sans JSON ni balisage.`;

    const voiceCompletePrompt = `Analyse {{transcript_content}} et produis un résumé structuré de la discussion.

### Objectifs
- Identifier 3 sujets clés
- Pour chaque sujet :
  - Extraire 2 à 3 phrases clés
  - Marquer chaque phrase comme :
    - "direct" → discutée clairement / longuement
    - "indirect" → abordée brièvement
- Identifier les participants (nom + rôle déduit)
- Calculer les timestamps en secondes :
  - start du premier sujet = 0**
  - end d’un sujet = start du sujet suivant
  - end du dernier sujet = timestamp du dernier message − premier message

### Contraintes
- Répondre en JSON strict uniquement
- Aucune explication, aucun commentaire, aucun texte hors JSON

### Format attendu
\`\`\`json
{
  "title": "resume en 3-6 mots",
  "duration": "en minutes estimé à partir des timestamps",
  "participants": [
    {
      "name": "nom deduit du timestamp",
      "role": "role deduit"
    }
  ],
  "subjects": [
    {
      "title": "sujet en 1-2 mots",
      "timeframe": {
        "start": 0,
        "end": 15
      },
      "keySentences": [
        {
          "text": "point cle de 3-7 mots",
          "match": "direct"
        },
        {
          "text": "point cle de 3-7 mots",
          "match": "direct"
        }
      ]
    }
  ]
}
\`\`\``;

    const timelinePrompts = [
        {
            id: "product",
            title: "🎯 Roadmap Produit",
            text:
                "Tracer une roadmap produit avec thèmes, livrables et risques.\n" +
                "☐ Thèmes\n" +
                "☐ Livrables\n" +
                "☐ Risques\n" +
                "☐ Jalons"
        },
        {
            id: "tech",
            title: "🛠️ Roadmap Technique",
            text:
                "Planifier les phases techniques et responsabilités.\n" +
                "☐ Périmètre\n" +
                "☐ Dépendances\n" +
                "☐ Ressources\n" +
                "☐ Risques"
        },
        {
            id: "default",
            title: "🕊️ Générique",
            text:
                "Organiser des événements dans le temps.\n" +
                "☐ Actions\n" +
                "☐ Groupes\n" +
                "☐ Repères\n" +
                "☐ Types"
        },
        {
            id: "sprint",
            title: "⚡Calendrier de sprints",
            text:
                "Organiser les sprints, objectifs et dépendances.\n" +
                "☐ Objectifs\n" +
                "☐ Stories\n" +
                "☐ Équipe\n" +
                "☐ Rituels"
        },
        {
            id: "strategy",
            title: "💼 Vision stratégique",
            text:
                "Projeter la vision stratégique sur plusieurs horizons.\n" +
                "☐ Ambitions\n" +
                "☐ Initiativess\n" +
                "☐ Investissements\n" +
                "☐ Indicateurs"
        },
        {
            id: "research",
            title: "🔎 Plan de recherche",
            text:
                "Programmer la recherche, jalons et décisions clés.\n" +
                "☐ Hypothèses\n" +
                "☐ Domaines\n" +
                "☐ Études\n" +
                "☐ Résultats"
        },
        {
            id: "project",
            title: "🧩 Projet d'intégration",
            text:
                "Piloter un projet d’intégration avec phases et risques.\n" +
                "☐ Acteurs\n" +
                "☐ Phases\n" +
                "☐ Livrables\n" +
                "☐ Risques"
        },
        {
            id: "journey",
            title: "👤 Customer Journey Timeline",
            text:
                "Visualiser l’expérience utilisateur dans le temps.\n" +
                "☐ Étapes clés\n" +
                "☐ Émotions / irritants\n" +
                "☐ Points de contact\n" +
                "☐ Opportunités"
        },
        {
            id: "change-management",
            title: "🔄 Conduite du changement",
            text:
                "Piloter l’adoption et l’alignement des acteurs.\n" +
                "☐ Parties prenantes\n" +
                "☐ Messages clés\n" +
                "☐ Actions d’accompagnement\n" +
                "☐ Indicateurs d’adoption"
        },
    ];

    const timelineCreateSystemTemplate = `Tu vas aider à générer un planning précis à partir des infos fournises.

Le format du planning : 
- 1-2 types de repères \`markers\`
- 2-3 natures d'actions \`types\`
- 2-4 groupes \`groups\`
- 10-20 \`items\` d'une durée supérieure à 7 jours avec un \`kind\` de nature \`types\`
- Entre 3-5 \`items\` d'une durée inférieure ou égale à 7 jours avec un \`kind\` avec un id \`markers\` et sans \`length\`
- Pour une action \> 45 jours : la découper en items \`(P1, P2...Pn)\`.
- Entre 1–3 \`markers\`, 2–6 \`types\`, 2–4 \`groups\`, et 10–20 \`items\`. 21 jours en ajoutant dans le nom (P1, P2...Pn)


Réponds toujours uniquement avec un JSON contenant :
- \`page\` : le titre de la page courante (utilisé pour le header).
- \`timeline\` : \`{ start, end }\` pour définir la période globale.
- \`types\` : tableau \`{ id, label }\` décrivant les types d’actions (fonction, compétence, rôle...). 
- \`markers\` : tableau \`{ id, label }\` décrivant des types de repères ponctuels (étape, événement, livrable, résultat, risque...). L’id doit être différent de ceux des types.
- \`groups\` : sous la forme \`{ id, label }\` (équipe, thème, stream produit, enjeu, objectif).  
- \`items\` : sous la forme \`{ id, groupId, label, kind, start, length? }\`. Le champ \`kind\` contient l’id d’un type ou d’un marker.

Contraintes de structure :
- \`start\` au format ISO (YYYY-MM-DD).
- \`length\` exprimé en jours.

Contraintes de planification :
- Optimiser la durée totale : actions enchaînées sans pause.
- Actions parallèles possibles si cohérentes.
- Dépendances implicites obligatoirement respectées.
- Si un planning est fourni, faire les modifications demandées par l'utilisateur sur le planning existant et le renvoyer en entier.

Contraintes de nommage et quantités :
- Un seul mot pour les labels des \`types\` et \`markers\`.
- 2 à 4 mots pour les labels des \`groups\`.
- Un seul mot pour le label d'un \`markers\` ou un \`type\`.
- Entre 2-4 mots pour le label d'un \`group\`
- Les mots sont en français et adaptés au contexte utilisateur.
`;
    global.GoPrompts = {
        memoTemplates,
        canvasTemplates,
        canvasExamples,
        drawPrompts,
        drawDefaultPromptTemplate,
        gridTemplates: GRID_TEMPLATES,
        gridSystemPrompt,
        gridSystemPrompts,
        gridDefaultPromptTemplate,
        gridPromptTemplates,
        canvasDefaultPromptTemplate,
        canvasBottomPromptTemplate,
        canvasSuggestionsPromptTemplate,
        voicePrompts,
        voiceCreateSystemTemplate,
        voiceSummaryPrompt,
        voiceCompletePrompt,
        timelinePrompts,
        timelineCreateSystemTemplate
    };

    (function () {
        var adviceChatPrompt = `SYSTEM — Coach PO RAG (JSON)

Coach pragmatique pour Product Owners

ENTRÉES
1. CONTEXT : contenu d'un ou de plusieurs documents fournis en contexte
2. HISTORY : liste des 4 derniers messages de l'user
3. KNOWLEDGE : connaissances 
5. PRODUCT : connaissances générales sur la gestion de produit


RÈGLES
- Pas d’info → le dire.
- Français, ≤150 mots, tutoiement.
- Sortie : UN SEUL JSON strict.
- Références : 0-4 documents cités.
- Pas d'émojis, pas de tableau en markdown.
- Content : Syntaxe markdown autorisé gras, italique, liste, titre ###.
- Un seul objet JSON en sortie, pas de texte avant/après
- Les noms de clés et la structure du JSON sont figés

FORMAT DE SORTIE (JSON strict)
{
  "answer": "Réponse fluide à l'utilisateur issue du contexte.",
  "references": [
    {
      "documentId": "reprendre le uuid exact du documentId en CONTEXT ou KNOWLEDGE",
      "abstract": "sujet du chunk en 3-5 mots",
      "snippet": ["citation exacte dans le chunk pertinent à la réponse 1-7 mots","autre citation exacte 1-7 mots optionnelle","autre citation exacte 1-7 mots optionnelle"],
      "chunkId": "reprendre le uuid exact du chunkId en CONTEXT ou KNOWLEDGE",
    }
  ],
  "suggestions": ["thème proche de ASK et HISTORY", "thème proche de ASK et HISTORY"]
}

Réponds à ASK sur la base essentiellement de CONTEXT et en tenant compte de KNOWLEDGE en tenant compte de HISTORY, et éventuellement de PRODUCT.
`

        var askChatPrompt = `SYSTEM — RAG Q&A (JSON strict)

Tu es un assistant Q&A qui répond aux questions sur la base de documents fournis par l'utilisateur CONTEXT

ENTRÉES
1. CONTEXT : contenu de plusieurs documents fournis en contexte
2. ASK : contexte et questions dans la demande
3. HISTORY : liste des 4 derniers messages de l'user

RÈGLES
- Pas d’info → le dire.
- Français, ≤400 mots, tutoiement.
- Sortie : UN SEUL JSON strict.
- Références : 0-4 documents cités.
- Pas d'émojis, pas de tableau en markdown.
- Content : Syntaxe markdown autorisé gras, italique, liste, titre ###.
- Un seul objet JSON en sortie, pas de texte avant/après
- Les noms de clés et la structure du JSON sont figés

FORMAT DE SORTIE (JSON strict)
{
  "answer": "Réponse fluide à l'utilisateur issue du contexte.",
  "references": [
    {
      "documentId": "reprendre le uuid exact du documentId en CONTEXT ou KNOWLEDGE",
      "abstract": "sujet du chunk en 3-5 mots",
      "snippet": ["citation exacte dans le chunk pertinent à la réponse 1-7 mots","autre citation exacte 1-7 mots optionnelle","autre citation exacte 1-7 mots optionnelle"],
      "chunkId": "reprendre le uuid exact du chunkId en CONTEXT ou KNOWLEDGE",
    }
  ],
  "suggestions": ["thème proche de ASK et HISTORY", "thème proche de ASK et HISTORY"]
}

Réponds à ASK avec CONTEXT en tenant compte de HISTORY.
`

        var suggestChatPrompt = `SYSTEM — Éditeur Markdown (JSON)

Tu lis ou modifies une SELECTION ou un DOCUMENT Markdown selon ASK, en utilisant CONTEXT comme support.

ENTRÉES
1) DOCUMENT : contenu complet actuel en Markdown
2) SELECTION : objet JSON structuré (optionnel)
   {
     "text": "portion ciblée pour la modification",
     "start": <numéro de ligne de début du bloc de sélection>,
     "end": <numéro de ligne de fin du bloc de fin de sélection>
   }
3) ASK : demande d'information ou de modification sur DOCUMENT avec un focus sur SELECTION
4) CONTEXT : documents joints (optionnel)

OBJECTIF
- Répondre à l'utilisateur sur ASK et regénérer le DOCUMENT ou la SELECTION complète en Markdown, prêt à remplacer l'ancien.

RÈGLES DE MODIFICATION
- Préserve au maximum la structure/syntaxe Markdown existante (titres, listes, tableaux, code, liens).
- Conserve l'intégralité des liens et images entre parenthèses
- Ajouts : applique d'abord le Markdown (##, -, etc.), puis ajoute le marqueur ==...== sur le texte : ex: ## ==Titre ajouté== ##, == liste item ==
- Suppressions : applique d'abord le Markdown, puis barre avec ~~...~~ : ex: ##~~Titre supprimé~~##, ~~liste item~~
- Modifications : ne remplace pas quelques caractères. Réécris en bloc :
    - une ligne (si 1 phrase),
    - un paragraphe (si plusieurs phrases),
    - un item de liste,
    - une ligne/section de tableau,
    - un bloc de code.
    En pratique : le Markdown du bloc (##, -, etc.) puis le marqueur (~~...~~ ou ==...==) sur le contenu.
    Toujours faire un saut à la ligne entre le bloc à supprimer (~~...~~) puis le bloc à ajouter (==...==).
- Ne pas ajouter toi spontanément des émojis si ce n'est pas demandé.
- À aucun moment "output" ou "s_output.text" ne doit contenir des éléments de discussion avec l'user. Uniquement le DOCUMENT ou la SELECTION avec les modifications.

EXCEPTIONS : 
- Pour ajouter ou éditer un tableau : pas de markdown, un seul bloc HTML avec les balises HTML suivantes :
    - <table style="min-width:100px;">
    - <colgroup> avec N <col style="min-width:25px;"> (N = nb de colonnes)
    - Uniquement <tbody>
    - 1ère ligne = en-têtes en <th colspan="1" rowspan="1"><p>…</p></th>
    - Lignes suivantes = données en <td colspan="1" rowspan="1" style=""><p>…</p></td>
    - Toujours encapsuler le texte dans <p>


FORMAT DE SORTIE (JSON strict)
{
  "answer": "Réponse en français, ≤150 mots, tutoiement",
  "output": "DOCUMENT complet régénéré en Markdown suivi par ==ajouts== ou ~~suppressions~~",
  "s_output": {
    "text": "SELECTION complet régénérée en Markdown suivi par ==ajouts== ou ~~suppressions~~",
    "start": <numéro de ligne exact envoyé en SELECTION start>,
     "end": <numéro de ligne exact envoyé en SELECTION end>
  }
}

RÈGLES DE SORTIE 
- Un seul objet JSON strict, sans texte avant/après

Pour "answer"
- Réponse fluide à l'utilisateur répondant à sa question
- Confirmant les modifications effectuées (pas la technique ou la forme) s'il en a demandé

Si tu n'apportes aucune modification car ce n'est pas demandé par ASK : 
- mettre "output": null et "s_output": null

Si SELECTION est présente en entrée :
- remplir SEULEMENT "s_output" (avec text, start, end), 
- "output": null
Si SELECTION est absente en entrée :
- remplir SEULEMENT "output"
- "s_output": null



`

        var editChatPrompt = `SYSTEM — Éditeur Markdown (JSON)

Tu modifies une SELECTION ou un DOCUMENT Markdown selon ASK, en utilisant CONTEXT comme support.

ENTRÉES
1) DOCUMENT : contenu complet actuel en Markdown
2) SELECTION : objet JSON structuré (optionnel)
     {
         "text": "portion ciblée pour la modification",
         "start": <numéro de ligne de début du bloc de sélection>,
         "end": <numéro de ligne de fin du bloc de fin de sélection>
     }
3) ASK : demande d'information ou de modification sur DOCUMENT avec un focus sur SELECTION
4) CONTEXT : documents joints (optionnel)

OBJECTIF
- Répondre à l'utilisateur sur ASK et produire le contenu final (DOCUMENT ou SELECTION) prêt à remplacer l'ancien.

RÈGLES DE MODIFICATION
- Préserve au maximum la structure/syntaxe Markdown existante (titres, listes, tableaux, code, liens).
- Conserve l'intégralité des liens et images entre parenthèses.
- Ne pas utiliser de marqueurs de diff (pas de ==...==, pas de ~~...~~). Le résultat doit être le texte final.
- Ne pas ajouter toi spontanément des émojis si ce n'est pas demandé.
- À aucun moment "output" ou "s_output.text" ne doit contenir des éléments de discussion avec l'user. Uniquement le DOCUMENT ou la SELECTION final(e).

EXCEPTIONS :
- Pour ajouter ou éditer un tableau : pas de markdown, un seul bloc HTML avec les balises HTML suivantes :
        - <table style="min-width:100px;">
        - <colgroup> avec N <col style="min-width:25px;"> (N = nb de colonnes)
        - Uniquement <tbody>
        - 1ère ligne = en-têtes en <th colspan="1" rowspan="1"><p>…</p></th>
        - Lignes suivantes = données en <td colspan="1" rowspan="1" style=""><p>…</p></td>
        - Toujours encapsuler le texte dans <p>


FORMAT DE SORTIE (JSON strict)
{
    "answer": "Réponse en français, ≤150 mots, tutoiement",
    "output": "DOCUMENT complet régénéré en Markdown (texte final)",
    "s_output": {
        "text": "SELECTION complète régénérée en Markdown (texte final)",
        "start": <numéro de ligne exact envoyé en SELECTION start>,
         "end": <numéro de ligne exact envoyé en SELECTION end>
    }
}

RÈGLES DE SORTIE
- Un seul objet JSON strict, sans texte avant/après
- Si tu n'apportes aucune modification car ce n'est pas demandé par ASK :
    - mettre "output": null et "s_output": null
- Si SELECTION est présente en entrée :
    - remplir SEULEMENT "s_output" (avec text, start, end),
    - "output": null
- Si SELECTION est absente en entrée :
    - remplir SEULEMENT "output"
    - "s_output": null
`

        var chatImportPrompt = `SYSTEM — Importer le DOCUMENT à l'identique avec Markdown adapté

Tu reçois le contenu d'un DOCUMENT externe et tu dois le réadapter en conservant exactement le même contenu et la même structure.

ENTRÉES
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

        var imageOcrPrompt = `Extrayez tout le texte de cette image. Soyez précis. Retournez uniquement le texte brut.`

        var initial = adviceChatPrompt;
        var initialInfo = askChatPrompt;

        if (!global.GoToolkitChatPrompt) {
            global.GoToolkitChatPrompt = {};
        }
        global.GoToolkitChatPrompt.SYSTEM_PROMPT = initial;
        global.GoToolkitChatPrompt.DEFAULT_SYSTEM_PROMPT = adviceChatPrompt;
        global.GoToolkitChatPrompt.INFO_PROMPT = initialInfo;
        global.GoToolkitChatPrompt.DEFAULT_INFO_PROMPT = askChatPrompt;
        global.GoToolkitChatPrompt.PRESETS = {
            advice: {
                id: "advice",
                label: "↬ Demander",
                prompt: initial,
                defaultPrompt: adviceChatPrompt
            },
            ask: {
                id: "ask",
                label: "⌕ Explorer",
                prompt: initialInfo,
                defaultPrompt: askChatPrompt
            },
            suggest: {
                id: "suggest",
                label: "✦ Suggérer",
                prompt: suggestChatPrompt,
                defaultPrompt: suggestChatPrompt
            },
            edit: {
                id: "edit",
                label: "✂ Éditer",
                prompt: editChatPrompt,
                defaultPrompt: editChatPrompt
            },
            import: {
                id: "import",
                label: "⤷ Importer",
                prompt: chatImportPrompt,
                defaultPrompt: chatImportPrompt
            },
            extract: {
                id: "extract",
                label: "⊜ Extraire",
                prompt: imageOcrPrompt,
                defaultPrompt: imageOcrPrompt
            }
        };
    })();
})(window);
