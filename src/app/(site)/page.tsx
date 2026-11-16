import { BookOpen, Eye, FlaskConical, ShieldCheck, Terminal, Trophy } from "lucide-react";
import Link from "next/link";
import { moduleIcons } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { modules } from "@/content/curriculum";
import { labList } from "@/content/labs";

function HeroVisual() {
  const nodes = [
    { x: 60, y: 150, label: "Kamu", color: "#34d399" },
    { x: 220, y: 150, label: "Switch", color: "#22d3ee" },
    { x: 380, y: 70, label: "Router", color: "#f59e0b" },
    { x: 380, y: 230, label: "PC Teman", color: "#60a5fa" },
    { x: 520, y: 70, label: "Server", color: "#a78bfa" },
  ];
  const links: [number, number][] = [
    [0, 1],
    [1, 2],
    [1, 3],
    [2, 4],
  ];
  const path = (a: number, b: number) => `M${nodes[a].x},${nodes[a].y} L${nodes[b].x},${nodes[b].y}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface/80 shadow-2xl shadow-emerald-500/5">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-red-400/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-2 text-xs text-muted">lab: enkapsulasi</span>
      </div>
      <div className="grid sm:grid-cols-[1fr_1.3fr]">
        <pre className="border-b border-border bg-[#050810] p-4 font-mono text-[11px] leading-5 text-slate-300 sm:border-r sm:border-b-0">
          <span className="text-emerald-400">siswa@pc</span>:<span className="text-blue-400">~</span>$ ping server{"\n"}
          PING server (10.10.0.80){"\n"}
          64 bytes from 10.10.0.80:{"\n"}
          {"  "}icmp_seq=1 ttl=63{"\n"}
          64 bytes from 10.10.0.80:{"\n"}
          {"  "}icmp_seq=2 ttl=63{"\n"}
          <span className="text-emerald-400">siswa@pc</span>:<span className="text-blue-400">~</span>$ <span className="animate-pulse">▋</span>
        </pre>
        <svg viewBox="0 0 580 300" className="h-full w-full" role="img" aria-label="Animasi paket bergerak di jaringan">
          {links.map(([a, b]) => (
            <path key={`${a}-${b}`} d={path(a, b)} stroke="#334155" strokeWidth={2} />
          ))}
          <circle r={7} fill="#f59e0b">
            <animateMotion dur="1.2s" repeatCount="indefinite" path={path(0, 1)} />
          </circle>
          <circle r={7} fill="#22d3ee">
            <animateMotion dur="1.6s" begin="0.4s" repeatCount="indefinite" path={`${path(0, 1)} L${nodes[2].x},${nodes[2].y} L${nodes[4].x},${nodes[4].y}`} />
          </circle>
          <circle r={7} fill="#22d3ee" fillOpacity={0.8}>
            <animateMotion
              dur="1.6s"
              begin="1.2s"
              repeatCount="indefinite"
              path={`M${nodes[4].x},${nodes[4].y} L${nodes[2].x},${nodes[2].y} L${nodes[1].x},${nodes[1].y} L${nodes[0].x},${nodes[0].y}`}
            />
          </circle>
          {nodes.map((n) => (
            <g key={n.label}>
              <rect x={n.x - 22} y={n.y - 22} width={44} height={44} rx={12} fill="#0d1424" stroke={n.color} strokeWidth={2.5} />
              <text x={n.x} y={n.y + 40} textAnchor="middle" fontSize={13} fill="#e2e8f0" fontWeight={600}>
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

const features = [
  { icon: BookOpen, title: "Benar-benar dari nol", desc: "Materi berbahasa Indonesia dengan analogi sehari-hari. Tidak perlu pengalaman sebelumnya." },
  { icon: Terminal, title: "Terminal (simulasi) yang realistis", desc: "Ketik perintah Linux asli: ping, ip, traceroute, grep, chmod, dan banyak lagi." },
  { icon: Eye, title: "Lihat yang tak terlihat", desc: "Setiap paket digambarkan bergerak di peta jaringan. Klik untuk membedah isinya lapis demi lapis." },
  { icon: ShieldCheck, title: "Aman & legal", desc: "Semua berjalan di browsermu. Bereksperimen sebebasnya tanpa merusak apa pun atau melanggar hukum." },
  { icon: FlaskConical, title: "Lab bertujuan jelas", desc: "Setiap lab punya misi, petunjuk bertingkat, dan pengecekan otomatis." },
  { icon: Trophy, title: "XP & level", desc: "Kumpulkan XP dari materi, kuis, dan lab. Naik level dari Pemula hingga Elite Hacker (Etis)." },
];

export default function HomePage() {
  return (
    <main>
      <section className="bg-grid relative overflow-hidden border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent">
              <ShieldCheck className="size-3.5" /> Lab Jaringan & Cyber Security Interaktif
            </span>
            <h1 className="mt-5 text-4xl leading-tight font-bold text-white sm:text-5xl">
              Belajar jaringan & keamanan siber <span className="text-gradient">dari nol</span>, sambil melihat paketnya bergerak.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Ketik perintah di terminal, lalu saksikan apa yang benar-benar terjadi di jaringan: ARP, ping, routing, sampai serangan dan cara bertahannya.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/learn/pengenalan/selamat-datang" size="lg">
                Mulai belajar gratis
              </ButtonLink>
              <ButtonLink href="/lab/tur-lab" size="lg" variant="secondary">
                Coba lab sekarang
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-muted">
              {modules.length} modul · {labList.length} lab interaktif tersedia · tanpa instalasi
            </p>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-white">Kenapa NetSec Lab?</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-border bg-surface p-5">
              <Icon className="size-6 text-accent" />
              <h3 className="mt-3 font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white">Jalur belajar</h2>
            <p className="mt-1 text-muted">Dari fondasi Linux sampai SQL Injection dan CTF.</p>
          </div>
          <Link href="/learn" className="text-sm text-accent hover:underline">
            Lihat kurikulum lengkap →
          </Link>
        </div>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m) => {
            const Icon = moduleIcons[m.icon];
            return (
              <li key={m.slug} className={`flex items-center gap-3 rounded-lg border border-border bg-surface/60 p-3 ${m.available ? "" : "opacity-50"}`}>
                <Icon className="size-4 shrink-0 text-accent" />
                <span className="text-sm text-slate-200">
                  <span className="text-muted">{m.number}.</span> {m.title}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
