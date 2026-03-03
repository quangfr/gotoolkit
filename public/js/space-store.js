(function () {
  const STORAGE_KEY = "go-toolkit-spaces";
  const DEFAULT_SPACE_ID = "golive";
  const CLOUD_DRAFTS_STORAGE_KEY = "goToolkit.memo.cloudDrafts.v1";
  const CLOUD_DRAFTS_STORE_NAME = "cloud-drafts";
  const CLOUD_DRAFTS_RECORD_KEY = "records";

  const DICEWARE_FR_WORDS = [
    "abricot", "abeille", "abri", "acier", "acrobate", "adieu", "agenda", "agile", "aigle", "aile",
    "aimer", "air", "alarme", "alibi", "allure", "alpage", "ambre", "amical", "amiral", "amour",
    "ancre", "ange", "animal", "anneau", "anonyme", "apero", "arbre", "ardoise", "arena", "argent",
    "armoire", "arpent", "artiste", "astre", "atlas", "aurore", "avalanche", "avion", "azur", "badge",
    "balade", "bambou", "banane", "barque", "bastion", "beige", "berceau", "besace", "biscuit", "bleu",
    "bobine", "bois", "boussole", "brise", "broder", "bronze", "bruine", "bulle", "bureau", "cabane",
    "cactus", "cadeau", "cafe", "calme", "camion", "canard", "capuche", "carte", "cascade", "cendre",
    "cerise", "chaise", "chance", "chant", "charme", "chemin", "chiffre", "chocolat", "ciel", "clair",
    "cloche", "coffre", "colline", "comete", "compas", "corail", "corde", "cosmos", "coton", "courage",
    "crayon", "cristal", "danse", "debut", "declic", "delta", "desir", "diamant", "dossier", "dragon",
    "dune", "eclair", "ecume", "elan", "elegant", "embarcation", "encre", "energie", "enigme", "envol",
    "epice", "equilibre", "etoile", "etude", "eventail", "fabrique", "falaise", "famille", "farine", "faucon",
    "fete", "fibre", "ficelle", "filtre", "flamme", "fleur", "flocon", "forgeron", "forme", "fortune",
    "foudre", "fraise", "fromage", "fusion", "galaxie", "garage", "gazon", "gelule", "genie", "geste",
    "glace", "graine", "graphite", "grimoire", "grotte", "harmonie", "helium", "herbe", "hiver", "horizon",
    "idee", "illusion", "image", "indice", "isotope", "ivoire", "jardin", "jaune", "jeton", "joie",
    "journal", "jungle", "karate", "kilo", "kimono", "label", "lagon", "lampe", "lancement", "lavande",
    "lecteur", "legende", "levier", "liane", "liberte", "limite", "linge", "liseron", "livre", "lueur",
    "lune", "lycee", "machine", "magie", "maison", "mangue", "marche", "masque", "matin", "melodie",
    "memoire", "mer", "metal", "meteor", "micro", "minuit", "mirage", "mobile", "modele", "montagne",
    "moteur", "mouette", "muguet", "musique", "mystere", "nageur", "nature", "neige", "noisette", "nuage",
    "objet", "ocean", "odeur", "olive", "ombre", "ondule", "orange", "orbite", "orchidee", "orignal",
    "outil", "ouverture", "paille", "palier", "papier", "parfum", "passage", "patience", "perle", "pierre",
    "pilote", "piment", "pinceau", "planete", "plume", "poche", "poeme", "pollen", "pomme", "pont",
    "portail", "prairie", "precieux", "prisme", "projet", "puzzle", "quartier", "question", "quille", "racine",
    "radar", "raffut", "raison", "ramure", "rapide", "rayon", "regle", "relais", "renard", "reserve",
    "ressort", "reverie", "rivage", "robot", "rose", "roue", "ruban", "rucher", "sable", "saison",
    "salon", "saphir", "saturne", "science", "secret", "sejour", "serpent", "signal", "silence", "sillage",
    "soleil", "source", "spirale", "sport", "station", "sucre", "sud", "surprise", "table", "talisman",
    "tambour", "tempo", "tendre", "terre", "theorie", "tiroir", "tonnerre", "tour", "trace", "trampoline",
    "triangle", "trouve", "tulipe", "univers", "utile", "vacance", "vague", "valise", "velo", "vent",
    "verger", "verite", "verre", "village", "violet", "vision", "vitesse", "voile", "volcan", "voyage",
    "wagon", "xylophone", "zenith", "zeste"
  ];

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeSpaceId(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    return raw.replace(/[^a-z0-9-]/g, "");
  }

  function normalizeSpaceJoinCode(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    const noAccent = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const withSpaces = noAccent.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    return withSpaces;
  }

  function normalizeCloudDraftStore(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.keys(value).reduce((acc, key) => {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) return acc;
      const entry = value[key];
      if (!entry || typeof entry !== "object") return acc;
      acc[normalizedKey] = entry;
      return acc;
    }, {});
  }

  function createRandomCode() {
    const words = [];
    for (let i = 0; i < 5; i += 1) {
      const pick = Math.floor(Math.random() * DICEWARE_FR_WORDS.length);
      words.push(DICEWARE_FR_WORDS[pick]);
    }
    return words.join(" ");
  }

  function createRandomName() {
    const value = Math.floor(100 + Math.random() * 900);
    return `Espace ${value}`;
  }

  function normalizeSpace(value) {
    if (!value || typeof value !== "object") return null;
    const id = normalizeSpaceId(value.id);
    if (!id) return null;
    const isDefault = Boolean(value.isDefault);
    return {
      id,
      name: String(value.name || createRandomName()).trim() || createRandomName(),
      icon: String(value.icon || "cloud-upload").trim() || "cloud-upload",
      spaceJoinCode: normalizeSpaceJoinCode(
        value.spaceJoinCode
        || value.spaceCode
        || ""
      ),
      accessMode: String(value.accessMode || "").trim().toLowerCase(),
      accessManaged: Boolean(value.accessManaged),
      isDefault,
      updatedAt: String(value.updatedAt || nowIso()).trim() || nowIso()
    };
  }

  function ensureSpaces(list) {
    const normalized = Array.isArray(list) ? list.map(normalizeSpace).filter(Boolean) : [];
    const byId = new Map(normalized.map(item => [item.id, item]));
    return Array.from(byId.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "fr")
    );
  }

  function readRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function readSpaces() {
    const next = ensureSpaces(readRaw());
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      // ignore
    }
    return next;
  }

  function writeSpaces(list) {
    const next = ensureSpaces(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      // ignore
    }
    return next;
  }

  function upsertSpace(input) {
    const normalized = normalizeSpace(input);
    if (!normalized) return null;
    const spaces = readSpaces();
    const next = spaces.filter(item => item.id !== normalized.id);
    next.push({ ...normalized, updatedAt: nowIso() });
    return writeSpaces(next).find(item => item.id === normalized.id) || null;
  }

  function deleteSpace(spaceId) {
    const id = normalizeSpaceId(spaceId);
    if (!id) return false;
    const spaces = readSpaces();
    const next = spaces.filter(item => item.id !== id);
    writeSpaces(next);
    return next.length !== spaces.length;
  }

  function getSpaceById(spaceId) {
    const id = normalizeSpaceId(spaceId);
    if (!id) return null;
    return readSpaces().find(item => item.id === id) || null;
  }

  function joinByCode(spaceCode) {
    const code = normalizeSpaceJoinCode(spaceCode);
    if (!code) return null;
    const parts = code.split(" ").filter(Boolean);
    if (parts.length !== 5) return null;
    const spaces = readSpaces();
    const existing = spaces.find(item => normalizeSpaceJoinCode(item.spaceJoinCode || item.spaceCode || "") === code);
    if (existing) return existing;
    const id = `space-${code.replace(/\s+/g, "-")}`;
    return upsertSpace({
      id,
      name: createRandomName(),
      icon: "cloud-upload",
      spaceJoinCode: code,
      isDefault: false
    });
  }

  function createSpace(spaceId, icon) {
    const requestedId = normalizeSpaceId(spaceId);
    let id = requestedId;
    if (!id || id === DEFAULT_SPACE_ID) {
      id = `space-${Math.random().toString(36).slice(2, 8)}`;
    }
    const spaces = readSpaces();
    const ids = new Set(spaces.map(item => item.id));
    let candidate = id;
    let i = 2;
    while (ids.has(candidate) || candidate === DEFAULT_SPACE_ID) {
      candidate = `${id}-${i}`;
      i += 1;
    }
    return upsertSpace({
      id: candidate,
      name: candidate.toUpperCase(),
      icon: String(icon || "cloud-upload").trim() || "cloud-upload",
      spaceJoinCode: createRandomCode(),
      isDefault: false
    });
  }

  function regenerateCode(spaceId) {
    const space = getSpaceById(spaceId);
    if (!space || space.isDefault) return space;
    return upsertSpace({ ...space, spaceJoinCode: createRandomCode() });
  }

  function createCloudDraftStore() {
    const storageService = window.goToolkitStorageService;
    if (storageService?.createStore) {
      return storageService.createStore({
        storeName: CLOUD_DRAFTS_STORE_NAME,
        localStorageKey: CLOUD_DRAFTS_STORAGE_KEY,
        recordKey: CLOUD_DRAFTS_RECORD_KEY,
        defaultValue: () => ({}),
        normalize: normalizeCloudDraftStore,
        logPrefix: "GoToolkitCloudDraftStore"
      });
    }
    return {
      STORAGE_KEY: CLOUD_DRAFTS_STORAGE_KEY,
      async read() {
        try {
          const raw = localStorage.getItem(CLOUD_DRAFTS_STORAGE_KEY);
          return normalizeCloudDraftStore(raw ? JSON.parse(raw) : {});
        } catch (err) {
          return {};
        }
      },
      async write(value) {
        const next = normalizeCloudDraftStore(value);
        try {
          localStorage.setItem(CLOUD_DRAFTS_STORAGE_KEY, JSON.stringify(next));
        } catch (err) {
          // ignore
        }
        return next;
      },
      async refresh() {
        return this.read();
      }
    };
  }

  const api = {
    STORAGE_KEY,
    DEFAULT_SPACE_ID,
    CLOUD_DRAFTS_STORAGE_KEY,
    CLOUD_DRAFTS_STORE_NAME,
    CLOUD_DRAFTS_RECORD_KEY,
    readSpaces,
    writeSpaces,
    upsertSpace,
    deleteSpace,
    getSpaceById,
    normalizeSpaceId,
    normalizeSpaceJoinCode,
    normalizeCloudDraftStore,
    createRandomCode,
    createRandomName,
    joinByCode,
    createSpace,
    regenerateCode,
    createCloudDraftStore
  };

  window.GoToolkitSpaceStore = window.GoToolkitSpaceStore || api;
  window.GoToolkitSpaces = window.GoToolkitSpaces || window.GoToolkitSpaceStore;
})();
