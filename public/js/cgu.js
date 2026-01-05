(function () {
    "use strict";
    const MODAL_ID = "nexusModal";
    const OPEN_ATTR = "data-open-nexus-modal";
    const CLOSE_ATTR = "data-close-nexus-modal";

    function buildModalHtml() {
        return `
        <div class="nexus-modal">
            <header>
                <h2>Conditions générales d'utilisation Go-Toolkit</h2>
                <button id="closeNexusBtn" class="btn" type="button" aria-label="Fermer" ${CLOSE_ATTR}>✕</button>
            </header>
            <div class="nexus-content">
                <p>
Go-Toolkit est un outil professionnel développé par Savane Go Live destiné à l’animation d’ateliers, au cadrage et à la documentation produit,
ainsi qu’à la collaboration entre équipes métier et techniques.</p>

<p><strong>⛒ Utilisation, responsabilité et légalité</strong><br>
Aucun compte n’est requis pour utiliser le service. Vous restez responsable des contenus saisis.
N’y saisissez pas de données personnelles ou sensibles et n’utilisez pas l’outil à des fins illégales.</p>

<p><strong>⚲ Données, stockage et cookies</strong><br>
Par défaut, les données restent dans votre navigateur et sont utilisées uniquement
au fonctionnement du service. Elles peuvent être perdues en cas de nettoyage ou de panne de l'appareil. Aucun cookie ou traceur tiers n’est déposé sur votre navigateur.</p>

<p><strong>⌘ Intelligence Artificielle</strong><br>
Certaines fonctionnalités d'intelligence artificielle reposent sur l'envoi de données à un fournisseur tiers.
Lorsque vous les déclenchez, seules les données strictement nécessaires sont transmises.
Ne transmettez pas de données confidentielles. Les données transmisesne sont pas conservées par le fournisseur.</p>

<p><strong>◉ Reconnaissance et transcription vocale</strong><br>
La dictée et la transcription peuvent impliquer un traitement de l’audio par un fournisseur tiers. Les données audio et les transcriptions peuvent être conservées à des fins d’amélioration des services.
Informez les participants et recueillez leur consentement si nécessaire.</p>

<p><strong>⟐ Accès privé ou partagé avec quota</strong><br>
Vous pouvez choisir entre l'accès privé (sans rétention de données avec vos propres clés API) ou l'accès partagé par défaut (gratuit limité). Dans ce dernier cas, le fournisseur tiers pourra utiliser vos données pour améliorer ses services dont l'entrainement de ses modèles IA.</p>

<p><strong>⧉ Partage et cloud</strong><br>
Les contenus peuvent être partagés via des liens et stockés dans le cloud.
Ils sont modifiables par les détenteurs du lien et supprimables par leur créateur.
Aucune sauvegarde n’est garantie.</p>

<p><strong>🡇 Exportation</strong><br>
Les données peuvent être exportées librement pour archivage, partage ou intégration dans d’autres outils.</p>
                <p style="margin-top:14px;font-size:0.85em;opacity:0.85;">
                   
                    Responsable de la publication : Savane Go Live (909 865 214)
                    – Contact : Oliver THOLANCE - oliver.tholance@savane-group.com
                    – Hébergement : Google (France/UE)<br>
                </p>
            </div>
            <div class="nexus-actions">
                <button type="button" class="btn-primary" ${CLOSE_ATTR}>J'ai compris</button>
            </div>
        </div>
        `;
    }

    function ensureMounted() {
        let modal = document.getElementById(MODAL_ID);
        if (modal) {
            return modal;
        }
        modal = document.createElement("div");
        modal.id = MODAL_ID;
        modal.className = "gt-nexus-backdrop";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-hidden", "true");
        modal.innerHTML = buildModalHtml();
        document.body.appendChild(modal);
        return modal;
    }

    function open() {
        const modal = ensureMounted();
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        const closeBtn = modal.querySelector(`[${CLOSE_ATTR}]`);
        if (closeBtn && typeof closeBtn.focus === "function") {
            closeBtn.focus();
        }
    }

    function close() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    window.goToolkitNexusModal = {
        ensureMounted,
        open,
        close
    };

    document.addEventListener("click", event => {
        const openEl = event.target?.closest?.(`[${OPEN_ATTR}]`);
        if (openEl) {
            event.preventDefault?.();
            open();
            return;
        }
        const closeEl = event.target?.closest?.(`[${CLOSE_ATTR}]`);
        if (closeEl) {
            event.preventDefault?.();
            close();
            return;
        }
        const modal = document.getElementById(MODAL_ID);
        if (modal && event.target === modal) {
            close();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape" && event.key !== "Esc") return;
        close();
    });
})();
