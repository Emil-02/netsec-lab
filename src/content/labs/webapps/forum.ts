import type { HttpRequest, HttpResponse } from "@/engine";
import { escapeHtml, findExecutableScript, page, param } from "@/engine/webapp/app";
import type { WebSpec } from "@/engine/topology";

export interface GuestEntry {
  nama: string;
  pesan: string;
  version: "v1" | "v2";
}

const NAV = `<a href="/">Beranda</a> <a href="/cari">Cari</a> <a href="/buku-tamu">Buku Tamu</a> <a href="/v2/buku-tamu">Buku Tamu v2 (aman)</a>`;

export function forumEntries(state: Record<string, unknown> | undefined): GuestEntry[] {
  return (state?.entries as GuestEntry[] | undefined) ?? [];
}

export function entryHasScript(e: GuestEntry) {
  return findExecutableScript(`${e.nama} ${e.pesan}`).length > 0;
}

/** Fresh guestbook + search for forum.lab (deliberately vulnerable to XSS in v1). */
export function forumWeb(): WebSpec {
  const entries: GuestEntry[] = [
    { nama: "Rina", pesan: "Forumnya bermanfaat, terima kasih!", version: "v1" },
    { nama: "Andi", pesan: "Ada yang tahu cara subnetting /27?", version: "v1" },
  ];

  const cari = (req: HttpRequest): HttpResponse => {
    const q = param(req, "q");
    const form = `<form action="/cari"><input name="q"> <button>Cari</button></form>`;
    if (!q) return { body: page("Cari", form, NAV) };
    // VULNERABLE (reflected XSS): the search term is echoed back without escaping.
    return { body: page("Cari", `${form}\n<p>Hasil pencarian untuk: ${q}</p>\n<p>Tidak ada topik yang cocok.</p>`, NAV) };
  };

  const guestbook =
    (version: "v1" | "v2") =>
    (req: HttpRequest): HttpResponse => {
      const path = version === "v1" ? "/buku-tamu" : "/v2/buku-tamu";
      if (req.method === "POST") {
        const nama = param(req, "nama").slice(0, 60) || "Anonim";
        const pesan = param(req, "pesan").slice(0, 400);
        if (pesan) entries.push({ nama, pesan, version });
        return { status: 302, headers: { Location: path }, body: "" };
      }
      // v1 is VULNERABLE (stored XSS): messages are inserted as raw HTML. v2 escapes them.
      const show = (s: string) => (version === "v1" ? s : escapeHtml(s));
      const list = entries
        .filter((e) => version === "v1" || e.version === "v2")
        .map((e) => `<div class="box"><b>${show(e.nama)}</b>: ${show(e.pesan)}</div>`)
        .join("\n");
      const form = `<form method="POST" action="${path}">Nama: <input name="nama"> Pesan: <input name="pesan"> <button>Kirim</button></form>`;
      return { body: page(version === "v1" ? "Buku Tamu" : "Buku Tamu v2 (aman)", `${form}\n${list || "<p>Belum ada pesan.</p>"}`, NAV) };
    };

  return {
    software: "nginx/1.24.0",
    state: { entries },
    routes: {
      "/": { body: page("Forum Lab", "<p>Forum diskusi jaringan.</p>", NAV) },
      "/cari": cari,
      "/buku-tamu": guestbook("v1"),
      "/v2/buku-tamu": guestbook("v2"),
    },
  };
}
