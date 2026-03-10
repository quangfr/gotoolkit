(function (global) {
    const promptCategories = {
        redaction: { label: "REDACTION", icon: "file-text" },
        communication: { label: "COMMUNICATION", icon: "mail" },
        organisation: { label: "ORGANISATION", icon: "calendar" },
        analyse: { label: "ANALYSE", icon: "search" },
        scolaire: { label: "SCOLAIRE", icon: "graduation-cap" },
        bureautique: { label: "BUREAUTIQUE", icon: "briefcase" },
        personnel: { label: "PERSONNEL", icon: "user" }
    };

    const promptShortcuts = [
        // REDACTION (6)
        {
            id: "redaction-reformuler",
            title: "Reformuler clairement",
            category: "redaction",
            content: "Réécris ce contenu en version longue et fluide (800-1200 mots), avec une structure claire (introduction, sections, conclusion), sans changer le sens. Contexte : [texte à reformuler]."
        },
        {
            id: "redaction-corriger",
            title: "Corriger les fautes",
            category: "redaction",
            content: "Corrige l'orthographe, la grammaire et la ponctuation de ce document long, puis propose une version propre et homogène avec titres et paragraphes cohérents. Contexte : [document à corriger]."
        },
        {
            id: "redaction-resumer",
            title: "Résumé rapide",
            category: "redaction",
            content: "Fais une synthèse détaillée d'un document long avec: résumé exécutif, idées majeures par section, points d'attention et conclusion. Contexte : [document]."
        },
        {
            id: "redaction-plan",
            title: "Créer un plan",
            category: "redaction",
            content: "Construis un plan complet de document long avec titre, introduction, 3 à 5 parties, sous-parties, transitions et conclusion. Contexte : [sujet]."
        },
        {
            id: "redaction-ton",
            title: "Adapter le ton",
            category: "redaction",
            content: "Réécris ce document en adaptant le ton (professionnel, pédagogique et clair), en conservant la structure longue et en améliorant la lisibilité des paragraphes. Contexte : [document]."
        },
        {
            id: "redaction-intro-conclusion",
            title: "Intro + conclusion",
            category: "redaction",
            content: "Rédige une introduction engageante et une conclusion solide pour un document long, avec rappel de l'objectif, des points clés et des prochaines étapes. Contexte : [contenu principal]."
        },

        // COMMUNICATION (6)
        {
            id: "communication-email",
            title: "Email professionnel",
            category: "communication",
            content: "À partir de mes notes, rédige une note formelle longue (pas un simple email), structurée en sections: contexte, objectifs, éléments clés, décisions attendues et plan d'action. Contexte : [situation]."
        },
        {
            id: "communication-relance",
            title: "Message de relance",
            category: "communication",
            content: "Rédige un document de relance complet avec rappel du contexte, historique, enjeux, demandes précises, échéances et impacts en cas d'absence de réponse. Contexte : [demande]."
        },
        {
            id: "communication-reunion",
            title: "Compte rendu de réunion",
            category: "communication",
            content: "Transforme mes notes en compte rendu détaillé de réunion: contexte, participants, points discutés, décisions, désaccords, actions, responsables, échéances et annexes. Contexte : [notes]."
        },
        {
            id: "communication-annonce",
            title: "Annonce interne",
            category: "communication",
            content: "Rédige une note d'annonce interne longue avec introduction, explication du changement, impacts par public, calendrier, FAQ et modalités de contact. Contexte : [annonce]."
        },
        {
            id: "communication-qa",
            title: "FAQ simple",
            category: "communication",
            content: "Crée une FAQ détaillée (12 à 15 questions) avec réponses développées, exemples d'usage, cas limites et section de synthèse finale. Contexte : [sujet]."
        },
        {
            id: "communication-script-appel",
            title: "Script d'appel",
            category: "communication",
            content: "Prépare un guide complet d'entretien téléphonique: objectifs, déroulé détaillé, questions ouvertes, réponses types aux objections, scénarios alternatifs et compte rendu attendu. Contexte : [objectif]."
        },

        // ORGANISATION (6)
        {
            id: "organisation-plan-action",
            title: "Plan d'action",
            category: "organisation",
            content: "Transforme ce besoin en plan d'action détaillé sur plusieurs étapes, avec objectifs, tâches, responsabilités, échéances, dépendances, risques et critères de réussite. Contexte : [objectif]."
        },
        {
            id: "organisation-priorites",
            title: "Prioriser les tâches",
            category: "organisation",
            content: "À partir d'une liste d'actions, propose une priorisation argumentée dans un document structuré: méthode, classement, justification et planning d'exécution. Contexte : [liste tâches]."
        },
        {
            id: "organisation-checklist",
            title: "Checklist opérationnelle",
            category: "organisation",
            content: "Convertis ce processus en checklist détaillée de document long, avec prérequis, étapes, points de contrôle, erreurs fréquentes et critères de validation finale. Contexte : [processus]."
        },
        {
            id: "organisation-agenda",
            title: "Agenda de réunion",
            category: "organisation",
            content: "Rédige un document de préparation de réunion: objectifs, contexte, ordre du jour détaillé, résultats attendus, documents à lire avant et décisions à prendre. Contexte : [thème]."
        },
        {
            id: "organisation-semaine",
            title: "Planifier la semaine",
            category: "organisation",
            content: "Crée un plan hebdomadaire détaillé sous forme de document: priorités, blocs de travail, jalons, marges de sécurité, revues de fin de journée et ajustements possibles. Contexte : [contraintes]."
        },
        {
            id: "organisation-suivi",
            title: "Tableau de suivi",
            category: "organisation",
            content: "Propose un cadre de suivi complet dans un document: structure du tableau, règles de mise à jour, fréquence de revue, indicateurs et modèles de commentaires. Contexte : [projet]."
        },

        // ANALYSE (6)
        {
            id: "analyse-points-cles",
            title: "Extraire les points clés",
            category: "analyse",
            content: "Analyse un document long et produis une note structurée: idées clés par section, points critiques, opportunités, zones floues et recommandations détaillées. Contexte : [texte]."
        },
        {
            id: "analyse-comparaison",
            title: "Comparer deux options",
            category: "analyse",
            content: "Rédige une comparaison approfondie de deux options dans un document long: critères, avantages, limites, coûts, risques, hypothèses et recommandation finale. Contexte : [option A / option B]."
        },
        {
            id: "analyse-causes",
            title: "Analyser un problème",
            category: "analyse",
            content: "Écris une analyse complète d'un problème avec contexte, symptômes, causes probables, impacts, scénarios de résolution et plan de suivi. Contexte : [problème]."
        },
        {
            id: "analyse-decision",
            title: "Aide à la décision",
            category: "analyse",
            content: "Prépare un dossier d'aide à la décision long avec objectifs, options, critères pondérés, analyse comparative, risques et recommandation argumentée. Contexte : [décision]."
        },
        {
            id: "analyse-feedback",
            title: "Synthèse de feedback",
            category: "analyse",
            content: "À partir de retours bruts, rédige une synthèse longue organisée par thèmes, signaux récurrents, impacts et plan d'amélioration priorisé. Contexte : [retours]."
        },
        {
            id: "analyse-risques",
            title: "Cartographie des risques",
            category: "analyse",
            content: "Construis un document de cartographie des risques avec catégories, probabilité, impact, niveau de criticité, mesures préventives et plan de mitigation. Contexte : [sujet]."
        },

        // SCOLAIRE (6)
        {
            id: "scolaire-expliquer-simple",
            title: "Expliquer simplement",
            category: "scolaire",
            content: "Rédige une explication longue et pédagogique d'un concept avec introduction, définitions, exemples, analogies, erreurs fréquentes et conclusion. Contexte : [concept]."
        },
        {
            id: "scolaire-fiche-revision",
            title: "Fiche de révision",
            category: "scolaire",
            content: "Crée une fiche de révision complète et détaillée: notions clés, méthodes, exemples, pièges classiques, mini-quiz et résumé final. Contexte : [chapitre]."
        },
        {
            id: "scolaire-quiz",
            title: "Quiz d'entraînement",
            category: "scolaire",
            content: "Prépare un document d'entraînement complet avec 15 questions progressives, corrigé expliqué et conseils ciblés selon les erreurs possibles. Contexte : [thème]."
        },
        {
            id: "scolaire-methode",
            title: "Méthode pas à pas",
            category: "scolaire",
            content: "Rédige une méthode détaillée, étape par étape, pour traiter ce type d'exercice, avec stratégie, vérifications et exemple entièrement résolu. Contexte : [exercice]."
        },
        {
            id: "scolaire-plan-redaction",
            title: "Plan de rédaction",
            category: "scolaire",
            content: "Élabore un plan détaillé de rédaction longue: problématique, plan en plusieurs parties, arguments, exemples et transitions rédigées. Contexte : [sujet]."
        },
        {
            id: "scolaire-oral",
            title: "Préparer un oral",
            category: "scolaire",
            content: "Prépare un dossier complet pour l'oral: structure du discours, développement des idées, transitions, réponses aux questions probables et conclusion efficace. Contexte : [thème]."
        },

        // BUREAUTIQUE (6)
        {
            id: "bureautique-modele-compte-rendu",
            title: "Modèle de compte rendu",
            category: "bureautique",
            content: "Propose un modèle détaillé de compte rendu long avec sections standard, consignes de remplissage, exemples de formulation et zones de décision. Contexte : [réunion]."
        },
        {
            id: "bureautique-note-service",
            title: "Note de service",
            category: "bureautique",
            content: "Rédige une note de service complète et structurée: objet, contexte, dispositions, rôles, calendrier d'application, exceptions et contacts utiles. Contexte : [sujet]."
        },
        {
            id: "bureautique-procedure",
            title: "Procédure interne",
            category: "bureautique",
            content: "Rédige une procédure interne détaillée et opérationnelle: objectif, périmètre, étapes, responsabilités, contrôles et gestion des écarts. Contexte : [processus]."
        },
        {
            id: "bureautique-ordre-jour",
            title: "Ordre du jour",
            category: "bureautique",
            content: "Rédige un document d'ordre du jour complet avec contexte, objectifs, points détaillés, documents préparatoires et livrables attendus après réunion. Contexte : [réunion]."
        },
        {
            id: "bureautique-synthese-document",
            title: "Synthèse de document",
            category: "bureautique",
            content: "Fais une synthèse professionnelle détaillée d'un document long, avec découpage par thèmes, messages clés, enjeux et recommandations actionnables. Contexte : [document]."
        },
        {
            id: "bureautique-message-standard",
            title: "Message standard",
            category: "bureautique",
            content: "Crée un modèle de texte long réutilisable (procédure, réponse type ou note interne) avec variables à compléter, version formelle et version simplifiée. Contexte : [type de demande]."
        },

        // PERSONNEL (6)
        {
            id: "personnel-organisation-journee",
            title: "Organiser ma journée",
            category: "personnel",
            content: "Rédige un plan de journée détaillé dans un format de document long: priorités, séquence des tâches, temps estimé, pauses, imprévus et bilan de fin de journée. Contexte : [contraintes]."
        },
        {
            id: "personnel-objectifs-semaine",
            title: "Objectifs de la semaine",
            category: "personnel",
            content: "Transforme mes idées en document hebdomadaire structuré avec objectifs, sous-objectifs, plan d'exécution, indicateurs de progression et revue de fin de semaine. Contexte : [liste d'idées]."
        },
        {
            id: "personnel-budget-simple",
            title: "Budget simple",
            category: "personnel",
            content: "Élabore un document de budget mensuel détaillé: hypothèses, revenus, dépenses, arbitrages, objectifs d'épargne et plan d'ajustement. Contexte : [montants]."
        },
        {
            id: "personnel-habitudes",
            title: "Suivi d'habitudes",
            category: "personnel",
            content: "Crée un document de suivi d'habitudes sur plusieurs semaines: objectifs, déclencheurs, obstacles, indicateurs et méthode d'amélioration continue. Contexte : [habitudes]."
        },
        {
            id: "personnel-decision",
            title: "Aide à la décision perso",
            category: "personnel",
            content: "Rédige un document d'aide à la décision personnelle: contexte, options, avantages, inconvénients, risques, impacts à court/long terme et recommandation. Contexte : [décision]."
        },
        {
            id: "personnel-message-prive",
            title: "Message personnel",
            category: "personnel",
            content: "Au lieu d'un message court, rédige une lettre personnelle structurée et développée, avec contexte, intention, points clés et conclusion posée. Contexte : [situation]."
        }
    ];

    const mobilePromptSuggestions = [
        "Construire un document long avec plan détaillé",
        "Réécrire ce contenu en version structurée complète",
        "Créer une synthèse détaillée par sections",
        "Transformer des notes en rapport complet",
        "Développer une analyse avec recommandations",
        "Produire une version finale prête à partager"
    ];

    global.GoToolkitPromptShortcuts = {
        prompts: promptShortcuts,
        categories: promptCategories,
        mobileSuggestions: mobilePromptSuggestions
    };

})(window);
