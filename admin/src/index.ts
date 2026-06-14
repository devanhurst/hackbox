import { Hono } from "hono";

// hackbox admin Worker — create rooms with all settings, monitor every room, and
// revive/delete them. The room listing is permanent history read from D1; live
// presence for active rooms is fetched from the relay over the service binding.
//
// Not auth-gated in code: the route (hackbox.ca/admin*) is protected by
// Cloudflare Access, and the relay's admin surface is reachable only via the
// service binding below.

interface Env {
  RELAY: Fetcher; // service binding to hackbox-relay
  DB: D1Database; // permanent room history (shared with the relay)
}

interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  twitch_required: number;
  persistent: number;
  closed: number;
  created_at: number;
  ended_at: number | null;
  end_reason: string | null;
}

interface MemberRow {
  user_id: string;
  user_name: string;
  metadata: string | null;
}

interface AdminMember {
  userId: string;
  userName: string;
  twitch: string | null;
  online: boolean;
}

const CONSONANTS = "BCDFGHJKLMNPQRSTVWXZ".split("");
const generateRoomCode = (): string =>
  [1, 2, 3, 4].map(() => CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)]).join("");

const MAX_CODE_ATTEMPTS = 8;

interface RoomSettings {
  hostId: string;
  twitchRequired: boolean;
  persistent: boolean;
  closed: boolean;
}

function initRoom(relay: Fetcher, code: string, settings: RoomSettings): Promise<Response> {
  return relay.fetch(
    new Request(`https://relay/r/${code}/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    }),
  );
}

function twitchName(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata) as { twitch?: { username?: string } };
    return m?.twitch?.username ?? null;
  } catch {
    return null;
  }
}

function parseMetadata(metadata: string | null): unknown {
  if (!metadata) return undefined;
  try {
    return JSON.parse(metadata);
  } catch {
    return undefined;
  }
}

function mapRow(r: RoomRow) {
  return {
    id: r.id,
    code: r.code,
    hostId: r.host_id,
    twitchRequired: !!r.twitch_required,
    persistent: !!r.persistent,
    closed: !!r.closed,
    createdAt: r.created_at,
    endedAt: r.ended_at,
    endReason: r.end_reason,
  };
}

async function fetchMembers(db: D1Database, roomId: string): Promise<AdminMember[]> {
  const { results } = await db
    .prepare(`SELECT user_id, user_name, metadata FROM members WHERE room_id = ?`)
    .bind(roomId)
    .all<MemberRow>();
  return results.map((m) => ({
    userId: m.user_id,
    userName: m.user_name,
    twitch: twitchName(m.metadata),
    online: false,
  }));
}

// Overlay live presence from the relay onto a room's D1 roster: flips members
// online, merges in any currently-connected members not yet flushed to D1, and
// returns live/host/expiry. Mutates `members`.
async function overlayPresence(
  env: Env,
  code: string,
  members: AdminMember[],
): Promise<{ live: boolean; hasHost: boolean; expiresAt: number | null }> {
  try {
    const res = await env.RELAY.fetch(new Request(`https://relay/admin/room/${code}`));
    if (res.ok) {
      const p = (await res.json()) as {
        exists?: boolean;
        hasHost?: boolean;
        expiresAt?: number | null;
        members?: { userId: string; userName: string; online: boolean; twitch: string | null }[];
      };
      const byId = new Map(members.map((m) => [m.userId, m]));
      for (const lm of p.members ?? []) {
        let m = byId.get(lm.userId);
        if (!m) {
          m = { userId: lm.userId, userName: lm.userName, twitch: lm.twitch ?? null, online: false };
          members.push(m);
          byId.set(lm.userId, m);
        }
        if (lm.online) m.online = true;
      }
      return { live: p.exists !== false, hasHost: Boolean(p.hasHost), expiresAt: p.expiresAt ?? null };
    }
  } catch {
    /* fall through */
  }
  return { live: false, hasHost: false, expiresAt: null };
}

const app = new Hono<{ Bindings: Env }>();

app.get("/admin", (c) => c.html(PAGE));
app.get("/admin/", (c) => c.html(PAGE));

// Listing = permanent history from D1, newest first. Returns counts only (the
// per-room roster is fetched on demand by the detail view).
app.get("/admin/api/rooms", async (c) => {
  let results: RoomRow[];
  try {
    ({ results } = await c.env.DB.prepare(
      `SELECT * FROM rooms ORDER BY created_at DESC LIMIT 200`,
    ).all<RoomRow>());
  } catch (e) {
    // Most likely the schema hasn't been applied yet (db/schema.sql).
    return c.json({ rooms: [], error: `D1 query failed: ${e}` }, 500);
  }

  // Member rosters for all listed rooms, in a single query, grouped by room.
  const membersByRoom = new Map<string, AdminMember[]>();
  if (results.length) {
    const placeholders = results.map(() => "?").join(",");
    const { results: memberRows } = await c.env.DB.prepare(
      `SELECT room_id, user_id, user_name, metadata FROM members WHERE room_id IN (${placeholders})`,
    )
      .bind(...results.map((r) => r.id))
      .all<MemberRow & { room_id: string }>();
    for (const m of memberRows) {
      const list = membersByRoom.get(m.room_id) ?? [];
      list.push({ userId: m.user_id, userName: m.user_name, twitch: twitchName(m.metadata), online: false });
      membersByRoom.set(m.room_id, list);
    }
  }

  const rooms = await Promise.all(
    results.map(async (raw) => {
      const room = mapRow(raw);
      const members = membersByRoom.get(room.id) ?? [];
      let live = false;
      let hasHost = false;
      let expiresAt: number | null = null;
      if (room.endedAt == null) {
        ({ live, hasHost, expiresAt } = await overlayPresence(c.env, room.code, members));
      }
      return {
        ...room,
        live: room.endedAt == null ? live : false,
        hasHost,
        expiresAt,
        memberCount: members.length,
        onlineCount: members.filter((m) => m.online).length,
      };
    }),
  );

  return c.json({ rooms });
});

// Detail = a single room with its full member roster (+ live presence if active).
app.get("/admin/api/room/:id", async (c) => {
  const id = c.req.param("id");
  const raw = await c.env.DB.prepare(`SELECT * FROM rooms WHERE id = ?`).bind(id).first<RoomRow>();
  if (!raw) return c.json({ error: "not found" }, 404);

  const room = mapRow(raw);
  const members = await fetchMembers(c.env.DB, id);
  let live = false;
  let hasHost = false;
  let expiresAt: number | null = null;
  if (room.endedAt == null) {
    ({ live, hasHost, expiresAt } = await overlayPresence(c.env, room.code, members));
  }

  return c.json({
    room: {
      ...room,
      live: room.endedAt == null ? live : false,
      hasHost,
      expiresAt,
      members,
      memberCount: members.length,
      onlineCount: members.filter((m) => m.online).length,
    },
  });
});

// Create a room with all settings (random code). hostId generated if absent.
app.post("/admin/api/rooms", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const hostId = (typeof body.hostId === "string" && body.hostId.trim()) || crypto.randomUUID();
  const settings: RoomSettings = {
    hostId,
    twitchRequired: Boolean(body.twitchRequired),
    persistent: Boolean(body.persistent),
    closed: Boolean(body.closed),
  };

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    const res = await initRoom(c.env.RELAY, code, settings);
    if (res.status === 409) continue;
    if (res.ok) return c.json({ ok: true, roomCode: code, hostId });
    return c.json({ ok: false, error: `relay init failed: ${res.status}` }, 502);
  }

  return c.json({ ok: false, error: "could not allocate a room code" }, 503);
});

// Revive a room in place: re-create the live Room DO at its code, reusing the
// same history row id and seeding its members back from D1. No new row.
app.post("/admin/api/revive", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return c.json({ ok: false, error: "id required" }, 400);

  const row = await c.env.DB.prepare(`SELECT * FROM rooms WHERE id = ?`).bind(id).first<RoomRow>();
  if (!row) return c.json({ ok: false, error: "room not found" }, 404);

  const { results: memberRows } = await c.env.DB.prepare(
    `SELECT user_id, user_name, metadata FROM members WHERE room_id = ?`,
  )
    .bind(id)
    .all<MemberRow>();
  const members = memberRows.map((m) => ({
    userId: m.user_id,
    userName: m.user_name,
    metadata: parseMetadata(m.metadata),
  }));

  const res = await c.env.RELAY.fetch(
    new Request(`https://relay/r/${row.code}/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restore: true,
        id: row.id,
        hostId: row.host_id,
        twitchRequired: !!row.twitch_required,
        persistent: !!row.persistent,
        closed: !!row.closed,
        members,
      }),
    }),
  );

  if (res.status === 409) return c.json({ ok: false, error: `${row.code} is currently live` }, 409);
  if (res.ok) return c.json({ ok: true, roomCode: row.code, hostId: row.host_id });
  return c.json({ ok: false, error: `relay init failed: ${res.status}` }, 502);
});

// Delete a room entirely: destroy the live Room DO (freeing its code) and remove
// its history rows (the room + its members) from D1.
app.post("/admin/api/delete", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return c.json({ ok: false, error: "id required" }, 400);

  const row = await c.env.DB.prepare(`SELECT code FROM rooms WHERE id = ?`).bind(id).first<{ code: string }>();
  if (!row) return c.json({ ok: false, error: "room not found" }, 404);

  await c.env.RELAY.fetch(
    new Request(`https://relay/admin/room/${row.code}?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  );
  await c.env.DB.prepare(`DELETE FROM members WHERE room_id = ?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM rooms WHERE id = ?`).bind(id).run();

  return c.json({ ok: true, roomCode: row.code });
});

export default app;

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>hackbox admin</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #120a20; color: #eee; }
  header { background: #7c2fec; padding: 12px 20px; font-weight: 800; font-size: 20px; }
  main { max-width: 1180px; margin: 0 auto; padding: 20px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .05em; color: #c9b6f5; margin: 24px 0 8px; }
  .card { background: #1c1233; border: 1px solid #2e1f4d; border-radius: 8px; padding: 16px; }
  .row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  label.chk { display: flex; gap: 6px; align-items: center; font-size: 14px; }
  input[type=text] { background: #0e0820; border: 1px solid #2e1f4d; color: #eee; padding: 8px 10px; border-radius: 5px; font: inherit; }
  input.wide { min-width: 320px; }
  button { background: #7c2fec; color: #fff; border: 0; border-radius: 5px; padding: 8px 14px; font: inherit; font-weight: 700; cursor: pointer; }
  button.sec { background: #2e1f4d; }
  button.mini { padding: 3px 10px; font-size: 12px; font-weight: 700; background: #2e1f4d; }
  button.danger { background: #5e2030; }
  button:disabled { opacity: .5; cursor: default; }
  .note { display: none; margin-top: 12px; padding: 10px 12px; background: #14331f; border: 1px solid #2c6e49; border-radius: 6px; }
  .note.err { background: #331616; border-color: #6e2c2c; }
  code { background: #0e0820; padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
  th { text-align: left; color: #9b86c9; font-weight: 600; padding: 8px; border-bottom: 1px solid #2e1f4d; font-size: 12px; text-transform: uppercase; }
  td { padding: 8px; border-bottom: 1px solid #20153a; vertical-align: middle; }
  td.code { font-weight: 800; font-size: 16px; letter-spacing: .08em; }
  td.actions { text-align: right; white-space: nowrap; }
  td.actions button { margin-left: 6px; }
  .muted { color: #7d6ca5; }
  a.link { color: #d7c8fb; cursor: pointer; text-decoration: none; }
  a.link:hover { text-decoration: underline; }
  .b { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11px; font-weight: 700; }
  .b.on { background: #2c6e49; color: #b7f7cf; }
  .b.off { background: #2e1f4d; color: #8c7bb5; }
  .b.end { background: #3a2a14; color: #e7c89a; }
  .m { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 12px; margin: 1px; }
  .m.on { background: #21412c; color: #bdf0cf; }
  .m.off { background: #241a3a; color: #8c7bb5; }
  .toolbar { display: flex; gap: 14px; align-items: center; }

  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.6); align-items: flex-start; justify-content: center; padding: 40px 16px; overflow: auto; z-index: 50; }
  .modal { background: #1c1233; border: 1px solid #2e1f4d; border-radius: 10px; width: 100%; max-width: 760px; padding: 18px; }
  .modal-head { display: flex; justify-content: space-between; align-items: center; font-size: 18px; font-weight: 800; margin-bottom: 14px; }
  .kvs { display: grid; grid-template-columns: max-content 1fr; gap: 7px 18px; margin-bottom: 16px; }
  .kv { display: contents; }
  .kv .k { color: #9b86c9; font-size: 13px; }
  .kv .v { font-size: 14px; }
  .modal h3 { font-size: 12px; text-transform: uppercase; color: #c9b6f5; margin: 8px 0; }
  .members-block { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 16px; max-height: 320px; overflow: auto; }
  .modal-actions { display: flex; gap: 8px; }
</style>
</head>
<body>
<header>hackbox admin</header>
<main>
  <h2>Create room</h2>
  <div class="card">
    <div class="row">
      <input type="text" class="wide" id="hostId" placeholder="hostId (UUID) — leave blank to generate" />
      <button class="sec" id="gen">Generate</button>
      <label class="chk"><input type="checkbox" id="twitchRequired" /> twitchRequired</label>
      <label class="chk"><input type="checkbox" id="persistent" /> persistent</label>
      <label class="chk"><input type="checkbox" id="closed" /> closed</label>
      <button id="create">Create room</button>
    </div>
    <div class="note" id="created"></div>
  </div>

  <h2>Rooms (<span id="count">0</span>)</h2>
  <div class="toolbar">
    <button class="sec" id="refresh">Refresh</button>
    <label class="chk"><input type="checkbox" id="auto" checked /> auto-refresh (5s)</label>
  </div>
  <table>
    <thead><tr>
      <th>Code</th><th>Status</th><th>Members</th><th>Settings</th>
      <th>Created</th><th>Ended / Expires</th><th></th>
    </tr></thead>
    <tbody id="rooms"></tbody>
  </table>
</main>

<div id="modal" class="modal-overlay">
  <div class="modal">
    <div class="modal-head"><span id="m_title"></span><button class="sec" id="m_close">Close</button></div>
    <div id="m_body"></div>
  </div>
</div>

<script>
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function fmt(ts) { return ts ? new Date(ts).toLocaleString() : "—"; }
  function badge(on, label, cls) { return '<span class="b ' + (cls || (on ? "on" : "off")) + '">' + label + "</span>"; }

  function note(id, msg, isErr) {
    var el = $(id);
    el.style.display = "block";
    el.className = "note" + (isErr ? " err" : "");
    el.innerHTML = msg;
  }

  function statusBadge(r) {
    if (r.endedAt != null) return badge(false, "ended", "end");
    if (r.live === false) return badge(false, "gone");
    return r.hasHost ? badge(true, "host connected") : badge(false, "no host");
  }
  function settingsBadges(r) {
    return badge(r.twitchRequired, "twitch") + " " + badge(r.persistent, "persist") + " " + badge(r.closed, "closed");
  }
  function endCol(r) {
    if (r.endedAt != null) return fmt(r.endedAt) + ' <span class="muted">(' + esc(r.endReason || "ended") + ")</span>";
    return r.persistent ? '<span class="muted">never</span>' : fmt(r.expiresAt);
  }
  function actions(r) {
    var live = r.endedAt == null && r.live !== false;
    var revive = live ? "" : '<button class="mini" data-revive="' + esc(r.id) + '">revive</button>';
    var del = '<button class="mini danger" data-delete="' + esc(r.id) + '">delete</button>';
    return revive + del;
  }

  // --- create ---
  $("#gen").onclick = function () { $("#hostId").value = crypto.randomUUID(); };
  $("#create").onclick = async function () {
    var body = { hostId: $("#hostId").value.trim(), twitchRequired: $("#twitchRequired").checked, persistent: $("#persistent").checked, closed: $("#closed").checked };
    $("#create").disabled = true;
    try {
      var res = await fetch("/admin/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      var data = await res.json();
      if (data.ok) { note("#created", "Room <b>" + esc(data.roomCode) + "</b> created &middot; hostId <code>" + esc(data.hostId) + "</code>", false); load(); }
      else { note("#created", "Create failed: " + esc(data.error || res.status), true); }
    } catch (e) { note("#created", "Create failed: " + esc(e), true); }
    finally { $("#create").disabled = false; }
  };

  // --- actions ---
  async function reviveRoom(id) {
    if (!confirm("Revive this room? It re-creates a live room at this code with its saved settings and members.")) return;
    try {
      var res = await fetch("/admin/api/revive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: id }) });
      var data = await res.json();
      if (data.ok) { closeModal(); load(); } else { alert("Revive failed: " + (data.error || res.status)); }
    } catch (e) { alert("Revive failed: " + e); }
  }
  async function deleteRoom(id) {
    if (!confirm("Delete this room entirely? This destroys the live room (freeing its code) and removes it and its members from history. This cannot be undone.")) return;
    try {
      var res = await fetch("/admin/api/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: id }) });
      var data = await res.json();
      if (data.ok) { closeModal(); load(); } else { alert("Delete failed: " + (data.error || res.status)); }
    } catch (e) { alert("Delete failed: " + e); }
  }

  // --- detail modal ---
  function closeModal() { $("#modal").style.display = "none"; }
  function kv(k, v) { return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v + "</div></div>"; }
  function renderDetail(r) {
    $("#m_title").textContent = "Room " + r.code;
    var info =
      kv("Status", statusBadge(r)) +
      kv("Members", (r.onlineCount || 0) + " online / " + (r.memberCount || 0) + " total") +
      kv("Settings", settingsBadges(r)) +
      kv("hostId", "<code>" + esc(r.hostId) + "</code>") +
      kv("Created", fmt(r.createdAt)) +
      kv("Ended / Expires", endCol(r)) +
      kv("Room id", "<code>" + esc(r.id) + "</code>");
    var members = (r.members || []).map(function (m) {
      return '<span class="m ' + (m.online ? "on" : "off") + '">' + esc(m.userName || m.userId) + (m.twitch ? " &middot; " + esc(m.twitch) : "") + "</span>";
    }).join(" ");
    $("#m_body").innerHTML =
      '<div class="kvs">' + info + "</div>" +
      "<h3>Members</h3>" +
      '<div class="members-block">' + (members || '<span class="muted">none</span>') + "</div>" +
      '<div class="modal-actions">' + actions(r) + "</div>";
  }
  async function openRoom(id) {
    $("#modal").style.display = "flex";
    $("#m_title").textContent = "Room";
    $("#m_body").innerHTML = '<div class="muted">Loading…</div>';
    try {
      var res = await fetch("/admin/api/room/" + encodeURIComponent(id));
      var data = await res.json();
      if (data.room) renderDetail(data.room);
      else $("#m_body").innerHTML = '<div class="muted">Not found.</div>';
    } catch (e) { $("#m_body").innerHTML = '<div class="muted">Failed to load.</div>'; }
  }
  $("#m_close").onclick = closeModal;
  $("#modal").addEventListener("click", function (e) { if (e.target === $("#modal")) closeModal(); });

  // --- table ---
  function row(r) {
    return "<tr>" +
      '<td class="code"><a class="link" data-room="' + esc(r.id) + '">' + esc(r.code) + "</a></td>" +
      "<td>" + statusBadge(r) + "</td>" +
      "<td>" + (r.onlineCount || 0) + " / " + (r.memberCount || 0) + "</td>" +
      "<td>" + settingsBadges(r) + "</td>" +
      '<td class="muted">' + fmt(r.createdAt) + "</td>" +
      '<td class="muted">' + endCol(r) + "</td>" +
      '<td class="actions">' + actions(r) + "</td>" +
      "</tr>";
  }
  async function load() {
    try {
      var res = await fetch("/admin/api/rooms");
      var data = await res.json();
      var rooms = data.rooms || [];
      $("#count").textContent = rooms.length;
      $("#rooms").innerHTML = rooms.length ? rooms.map(row).join("") : '<tr><td colspan="7" class="muted">No rooms yet.</td></tr>';
    } catch (e) {
      $("#rooms").innerHTML = '<tr><td colspan="7" class="muted">Failed to load.</td></tr>';
    }
  }

  // Delegated clicks for room links + per-row/modal action buttons.
  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var link = e.target.closest("[data-room]");
    if (link) { openRoom(link.getAttribute("data-room")); return; }
    var rev = e.target.closest("[data-revive]");
    if (rev) { reviveRoom(rev.getAttribute("data-revive")); return; }
    var del = e.target.closest("[data-delete]");
    if (del) { deleteRoom(del.getAttribute("data-delete")); return; }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  var timer = null;
  function setAuto(on) {
    if (timer) { clearInterval(timer); timer = null; }
    if (on) timer = setInterval(load, 5000);
  }
  $("#auto").onchange = function (e) { setAuto(e.target.checked); };
  $("#refresh").onclick = load;
  setAuto(true);
  load();
</script>
</body>
</html>`;
