const ALLOWED_ORIGINS = [
  "https://gotoolkit.web.app",
  "https://gotoolkit.workers.dev",
  "https://sherpa-5938b.firebaseapp.com"
];

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function normalizeOrigin(origin) {
  return (origin || "").trim();
}

function isLocalOrigin(origin) {
  if (!origin) return true;
  return origin.startsWith("http://localhost")
    || origin.startsWith("http://127.")
    || origin.startsWith("http://192.168.");
}

function corsMeta(request) {
  const origin = normalizeOrigin(request.headers.get("Origin"));
  const allowLocal = isLocalOrigin(origin);
  const defaultOrigin = ALLOWED_ORIGINS[0];
  const corsOrigin = allowLocal
    ? origin || "*"
    : ALLOWED_ORIGINS.includes(origin) ? origin : defaultOrigin;
  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (!allowLocal) headers["Vary"] = "Origin";
  return { origin, allowLocal, headers };
}

function jsonResponse(corsHeaders, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function errorResponse(corsHeaders, status, message) {
  return jsonResponse(corsHeaders, { error: { message } }, status);
}

function getRedirectUri(request) {
  const url = new URL(request.url);
  return `${url.origin}/oauth/callback`;
}

function getDeviceKey(deviceId) {
  return `notion-device:${deviceId}`;
}

function encodeState(payload) {
  return btoa(JSON.stringify(payload || {}));
}

function decodeState(rawState) {
  try {
    const text = atob(rawState || "");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function base64Basic(clientId, clientSecret) {
  return btoa(`${clientId}:${clientSecret}`);
}

async function readDeviceData(env, deviceId) {
  if (!env?.NOTION_OAUTH || !deviceId) return null;
  const raw = await env.NOTION_OAUTH.get(getDeviceKey(deviceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function writeDeviceData(env, deviceId, value) {
  if (!env?.NOTION_OAUTH || !deviceId || !value) return;
  await env.NOTION_OAUTH.put(getDeviceKey(deviceId), JSON.stringify(value));
}

async function clearDeviceData(env, deviceId) {
  if (!env?.NOTION_OAUTH || !deviceId) return;
  await env.NOTION_OAUTH.delete(getDeviceKey(deviceId));
}

function normalizeWorkspaceFromToken(tokenPayload) {
  const id = String(tokenPayload?.workspace_id || "").trim();
  const name = String(tokenPayload?.workspace_name || "").trim();
  if (!id) return null;
  return { id, name: name || "Workspace" };
}

async function exchangeCodeForToken(request, env, code) {
  const clientId = env.NOTION_CLIENT_ID || "";
  const clientSecret = env.NOTION_CLIENT_SECRET || "";
  const response = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64Basic(clientId, clientSecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(request)
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Token exchange failed: ${detail}`);
  }
  return payload;
}

async function refreshAccessToken(env, refreshToken) {
  const clientId = env.NOTION_CLIENT_ID || "";
  const clientSecret = env.NOTION_CLIENT_SECRET || "";
  const response = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64Basic(clientId, clientSecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken || ""
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Token refresh failed: ${detail}`);
  }
  return payload;
}

async function notionApiFetch(token, path, options = {}) {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = payload?.message || payload?.error || `Notion API error (${response.status})`;
    throw new Error(msg);
  }
  return payload;
}

function normalizeDeviceData(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const workspaces = data.workspaces && typeof data.workspaces === "object" ? data.workspaces : {};
  return {
    workspaces,
    selectedWorkspaceId: String(data.selectedWorkspaceId || "").trim()
  };
}

async function getWorkspaceToken(env, deviceId, workspaceId) {
  const raw = await readDeviceData(env, deviceId);
  const data = normalizeDeviceData(raw);
  let selected = workspaceId || data.selectedWorkspaceId;
  if (!selected) {
    const firstWorkspaceId = Object.keys(data.workspaces || {})[0] || "";
    selected = firstWorkspaceId;
    if (selected) data.selectedWorkspaceId = selected;
  }
  const item = selected ? data.workspaces[selected] : null;
  if (!item) return null;

  const now = Date.now();
  if (item.access_token && Number(item.expires_at || 0) > now + 30_000) {
    return { token: item.access_token, data, selectedWorkspaceId: selected, workspace: item };
  }

  if (!item.refresh_token) return null;
  const refreshed = await refreshAccessToken(env, item.refresh_token);
  const merged = {
    ...item,
    access_token: refreshed.access_token || item.access_token,
    refresh_token: refreshed.refresh_token || item.refresh_token,
    bot_id: refreshed.bot_id || item.bot_id,
    workspace_id: refreshed.workspace_id || item.workspace_id,
    workspace_name: refreshed.workspace_name || item.workspace_name,
    expires_at: now + (Number(refreshed.expires_in || 3600) * 1000)
  };
  data.workspaces[selected] = merged;
  await writeDeviceData(env, deviceId, data);
  return { token: merged.access_token, data, selectedWorkspaceId: selected, workspace: merged };
}

function renderOAuthCallbackPage(ok, message, targetOrigin) {
  const safe = String(message || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const payload = JSON.stringify({
    source: "gotoolkit-notion-oauth",
    ok,
    error: ok ? "" : safe
  });
  const normalizedTargetOrigin = String(targetOrigin || "").trim() || "*";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Notion OAuth</title></head><body><script>
  (function () {
    try {
      if (window.opener) {
        window.opener.postMessage(${payload}, ${JSON.stringify(normalizedTargetOrigin)});
      }
    } catch (err) {}
    window.close();
    document.body.textContent = ${JSON.stringify(ok ? "Connexion Notion terminee." : `Erreur: ${safe}`)};
  })();
  </script></body></html>`;
}

async function handleOAuthStart(request, env) {
  const url = new URL(request.url);
  const deviceId = (url.searchParams.get("deviceId") || "").trim();
  const origin = (url.searchParams.get("origin") || "").trim();
  if (!deviceId) return new Response("Missing deviceId", { status: 400 });

  const state = encodeState({ deviceId, origin });
  const authUrl = new URL(NOTION_AUTH_URL);
  authUrl.searchParams.set("client_id", env.NOTION_CLIENT_ID || "");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");
  authUrl.searchParams.set("redirect_uri", getRedirectUri(request));
  authUrl.searchParams.set("state", state);
  return Response.redirect(authUrl.toString(), 302);
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim();
  const oauthError = (url.searchParams.get("error") || "").trim();
  const state = decodeState(url.searchParams.get("state") || "");
  const deviceId = String(state.deviceId || "").trim();
  const targetOrigin = String(state.origin || "").trim();

  if (oauthError) {
    return new Response(renderOAuthCallbackPage(false, oauthError, targetOrigin), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  if (!code || !deviceId) {
    return new Response(renderOAuthCallbackPage(false, "Code OAuth manquant", targetOrigin), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  try {
    const tokenPayload = await exchangeCodeForToken(request, env, code);
    const workspace = normalizeWorkspaceFromToken(tokenPayload);
    if (!workspace?.id) {
      throw new Error("Workspace Notion introuvable");
    }

    const raw = await readDeviceData(env, deviceId);
    const data = normalizeDeviceData(raw);
    data.workspaces[workspace.id] = {
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      bot_id: String(tokenPayload?.bot_id || "").trim(),
      access_token: String(tokenPayload?.access_token || "").trim(),
      refresh_token: String(tokenPayload?.refresh_token || "").trim(),
      expires_at: Date.now() + (Number(tokenPayload?.expires_in || 3600) * 1000)
    };
    data.selectedWorkspaceId = workspace.id;
    await writeDeviceData(env, deviceId, data);

    return new Response(renderOAuthCallbackPage(true, "OK", targetOrigin), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  } catch (err) {
    return new Response(renderOAuthCallbackPage(false, err?.message || "OAuth echoue", targetOrigin), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}

function normalizeText(input) {
  return String(input || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function toRichText(content) {
  const value = String(content || "").slice(0, 1900);
  return value
    ? [{ type: "text", text: { content: value } }]
    : [];
}

function parseTableLine(line) {
  const raw = String(line || "").trim();
  if (!raw.startsWith("|") || !raw.endsWith("|")) return null;
  return raw.slice(1, -1).split("|").map(part => part.trim());
}

function isTableSeparator(cells) {
  if (!cells || !cells.length) return false;
  return cells.every(cell => /^:?-{3,}:?$/.test(cell || ""));
}

function splitTextToBlocks(text, options = {}) {
  const hasRecording = Boolean(options?.hasRecording);
  const lines = normalizeText(text).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length && blocks.length < 100) {
    const rawLine = lines[i] || "";
    const line = rawLine.trim();
    if (!line) {
      i += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const type = level === 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3";
      blocks.push({
        object: "block",
        type,
        [type]: { rich_text: toRichText(headingMatch[2]) }
      });
      i += 1;
      continue;
    }

    if (line.startsWith(">")) {
      blocks.push({
        object: "block",
        type: "quote",
        quote: { rich_text: toRichText(line.replace(/^>\s?/, "")) }
      });
      i += 1;
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: toRichText(bulletMatch[1]) }
      });
      i += 1;
      continue;
    }

    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: toRichText(numberedMatch[1]) }
      });
      i += 1;
      continue;
    }

    const tableHeader = parseTableLine(line);
    const tableSep = parseTableLine(lines[i + 1] || "");
    if (tableHeader && tableSep && isTableSeparator(tableSep)) {
      const rows = [];
      i += 2;
      while (i < lines.length) {
        const row = parseTableLine(lines[i] || "");
        if (!row) break;
        rows.push(row);
        i += 1;
      }
      const headerCols = tableHeader.length;
      const children = [];
      children.push({
        object: "block",
        type: "table_row",
        table_row: {
          cells: tableHeader.map(cell => toRichText(cell))
        }
      });
      rows.forEach(row => {
        const padded = row.slice(0, headerCols);
        while (padded.length < headerCols) padded.push("");
        children.push({
          object: "block",
          type: "table_row",
          table_row: {
            cells: padded.map(cell => toRichText(cell))
          }
        });
      });
      blocks.push({
        object: "block",
        type: "table",
        table: {
          table_width: headerCols,
          has_column_header: true,
          has_row_header: false,
          children: children.slice(0, 100)
        }
      });
      continue;
    }

    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: toRichText(line) }
    });
    i += 1;
  }

  if (!blocks.length) {
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: toRichText("Document vide") }
    });
  }
  if (hasRecording && blocks.length < 100) {
    blocks.push({
      object: "block",
      type: "quote",
      quote: { rich_text: toRichText("Ce document contient un enregistrement audio/vidéo associé.") }
    });
  }
  return blocks.slice(0, 100);
}

async function getPageInfo(token, pageId) {
  return notionApiFetch(token, `/pages/${encodeURIComponent(pageId)}`);
}

function pageParentId(page) {
  const parent = page?.parent || {};
  if (parent.type === "page_id") return String(parent.page_id || "").trim();
  return "";
}

async function searchPagesByTitle(token, title) {
  const payload = await notionApiFetch(token, "/search", {
    method: "POST",
    body: {
      query: String(title || "").trim(),
      filter: { value: "page", property: "object" },
      page_size: 20
    }
  });
  return Array.isArray(payload?.results) ? payload.results : [];
}

async function findChildPageByTitle(token, parentId, title) {
  const target = String(title || "").trim().toLowerCase();
  if (!target) return null;
  const candidates = await searchPagesByTitle(token, title);
  for (const page of candidates) {
    const props = page?.properties || {};
    const titleProp = Object.values(props).find(p => p?.type === "title");
    const text = Array.isArray(titleProp?.title)
      ? titleProp.title.map(item => item?.plain_text || "").join("").trim().toLowerCase()
      : "";
    if (text !== target) continue;
    const pid = pageParentId(page);
    if (pid && pid === parentId) return page;
    if (!pid && parentId) {
      const full = await getPageInfo(token, page.id).catch(() => null);
      if (pageParentId(full) === parentId) return full;
    }
  }
  return null;
}

async function findWorkspaceRootPageByTitle(token, title) {
  const target = String(title || "").trim().toLowerCase();
  if (!target) return null;
  const candidates = await searchPagesByTitle(token, title);
  for (const page of candidates) {
    const props = page?.properties || {};
    const titleProp = Object.values(props).find(p => p?.type === "title");
    const text = Array.isArray(titleProp?.title)
      ? titleProp.title.map(item => item?.plain_text || "").join("").trim().toLowerCase()
      : "";
    if (text !== target) continue;
    const parent = page?.parent || {};
    if (parent?.type === "workspace" && parent?.workspace === true) return page;
  }
  return null;
}

async function ensurePathParent(token, workspaceId, path) {
  const segments = String(path || "")
    .split("/")
    .map(s => s.trim())
    .filter(Boolean);

  if (!segments.length) {
    return { parent: { workspace: true } };
  }

  let currentParent = null;
  for (const segment of segments) {
    if (!currentParent) {
      const existing = await findWorkspaceRootPageByTitle(token, segment);
      if (existing?.id) {
        currentParent = existing.id;
        continue;
      }
      const created = await notionApiFetch(token, "/pages", {
        method: "POST",
        body: {
          parent: { workspace: true },
          properties: {
            title: {
              title: [{ type: "text", text: { content: segment.slice(0, 200) } }]
            }
          }
        }
      });
      currentParent = created?.id || null;
      continue;
    }

    const existing = await findChildPageByTitle(token, currentParent, segment);
    if (existing?.id) {
      currentParent = existing.id;
      continue;
    }

    const created = await notionApiFetch(token, "/pages", {
      method: "POST",
      body: {
        parent: { page_id: currentParent },
        properties: {
          title: {
            title: [{ type: "text", text: { content: segment.slice(0, 200) } }]
          }
        }
      }
    });
    currentParent = created?.id || null;
  }

  if (currentParent) return { parent: { page_id: currentParent } };
  return { parent: { workspace: true } };
}

async function listPages(token, parentId) {
  if (parentId) {
    const payload = await notionApiFetch(token, `/blocks/${encodeURIComponent(parentId)}/children?page_size=100`);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results
      .filter(item => item?.type === "child_page")
      .map(item => ({
        id: String(item?.id || "").trim(),
        title: String(item?.child_page?.title || "").trim() || "Page"
      }))
      .filter(item => item.id);
  }

  const payload = await notionApiFetch(token, "/search", {
    method: "POST",
    body: {
      filter: { value: "page", property: "object" },
      page_size: 50
    }
  });

  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.map(page => {
    const props = page?.properties || {};
    const titleProp = Object.values(props).find(p => p?.type === "title");
    const title = Array.isArray(titleProp?.title)
      ? titleProp.title.map(item => item?.plain_text || "").join("").trim()
      : "";
    return {
      id: String(page?.id || "").trim(),
      title: title || "Page"
    };
  }).filter(item => item.id);
}

async function appendBlockChildren(token, blockId, children) {
  const list = Array.isArray(children) ? children : [];
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    if (!chunk.length) continue;
    await notionApiFetch(token, `/blocks/${encodeURIComponent(blockId)}/children`, {
      method: "PATCH",
      body: { children: chunk }
    });
  }
}

async function listAllBlockChildren(token, blockId) {
  const all = [];
  let cursor = "";
  while (true) {
    const suffix = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : "?page_size=100";
    const payload = await notionApiFetch(token, `/blocks/${encodeURIComponent(blockId)}/children${suffix}`);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    all.push(...results);
    if (!payload?.has_more || !payload?.next_cursor) break;
    cursor = String(payload.next_cursor || "");
  }
  return all;
}

async function clearPageChildren(token, pageId) {
  const children = await listAllBlockChildren(token, pageId);
  for (const block of children) {
    const id = String(block?.id || "").trim();
    if (!id) continue;
    await notionApiFetch(token, `/blocks/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

function richTextToPlain(parts) {
  if (!Array.isArray(parts)) return "";
  return parts.map(p => String(p?.plain_text || p?.text?.content || "")).join("");
}

function blockToMarkdown(block) {
  const type = String(block?.type || "");
  if (!type) return "";
  if (type === "paragraph") return richTextToPlain(block?.paragraph?.rich_text || []);
  if (type === "heading_1") return `# ${richTextToPlain(block?.heading_1?.rich_text || [])}`;
  if (type === "heading_2") return `## ${richTextToPlain(block?.heading_2?.rich_text || [])}`;
  if (type === "heading_3") return `### ${richTextToPlain(block?.heading_3?.rich_text || [])}`;
  if (type === "bulleted_list_item") return `- ${richTextToPlain(block?.bulleted_list_item?.rich_text || [])}`;
  if (type === "numbered_list_item") return `1. ${richTextToPlain(block?.numbered_list_item?.rich_text || [])}`;
  if (type === "quote") return `> ${richTextToPlain(block?.quote?.rich_text || [])}`;
  if (type === "child_page") return `# ${String(block?.child_page?.title || "").trim()}`;
  if (type === "table_row") {
    const cells = Array.isArray(block?.table_row?.cells) ? block.table_row.cells : [];
    return `| ${cells.map(c => richTextToPlain(c)).join(" | ")} |`;
  }
  return "";
}

export default {
  async fetch(request, env) {
    const cors = corsMeta(request);
    if (!cors.allowLocal && !ALLOWED_ORIGINS.includes(cors.origin)) {
      return new Response("Forbidden origin", { status: 403, headers: cors.headers });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors.headers });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    if (request.method === "GET" && path === "/oauth/start") {
      if (!env?.NOTION_CLIENT_ID || !env?.NOTION_CLIENT_SECRET) {
        return new Response("Notion OAuth env missing", { status: 500 });
      }
      return handleOAuthStart(request, env);
    }

    if (request.method === "GET" && path === "/oauth/callback") {
      return handleOAuthCallback(request, env);
    }

    if (request.method === "POST" && path === "/auth/status") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      const raw = await readDeviceData(env, deviceId);
      const data = normalizeDeviceData(raw);
      const workspaceIds = Object.keys(data.workspaces || {});
      let selectedWorkspaceId = data.selectedWorkspaceId;
      if (!selectedWorkspaceId && workspaceIds.length) {
        selectedWorkspaceId = workspaceIds[0];
        data.selectedWorkspaceId = selectedWorkspaceId;
        await writeDeviceData(env, deviceId, data);
      }
      const connected = Boolean(workspaceIds.length);
      return jsonResponse(cors.headers, {
        connected,
        selectedWorkspaceId: selectedWorkspaceId || "",
        workspaces: Object.values(data.workspaces || {}).map(w => ({
          id: String(w?.workspace_id || "").trim(),
          name: String(w?.workspace_name || "").trim() || "Workspace"
        })).filter(w => w.id)
      });
    }

    if (request.method === "POST" && path === "/auth/workspaces") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      const raw = await readDeviceData(env, deviceId);
      const data = normalizeDeviceData(raw);
      return jsonResponse(cors.headers, {
        connected: Boolean(Object.keys(data.workspaces || {}).length),
        selectedWorkspaceId: data.selectedWorkspaceId || "",
        workspaces: Object.values(data.workspaces || {}).map(w => ({
          id: String(w?.workspace_id || "").trim(),
          name: String(w?.workspace_name || "").trim() || "Workspace"
        })).filter(w => w.id)
      });
    }

    if (request.method === "POST" && path === "/auth/workspace/select") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      const workspaceId = String(body?.workspaceId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      if (!workspaceId) return errorResponse(cors.headers, 400, "workspaceId requis");

      const raw = await readDeviceData(env, deviceId);
      const data = normalizeDeviceData(raw);
      if (!data.workspaces[workspaceId]) {
        return errorResponse(cors.headers, 400, "Workspace invalide");
      }
      data.selectedWorkspaceId = workspaceId;
      await writeDeviceData(env, deviceId, data);
      return jsonResponse(cors.headers, {
        connected: true,
        selectedWorkspaceId: workspaceId,
        workspaces: Object.values(data.workspaces || {}).map(w => ({
          id: String(w?.workspace_id || "").trim(),
          name: String(w?.workspace_name || "").trim() || "Workspace"
        })).filter(w => w.id)
      });
    }

    if (request.method === "POST" && path === "/auth/disconnect") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      await clearDeviceData(env, deviceId);
      return jsonResponse(cors.headers, { connected: false });
    }

    if (request.method === "POST" && path === "/pages/list") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      const workspaceId = String(body?.workspaceId || "").trim();
      const parentId = String(body?.parentId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      const auth = await getWorkspaceToken(env, deviceId, workspaceId).catch(() => null);
      if (!auth?.token) return errorResponse(cors.headers, 401, "Connexion Notion requise");

      try {
        const pages = await listPages(auth.token, parentId);
        return jsonResponse(cors.headers, {
          connected: true,
          selectedWorkspaceId: auth.selectedWorkspaceId,
          pages
        });
      } catch (err) {
        return errorResponse(cors.headers, 502, err?.message || "Pages Notion indisponibles");
      }
    }

    if (request.method === "POST" && path === "/pages/publish") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      const workspaceId = String(body?.workspaceId || "").trim();
      const parentId = String(body?.parentId || "").trim();
      const pageId = String(body?.pageId || "").trim();
      const eraseContent = Boolean(body?.eraseContent);
      const pathInput = String(body?.path || "").trim();
      const title = String(body?.title || "Document").trim() || "Document";
      const content = String(body?.content || "");
      const hasRecording = Boolean(body?.hasRecording);

      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      const auth = await getWorkspaceToken(env, deviceId, workspaceId).catch(() => null);
      if (!auth?.token) return errorResponse(cors.headers, 401, "Connexion Notion requise");

      try {
        const children = splitTextToBlocks(content, { hasRecording });
        let finalPageId = "";
        let finalUrl = "";

        if (pageId) {
          await notionApiFetch(auth.token, `/pages/${encodeURIComponent(pageId)}`, {
            method: "PATCH",
            body: {
              properties: {
                title: {
                  title: [{ type: "text", text: { content: title.slice(0, 200) } }]
                }
              }
            }
          });
          if (eraseContent) {
            await clearPageChildren(auth.token, pageId);
          }
          await appendBlockChildren(auth.token, pageId, children);
          const page = await getPageInfo(auth.token, pageId).catch(() => ({}));
          finalPageId = pageId;
          finalUrl = String(page?.url || "").trim();
        } else {
          let parent = null;
          if (parentId) {
            parent = { page_id: parentId };
          } else if (pathInput) {
            const resolved = await ensurePathParent(auth.token, auth.selectedWorkspaceId, pathInput);
            parent = resolved.parent;
          } else {
            parent = { workspace: true };
          }

          const created = await notionApiFetch(auth.token, "/pages", {
            method: "POST",
            body: {
              parent,
              properties: {
                title: {
                  title: [{ type: "text", text: { content: title.slice(0, 200) } }]
                }
              }
            }
          });
          finalPageId = String(created?.id || "").trim();
          finalUrl = String(created?.url || "").trim();
          if (finalPageId) {
            await appendBlockChildren(auth.token, finalPageId, children);
          }
        }

        return jsonResponse(cors.headers, {
          ok: true,
          pageId: finalPageId,
          url: finalUrl,
          selectedWorkspaceId: auth.selectedWorkspaceId
        });
      } catch (err) {
        return errorResponse(cors.headers, 502, err?.message || "Publication Notion impossible");
      }
    }

    if (request.method === "POST" && path === "/pages/content") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      const workspaceId = String(body?.workspaceId || "").trim();
      const pageId = String(body?.pageId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      if (!pageId) return errorResponse(cors.headers, 400, "pageId requis");
      const auth = await getWorkspaceToken(env, deviceId, workspaceId).catch(() => null);
      if (!auth?.token) return errorResponse(cors.headers, 401, "Connexion Notion requise");
      try {
        const page = await getPageInfo(auth.token, pageId);
        const blocks = await listAllBlockChildren(auth.token, pageId);
        const lines = [];
        for (const block of blocks) {
          if (block?.type === "table") {
            const tableRows = await listAllBlockChildren(auth.token, String(block?.id || "").trim()).catch(() => []);
            let headerDone = false;
            tableRows.forEach(row => {
              if (row?.type !== "table_row") return;
              const line = blockToMarkdown(row);
              if (!line) return;
              lines.push(line);
              if (!headerDone) {
                const cols = (Array.isArray(row?.table_row?.cells) ? row.table_row.cells.length : 0) || 1;
                lines.push(`| ${Array.from({ length: cols }).map(() => "---").join(" | ")} |`);
                headerDone = true;
              }
            });
            continue;
          }
          const line = blockToMarkdown(block);
          if (line) lines.push(line);
        }
        const props = page?.properties || {};
        const titleProp = Object.values(props).find(p => p?.type === "title");
        const title = Array.isArray(titleProp?.title)
          ? titleProp.title.map(item => item?.plain_text || "").join("").trim()
          : "";
        return jsonResponse(cors.headers, {
          ok: true,
          pageId,
          title: title || "Document",
          content: lines.join("\n\n").trim(),
          url: String(page?.url || "").trim(),
          selectedWorkspaceId: auth.selectedWorkspaceId
        });
      } catch (err) {
        return errorResponse(cors.headers, 502, err?.message || "Lecture Notion impossible");
      }
    }

    return new Response("Not found", { status: 404, headers: cors.headers });
  }
};
