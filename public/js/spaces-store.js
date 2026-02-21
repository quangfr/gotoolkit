(function () {
  const STORAGE_KEY = "go-toolkit-spaces";
  const DEFAULT_SPACE_ID = "golive";
  const DEFAULT_SPACE = {
    id: DEFAULT_SPACE_ID,
    name: "Go Live",
    icon: "cloud-upload",
    spaceCode: "",
    isDefault: true,
    updatedAt: ""
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeSpaceId(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    return raw.replace(/[^a-z0-9_-]/g, "");
  }

  function createRandomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  function createRandomName() {
    const value = Math.floor(100 + Math.random() * 900);
    return `Espace ${value}`;
  }

  function normalizeSpace(value) {
    if (!value || typeof value !== "object") return null;
    const id = normalizeSpaceId(value.id);
    if (!id) return null;
    const isDefault = id === DEFAULT_SPACE_ID || Boolean(value.isDefault);
    return {
      id,
      name: String(value.name || (isDefault ? "Go Live" : createRandomName())).trim() || (isDefault ? "Go Live" : createRandomName()),
      icon: String(value.icon || (isDefault ? "cloud-upload" : "cloud-upload")).trim() || "cloud-upload",
      spaceCode: isDefault ? "" : String(value.spaceCode || "").trim().toUpperCase(),
      isDefault,
      updatedAt: String(value.updatedAt || nowIso()).trim() || nowIso()
    };
  }

  function ensureDefaultSpace(list) {
    const normalized = Array.isArray(list) ? list.map(normalizeSpace).filter(Boolean) : [];
    const byId = new Map(normalized.map(item => [item.id, item]));
    if (!byId.has(DEFAULT_SPACE_ID)) {
      byId.set(DEFAULT_SPACE_ID, { ...DEFAULT_SPACE, updatedAt: nowIso() });
    } else {
      const current = byId.get(DEFAULT_SPACE_ID);
      byId.set(DEFAULT_SPACE_ID, {
        ...current,
        id: DEFAULT_SPACE_ID,
        name: current.name || "Go Live",
        icon: current.icon || "cloud-upload",
        spaceCode: "",
        isDefault: true,
        updatedAt: current.updatedAt || nowIso()
      });
    }
    return Array.from(byId.values()).sort((a, b) => {
      if (a.id === DEFAULT_SPACE_ID) return -1;
      if (b.id === DEFAULT_SPACE_ID) return 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "fr");
    });
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
    const next = ensureDefaultSpace(readRaw());
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      // ignore
    }
    return next;
  }

  function writeSpaces(list) {
    const next = ensureDefaultSpace(list);
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
    if (!id || id === DEFAULT_SPACE_ID) return false;
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
    const code = String(spaceCode || "").trim().toUpperCase();
    if (!code || code.length !== 5) return null;
    const spaces = readSpaces();
    const existing = spaces.find(item => String(item.spaceCode || "").toUpperCase() === code);
    if (existing) return existing;
    const id = `space-${code.toLowerCase()}`;
    return upsertSpace({
      id,
      name: createRandomName(),
      icon: "cloud-upload",
      spaceCode: code,
      isDefault: false
    });
  }

  function createSpace(name, icon) {
    const trimmedName = String(name || "").trim() || createRandomName();
    let id = normalizeSpaceId(trimmedName.replace(/\s+/g, "-").toLowerCase());
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
      name: trimmedName,
      icon: String(icon || "cloud-upload").trim() || "cloud-upload",
      spaceCode: createRandomCode(),
      isDefault: false
    });
  }

  function regenerateCode(spaceId) {
    const space = getSpaceById(spaceId);
    if (!space || space.isDefault) return space;
    return upsertSpace({ ...space, spaceCode: createRandomCode() });
  }

  window.GoToolkitSpaces = window.GoToolkitSpaces || {
    STORAGE_KEY,
    DEFAULT_SPACE_ID,
    readSpaces,
    writeSpaces,
    upsertSpace,
    deleteSpace,
    getSpaceById,
    normalizeSpaceId,
    createRandomCode,
    createRandomName,
    joinByCode,
    createSpace,
    regenerateCode
  };
})();
