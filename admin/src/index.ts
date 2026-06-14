import { Hono } from "hono";

// hackbox admin Worker — a single self-contained page to create rooms with all
// settings, import existing rooms (e.g. the migrated persistent room), and
// monitor every room. The room listing is permanent history read from D1; live
// presence for active rooms is fetched from the relay over the service binding.
//
// It is **not** auth-gated in code: the route (hackbox.ca/admin*) is protected
// by Cloudflare Access (Zero Trust), and the relay's admin surface is reachable
// only via the service binding below.

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

const CONSONANTS = "BCDFGHJKLMNPQRSTVWXZ".split("");
const generateRoomCode = (): string =>
  [1, 2, 3, 4].map(() => CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)]).join("");

const MAX_CODE_ATTEMPTS = 8;

interface RoomSettings {
  hostId: string;
  twitchRequired: boolean;
  persistent: boolean;
  closed: boolean;
  createdAt?: number;
}

// Ask the relay to initialise a room with a specific code + settings.
function initRoom(relay: Fetcher, code: string, settings: RoomSettings): Promise<Response> {
  return relay.fetch(
    new Request(`https://relay/r/${code}/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    }),
  );
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

const app = new Hono<{ Bindings: Env }>();

app.get("/admin", (c) => c.html(PAGE));
app.get("/admin/", (c) => c.html(PAGE));

// Listing = permanent history from D1, newest first. Active rooms (no ended_at)
// are enriched with live presence from the relay.
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

  const rooms = await Promise.all(
    results.map(async (raw) => {
      const room = mapRow(raw);
      if (room.endedAt != null) return room;
      // Active per D1 — fetch live presence.
      try {
        const res = await c.env.RELAY.fetch(new Request(`https://relay/admin/room/${room.code}`));
        if (res.ok) {
          const live = (await res.json()) as {
            exists?: boolean;
            hasHost?: boolean;
            memberCount?: number;
            onlineCount?: number;
            expiresAt?: number | null;
            members?: unknown[];
          };
          return {
            ...room,
            live: live.exists !== false,
            hasHost: live.hasHost ?? false,
            memberCount: live.memberCount ?? 0,
            onlineCount: live.onlineCount ?? 0,
            expiresAt: live.expiresAt ?? null,
            members: live.members ?? [],
          };
        }
      } catch {
        /* fall through to the static row */
      }
      return room;
    }),
  );

  return c.json({ rooms });
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

// Import an existing room at a specific code (e.g. the migrated persistent
// room). Preserves the original createdAt when provided.
app.post("/admin/api/import", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const hostId = typeof body.hostId === "string" ? body.hostId.trim() : "";

  if (!/^[A-Z]{4}$/.test(code)) return c.json({ ok: false, error: "code must be 4 letters" }, 400);
  if (!hostId) return c.json({ ok: false, error: "hostId required" }, 400);

  const settings: RoomSettings = {
    hostId,
    twitchRequired: Boolean(body.twitchRequired),
    persistent: Boolean(body.persistent),
    closed: Boolean(body.closed),
    createdAt: typeof body.createdAt === "number" ? body.createdAt : undefined,
  };

  const res = await initRoom(c.env.RELAY, code, settings);
  if (res.status === 409) return c.json({ ok: false, error: "a room with that code already exists" }, 409);
  if (res.ok) return c.json({ ok: true, roomCode: code, hostId });
  return c.json({ ok: false, error: `relay init failed: ${res.status}` }, 502);
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
  input.code { width: 90px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; }
  button { background: #7c2fec; color: #fff; border: 0; border-radius: 5px; padding: 8px 14px; font: inherit; font-weight: 700; cursor: pointer; }
  button.sec { background: #2e1f4d; }
  button:disabled { opacity: .5; cursor: default; }
  .note { display: none; margin-top: 12px; padding: 10px 12px; background: #14331f; border: 1px solid #2c6e49; border-radius: 6px; }
  .note.err { background: #331616; border-color: #6e2c2c; }
  code { background: #0e0820; padding: 1px 5px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
  th { text-align: left; color: #9b86c9; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid #2e1f4d; font-size: 12px; text-transform: uppercase; }
  td { padding: 6px 8px; border-bottom: 1px solid #20153a; vertical-align: top; }
  td.code { font-weight: 800; font-size: 16px; letter-spacing: .08em; }
  .muted { color: #7d6ca5; }
  .hostId { font-family: ui-monospace, monospace; font-size: 12px; }
  .b { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11px; font-weight: 700; }
  .b.on { background: #2c6e49; color: #b7f7cf; }
  .b.off { background: #2e1f4d; color: #8c7bb5; }
  .b.end { background: #3a2a14; color: #e7c89a; }
  .m { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 12px; margin: 1px; }
  .m.on { background: #21412c; color: #bdf0cf; }
  .m.off { background: #241a3a; color: #8c7bb5; }
  .toolbar { display: flex; gap: 14px; align-items: center; }
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

  <h2>Import existing room</h2>
  <div class="card">
    <div class="row">
      <input type="text" class="code" id="i_code" maxlength="4" placeholder="CODE" />
      <input type="text" class="wide" id="i_hostId" placeholder="hostId (UUID)" />
      <label class="chk"><input type="checkbox" id="i_twitchRequired" /> twitchRequired</label>
      <label class="chk"><input type="checkbox" id="i_persistent" checked /> persistent</label>
      <label class="chk"><input type="checkbox" id="i_closed" /> closed</label>
      <button id="import">Import</button>
    </div>
    <div class="note" id="imported"></div>
  </div>

  <h2>Rooms (<span id="count">0</span>)</h2>
  <div class="toolbar">
    <button class="sec" id="refresh">Refresh</button>
    <label class="chk"><input type="checkbox" id="auto" checked /> auto-refresh (5s)</label>
  </div>
  <table>
    <thead><tr>
      <th>Code</th><th>Status</th><th>Online/Total</th><th>Settings</th>
      <th>Created</th><th>Ended / Expires</th><th>Members</th>
    </tr></thead>
    <tbody id="rooms"></tbody>
  </table>
</main>
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

  $("#gen").onclick = function () { $("#hostId").value = crypto.randomUUID(); };

  $("#create").onclick = async function () {
    var body = {
      hostId: $("#hostId").value.trim(),
      twitchRequired: $("#twitchRequired").checked,
      persistent: $("#persistent").checked,
      closed: $("#closed").checked
    };
    $("#create").disabled = true;
    try {
      var res = await fetch("/admin/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      var data = await res.json();
      if (data.ok) {
        note("#created", "Room <b>" + esc(data.roomCode) + "</b> created &middot; hostId <code>" + esc(data.hostId) + "</code>", false);
        load();
      } else {
        note("#created", "Create failed: " + esc(data.error || res.status), true);
      }
    } catch (e) { note("#created", "Create failed: " + esc(e), true); }
    finally { $("#create").disabled = false; }
  };

  $("#import").onclick = async function () {
    var body = {
      code: $("#i_code").value.trim().toUpperCase(),
      hostId: $("#i_hostId").value.trim(),
      twitchRequired: $("#i_twitchRequired").checked,
      persistent: $("#i_persistent").checked,
      closed: $("#i_closed").checked
    };
    $("#import").disabled = true;
    try {
      var res = await fetch("/admin/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      var data = await res.json();
      if (data.ok) {
        note("#imported", "Imported room <b>" + esc(data.roomCode) + "</b> &middot; hostId <code>" + esc(data.hostId) + "</code>", false);
        load();
      } else {
        note("#imported", "Import failed: " + esc(data.error || res.status), true);
      }
    } catch (e) { note("#imported", "Import failed: " + esc(e), true); }
    finally { $("#import").disabled = false; }
  };

  function statusCell(r) {
    if (r.endedAt != null) return badge(false, "ended", "end");
    if (r.live === false) return badge(false, "gone");
    return r.hasHost ? badge(true, "host connected") : badge(false, "no host");
  }

  function row(r) {
    var active = r.endedAt == null && r.live !== false;
    var members = active ? (r.members || []).map(function (m) {
      return '<span class="m ' + (m.online ? "on" : "off") + '">' + esc(m.userName || m.userId) + (m.twitch ? " &middot; " + esc(m.twitch) : "") + "</span>";
    }).join(" ") : "";
    var endCol = r.endedAt != null
      ? fmt(r.endedAt) + ' <span class="muted">(' + esc(r.endReason || "ended") + ")</span>"
      : (r.persistent ? '<span class="muted">never</span>' : fmt(r.expiresAt));
    return "<tr>" +
      '<td class="code">' + esc(r.code) + "</td>" +
      "<td>" + statusCell(r) + "</td>" +
      "<td>" + (active ? ((r.onlineCount || 0) + " / " + (r.memberCount || 0)) : '<span class="muted">—</span>') + "</td>" +
      "<td>" + badge(r.twitchRequired, "twitch") + " " + badge(r.persistent, "persist") + " " + badge(r.closed, "closed") + "</td>" +
      '<td class="muted">' + fmt(r.createdAt) + "</td>" +
      '<td class="muted">' + endCol + "</td>" +
      "<td>" + (members || '<span class="muted">—</span>') + "</td>" +
      "</tr>" +
      '<tr><td></td><td colspan="6" class="hostId muted">hostId ' + esc(r.hostId) + "</td></tr>";
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
