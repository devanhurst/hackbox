import { Hono } from "hono";

// hackbox admin Worker — a single self-contained page to create rooms with all
// settings and monitor every active room. It is **not** auth-gated in code: the
// route (hackbox.ca/admin*) is protected by Cloudflare Access (Zero Trust), and
// the relay's admin surface is reachable only via the service binding below.

interface Env {
  RELAY: Fetcher; // service binding to hackbox-relay
}

const CONSONANTS = "BCDFGHJKLMNPQRSTVWXZ".split("");
const generateRoomCode = (): string =>
  [1, 2, 3, 4].map(() => CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)]).join("");

const MAX_CODE_ATTEMPTS = 8;

const app = new Hono<{ Bindings: Env }>();

app.get("/admin", (c) => c.html(PAGE));
app.get("/admin/", (c) => c.html(PAGE));

// List every active room with live status (registry listing + per-room presence,
// aggregated by the relay's Registry DO).
app.get("/admin/api/rooms", async (c) => {
  const res = await c.env.RELAY.fetch(new Request("https://relay/admin/rooms"));
  if (!res.ok) return c.json({ rooms: [], error: `relay list failed: ${res.status}` }, 502);
  return c.json(await res.json());
});

// Create a room with all available settings. hostId is generated if not given
// and returned so it can be configured into the host.
app.post("/admin/api/rooms", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const hostId = (typeof body.hostId === "string" && body.hostId.trim()) || crypto.randomUUID();
  const settings = {
    hostId,
    twitchRequired: Boolean(body.twitchRequired),
    persistent: Boolean(body.persistent),
    closed: Boolean(body.closed),
  };

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    const res = await c.env.RELAY.fetch(
      new Request(`https://relay/r/${code}/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      }),
    );
    if (res.status === 409) continue; // code taken, retry
    if (res.ok) return c.json({ ok: true, roomCode: code, hostId });
    return c.json({ ok: false, error: `relay init failed: ${res.status}` }, 502);
  }

  return c.json({ ok: false, error: "could not allocate a room code" }, 503);
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
  main { max-width: 1100px; margin: 0 auto; padding: 20px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .05em; color: #c9b6f5; margin: 24px 0 8px; }
  .card { background: #1c1233; border: 1px solid #2e1f4d; border-radius: 8px; padding: 16px; }
  .row { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }
  label.chk { display: flex; gap: 6px; align-items: center; font-size: 14px; }
  input[type=text] { background: #0e0820; border: 1px solid #2e1f4d; color: #eee; padding: 8px 10px; border-radius: 5px; font: inherit; min-width: 320px; }
  button { background: #7c2fec; color: #fff; border: 0; border-radius: 5px; padding: 8px 14px; font: inherit; font-weight: 700; cursor: pointer; }
  button.sec { background: #2e1f4d; }
  button:disabled { opacity: .5; cursor: default; }
  #created { display: none; margin-top: 12px; padding: 10px 12px; background: #14331f; border: 1px solid #2c6e49; border-radius: 6px; }
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
      <input type="text" id="hostId" placeholder="hostId (UUID) — leave blank to generate" />
      <button class="sec" id="gen">Generate</button>
      <label class="chk"><input type="checkbox" id="twitchRequired" /> twitchRequired</label>
      <label class="chk"><input type="checkbox" id="persistent" /> persistent</label>
      <label class="chk"><input type="checkbox" id="closed" /> closed</label>
      <button id="create">Create room</button>
    </div>
    <div id="created"></div>
  </div>

  <h2>Active rooms (<span id="count">0</span>)</h2>
  <div class="toolbar">
    <button class="sec" id="refresh">Refresh</button>
    <label class="chk"><input type="checkbox" id="auto" checked /> auto-refresh (5s)</label>
  </div>
  <table>
    <thead><tr>
      <th>Code</th><th>Host</th><th>Online/Total</th><th>Settings</th>
      <th>Created</th><th>Expires</th><th>Members</th>
    </tr></thead>
    <tbody id="rooms"></tbody>
  </table>
</main>
<script>
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function fmt(ts) { return ts ? new Date(ts).toLocaleString() : "—"; }
  function badge(on, label) { return '<span class="b ' + (on ? "on" : "off") + '">' + label + "</span>"; }

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
        var el = $("#created");
        el.style.display = "block";
        el.innerHTML = "Room <b>" + esc(data.roomCode) + "</b> created &middot; hostId <code>" + esc(data.hostId) + "</code>";
        load();
      } else {
        alert("Create failed: " + (data.error || res.status));
      }
    } catch (e) {
      alert("Create failed: " + e);
    } finally {
      $("#create").disabled = false;
    }
  };

  function row(r) {
    var members = (r.members || []).map(function (m) {
      return '<span class="m ' + (m.online ? "on" : "off") + '">' + esc(m.userName || m.userId) + (m.twitch ? " · " + esc(m.twitch) : "") + "</span>";
    }).join(" ");
    return "<tr>" +
      '<td class="code">' + esc(r.code) + "</td>" +
      "<td>" + (r.hasHost ? badge(true, "connected") : badge(false, "no host")) + "</td>" +
      "<td>" + (r.onlineCount || 0) + " / " + (r.memberCount || 0) + "</td>" +
      "<td>" + badge(r.twitchRequired, "twitch") + " " + badge(r.persistent, "persist") + " " + badge(r.closed, "closed") + "</td>" +
      '<td class="muted">' + fmt(r.createdAt) + "</td>" +
      '<td class="muted">' + fmt(r.expiresAt) + "</td>" +
      '<td>' + (members || '<span class="muted">—</span>') + "</td>" +
      "</tr>" +
      '<tr><td></td><td colspan="6" class="hostId muted">hostId ' + esc(r.hostId) + "</td></tr>";
  }

  async function load() {
    try {
      var res = await fetch("/admin/api/rooms");
      var data = await res.json();
      var rooms = data.rooms || [];
      $("#count").textContent = rooms.length;
      $("#rooms").innerHTML = rooms.length ? rooms.map(row).join("") : '<tr><td colspan="7" class="muted">No active rooms.</td></tr>';
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
