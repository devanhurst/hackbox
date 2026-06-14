import { DurableObject } from "cloudflare:workers";
import { getServerByName } from "partyserver";
import type { Room } from "./main";

// DEPRECATED — superseded by permanent D1 room history (the Room DO now writes
// its lifecycle directly to D1; the admin reads the listing from D1). This class
// is no longer instantiated. It is kept only so the already-applied `v2`
// durable-object migration still references a valid class; remove it via a
// `deleted_classes` migration once safe.

// Static metadata recorded at room creation. Live presence (host connected,
// member roster) is fetched fresh from each Room DO on `/list`.
export interface RoomMeta {
  code: string;
  hostId: string;
  twitchRequired: boolean;
  persistent: boolean;
  closed: boolean;
  createdAt: number;
}

interface Env {
  Main: DurableObjectNamespace<Room>;
}

const INDEX_KEY = "index";

export class Registry extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;

    if (req.method === "POST" && path.endsWith("/register")) {
      const meta = (await req.json()) as RoomMeta;
      const index = await this.read();
      index[meta.code] = meta;
      await this.ctx.storage.put(INDEX_KEY, index);
      return Response.json({ ok: true });
    }

    if (req.method === "POST" && path.endsWith("/deregister")) {
      const { code } = (await req.json()) as { code: string };
      const index = await this.read();
      if (index[code]) {
        delete index[code];
        await this.ctx.storage.put(INDEX_KEY, index);
      }
      return Response.json({ ok: true });
    }

    if (req.method === "GET" && path.endsWith("/list")) {
      const index = await this.read();
      const codes = Object.keys(index);

      // Fetch a live snapshot from each registered room in parallel.
      const rooms = await Promise.all(
        codes.map(async (code) => {
          try {
            const stub = await getServerByName(this.env.Main, code);
            const res = await stub.fetch(new Request(`https://relay/admin/room/${code}`));
            if (!res.ok) return { ...index[code], exists: false };
            return (await res.json()) as Record<string, unknown> & { exists?: boolean };
          } catch {
            return { ...index[code], exists: false };
          }
        }),
      );

      // Self-heal: drop rooms that no longer exist (e.g. expired without a clean
      // deregister) from the index.
      const gone = rooms
        .filter((r) => r.exists === false)
        .map((r) => (r as { code: string }).code);
      if (gone.length) {
        for (const code of gone) delete index[code];
        await this.ctx.storage.put(INDEX_KEY, index);
      }

      const active = rooms.filter((r) => r.exists !== false);
      active.sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
      return Response.json({ rooms: active });
    }

    return new Response("Not found", { status: 404 });
  }

  private async read(): Promise<Record<string, RoomMeta>> {
    return (await this.ctx.storage.get<Record<string, RoomMeta>>(INDEX_KEY)) ?? {};
  }
}
