(function () {
    "use strict";
    const MODAL_ID = "privacyModal";
    const OPEN_ATTR = "data-open-privacy-modal";
    const CLOSE_ATTR = "data-close-privacy-modal";

    function buildModalHtml() {
        return `
        <div class="requests-modal" style="max-width: 760px;">
            <header style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <h3 id="privacyModalTitle" style="margin:0;font-size:1rem;">Politique de confidentialité</h3>
                <button class="btn-secondary" type="button" aria-label="Fermer" ${CLOSE_ATTR}><i data-lucide="x" style="width:16px;height:16px;"></i></button>
            </header>
            <div class="requests-body" style="display:block; max-height: 70vh; overflow:auto;">
                <p>Go-Toolkit est un outil professionnel développé par Savane Go Live.</p>
                <p><strong>Données locales</strong><br>
                    Par défaut, les données restent dans votre navigateur et servent uniquement au fonctionnement du service.</p>
                <p><strong>Cookies et traceurs</strong><br>
                    Aucun cookie ou traceur tiers n'est déposé sur votre navigateur.</p>
                <p><strong>Fonctionnalités IA</strong><br>
                    Certaines fonctions impliquent l'envoi de données strictement nécessaires à des fournisseurs tiers.
                    N'y transmettez pas de données confidentielles.</p>
                <p><strong>Dictée et transcription</strong><br>
                    L'audio peut être traité par un fournisseur tiers. Informez les participants et recueillez leur
                    consentement si nécessaire.</p>
                <p><strong>Partage cloud</strong><br>
                    Les contenus partagés sont accessibles aux détenteurs du lien et supprimables par leur créateur.
                    Aucune sauvegarde n'est garantie.</p>
                <p><strong>Publication YouTube</strong><br>
                    L'utilisation de YouTube via OAuth permet la publication de vidéos sur votre chaîne. Seules les informations minimales pour l'upload sont utilisées et aucune donnée personnelle de votre compte Google n'est stockée par Go-Toolkit.</p>
                <p style="margin-top:14px;font-size:0.85em;opacity:0.85;">
                    Responsable de la publication : Savane Go Live (909 865 214)
                    - Contact : Oliver THOLANCE - oliver.tholance@savane-group.com
                    - Hébergement : Google (France/UE)
                </p>
            </div>
        </div>
        `;
    }

    function ensureMounted() {
        let modal = document.getElementById(MODAL_ID);
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = MODAL_ID;
        modal.className = "feedback-modal-backdrop";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-hidden", "true");
        modal.setAttribute("aria-labelledby", "privacyModalTitle");
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
        if (window.lucide && typeof window.lucide.createIcons === "function") {
            try { window.lucide.createIcons({ icons: window.lucide.icons, attrs: { "stroke-width": 2 } }); } catch (e) { /* ignore */ }
        }
    }

    function close() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    window.goToolkitPrivacyModal = {
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
