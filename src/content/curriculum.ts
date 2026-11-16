export type ModuleIcon =
  | "rocket"
  | "terminal"
  | "network"
  | "layers"
  | "binary"
  | "cable"
  | "route"
  | "arrow-left-right"
  | "globe"
  | "shield"
  | "radar"
  | "eye"
  | "key"
  | "brick-wall"
  | "bug"
  | "flag";

export type Track = "Fondasi" | "Jaringan" | "Keamanan" | "Web" | "CTF";

export interface LessonMeta {
  slug: string;
  title: string;
  minutes: number;
  labId?: string;
}

export interface ModuleMeta {
  slug: string;
  number: number;
  title: string;
  description: string;
  icon: ModuleIcon;
  track: Track;
  available: boolean;
  lessons: LessonMeta[];
}

export const modules: ModuleMeta[] = [
  {
    slug: "pengenalan",
    number: 0,
    title: "Pengenalan",
    description: "Apa itu jaringan & keamanan siber, etika hacking, dan cara memakai lab interaktif.",
    icon: "rocket",
    track: "Fondasi",
    available: true,
    lessons: [
      { slug: "selamat-datang", title: "Selamat Datang di NetSec Lab", minutes: 5 },
      { slug: "etika-dan-hukum", title: "Etika Hacking & Hukum", minutes: 8 },
      { slug: "tur-lab", title: "Tur Lab Interaktif", minutes: 10, labId: "tur-lab" },
    ],
  },
  {
    slug: "linux-dasar",
    number: 1,
    title: "Dasar Linux & Command Line",
    description: "Terminal, navigasi file system, mengelola file, permission, serta pipe & grep.",
    icon: "terminal",
    track: "Fondasi",
    available: true,
    lessons: [
      { slug: "terminal-dan-shell", title: "Apa itu Terminal & Shell?", minutes: 7 },
      { slug: "navigasi-file-system", title: "Navigasi File System", minutes: 12, labId: "linux-navigasi" },
      { slug: "mengelola-file", title: "Membuat & Mengelola File", minutes: 12, labId: "linux-file" },
      { slug: "user-dan-permission", title: "User, sudo & Permission", minutes: 12, labId: "linux-permission" },
      { slug: "pipe-dan-grep", title: "Pipe, Redirect & grep", minutes: 12, labId: "linux-log-hunt" },
    ],
  },
  {
    slug: "konsep-jaringan",
    number: 2,
    title: "Konsep Dasar Jaringan",
    description: "Host, client-server, LAN/WAN, perangkat jaringan, dan topologi.",
    icon: "network",
    track: "Jaringan",
    available: true,
    lessons: [
      { slug: "apa-itu-jaringan", title: "Apa itu Jaringan Komputer?", minutes: 8 },
      { slug: "perangkat-jaringan", title: "Perangkat Jaringan", minutes: 10 },
      { slug: "topologi-jaringan", title: "Topologi Jaringan", minutes: 8 },
      { slug: "hub-vs-switch", title: "Praktik: Hub vs Switch", minutes: 12, labId: "hub-vs-switch" },
    ],
  },
  {
    slug: "model-osi",
    number: 3,
    title: "Model OSI & TCP/IP",
    description: "Tujuh layer OSI, model TCP/IP, dan bagaimana data dibungkus (enkapsulasi).",
    icon: "layers",
    track: "Jaringan",
    available: true,
    lessons: [
      { slug: "kenapa-berlapis", title: "Kenapa Jaringan Dibuat Berlapis?", minutes: 6 },
      { slug: "tujuh-layer-osi", title: "7 Layer OSI", minutes: 12 },
      { slug: "tcp-ip-dan-enkapsulasi", title: "TCP/IP & Enkapsulasi", minutes: 12, labId: "enkapsulasi" },
    ],
  },
  {
    slug: "ip-subnetting",
    number: 4,
    title: "IP Address & Subnetting",
    description: "Alamat IP & MAC, biner, subnet mask, CIDR, menghitung subnet, dan gateway.",
    icon: "binary",
    track: "Jaringan",
    available: true,
    lessons: [
      { slug: "alamat-ip-dan-mac", title: "Alamat IP & MAC", minutes: 10 },
      { slug: "biner-dan-subnet-mask", title: "Biner, Subnet Mask & CIDR", minutes: 15 },
      { slug: "menghitung-subnet", title: "Menghitung Subnet", minutes: 15 },
      { slug: "gateway-dan-konfigurasi-ip", title: "Gateway & Konfigurasi IP", minutes: 15, labId: "konfigurasi-ip" },
    ],
  },
  {
    slug: "layer-2",
    number: 5,
    title: "Layer 2: MAC, ARP & Switching",
    description: "Cara switch belajar MAC address, protokol ARP, dan memisahkan jaringan dengan VLAN.",
    icon: "cable",
    track: "Jaringan",
    available: true,
    lessons: [
      { slug: "arp", title: "ARP: Dari IP ke MAC", minutes: 12, labId: "arp" },
      { slug: "mac-table", title: "Switch & MAC Address Table", minutes: 12, labId: "mac-table" },
      { slug: "vlan", title: "VLAN & Trunk", minutes: 15, labId: "vlan" },
    ],
  },
  {
    slug: "routing",
    number: 6,
    title: "Routing & NAT",
    description: "Tabel routing & longest prefix match, static route antar router, dan NAT.",
    icon: "route",
    track: "Jaringan",
    available: true,
    lessons: [
      { slug: "tabel-routing", title: "Tabel Routing", minutes: 10 },
      { slug: "static-route", title: "Static Route", minutes: 15, labId: "static-route" },
      { slug: "nat", title: "NAT & IP Publik", minutes: 15, labId: "nat" },
    ],
  },
  {
    slug: "transport",
    number: 7,
    title: "Transport: TCP & UDP",
    description: "Port & socket, three-way handshake, serta perbedaan TCP dan UDP.",
    icon: "arrow-left-right",
    track: "Jaringan",
    available: true,
    lessons: [
      { slug: "port", title: "Port & Layanan", minutes: 12, labId: "port-layanan" },
      { slug: "tcp-handshake", title: "TCP 3-Way Handshake", minutes: 12, labId: "tcp-handshake" },
      { slug: "udp", title: "UDP", minutes: 8 },
    ],
  },
  {
    slug: "layanan-aplikasi",
    number: 8,
    title: "Layanan Aplikasi",
    description: "DNS, DHCP, serta HTTP & HTTPS — layanan yang kamu pakai setiap hari.",
    icon: "globe",
    track: "Jaringan",
    available: true,
    lessons: [
      { slug: "dns", title: "DNS", minutes: 15, labId: "dns" },
      { slug: "dhcp", title: "DHCP", minutes: 12, labId: "dhcp" },
      { slug: "http", title: "HTTP & HTTPS", minutes: 15, labId: "http" },
    ],
  },
  {
    slug: "dasar-keamanan",
    number: 9,
    title: "Dasar Keamanan Siber",
    description: "CIA triad, ancaman & kerentanan, serta encoding vs enkripsi vs hashing.",
    icon: "shield",
    track: "Keamanan",
    available: true,
    lessons: [
      { slug: "cia-triad", title: "CIA Triad & Konsep Dasar", minutes: 10 },
      { slug: "kriptografi", title: "Encoding, Enkripsi & Hashing", minutes: 15, labId: "kripto-dasar" },
    ],
  },
  {
    slug: "reconnaissance",
    number: 10,
    title: "Reconnaissance & Scanning",
    description: "Recon pasif & aktif, OSINT, dan memetakan jaringan dengan nmap.",
    icon: "radar",
    track: "Keamanan",
    available: true,
    lessons: [
      { slug: "recon-dan-osint", title: "Reconnaissance & OSINT", minutes: 10 },
      { slug: "nmap", title: "Port Scanning dengan nmap", minutes: 18, labId: "nmap-recon" },
    ],
  },
  {
    slug: "sniffing-mitm",
    number: 11,
    title: "Sniffing & Man-in-the-Middle",
    description: "Menyadap lalu lintas dengan tcpdump, serta mendeteksi & menangkal ARP spoofing.",
    icon: "eye",
    track: "Keamanan",
    available: true,
    lessons: [
      { slug: "sniffing", title: "Sniffing dengan tcpdump", minutes: 15, labId: "sniffing" },
      { slug: "arp-spoofing", title: "ARP Spoofing & Man-in-the-Middle", minutes: 15, labId: "deteksi-arp-spoofing" },
    ],
  },
  {
    slug: "serangan-password",
    number: 12,
    title: "Serangan Password",
    description: "Serangan online & offline, kenapa MD5 tanpa salt berbahaya, dan cara membuat password kuat.",
    icon: "key",
    track: "Keamanan",
    available: true,
    lessons: [{ slug: "serangan-password", title: "Serangan Password & Pertahanannya", minutes: 15, labId: "audit-password" }],
  },
  {
    slug: "pertahanan-jaringan",
    number: 13,
    title: "Pertahanan Jaringan",
    description: "Firewall iptables dengan prinsip default deny, log, IDS, dan respons insiden.",
    icon: "brick-wall",
    track: "Keamanan",
    available: true,
    lessons: [
      { slug: "firewall", title: "Firewall dengan iptables", minutes: 18, labId: "firewall-server" },
      { slug: "ids-dan-respons", title: "Log, IDS & Respons Insiden", minutes: 15, labId: "respons-insiden" },
    ],
  },
  {
    slug: "web-security",
    number: 14,
    title: "Web Security",
    description: "Cara kerja web, OWASP Top 10, SQL Injection, dan XSS.",
    icon: "bug",
    track: "Web",
    available: false,
    lessons: [
      { slug: "sql-injection", title: "SQL Injection", minutes: 20 },
      { slug: "xss", title: "Cross-Site Scripting (XSS)", minutes: 20 },
    ],
  },
  {
    slug: "ctf-mini",
    number: 15,
    title: "CTF Mini",
    description: "Tantangan gabungan: recon → exploit → temukan flag!",
    icon: "flag",
    track: "CTF",
    available: false,
    lessons: [{ slug: "pengenalan-ctf", title: "Pengenalan CTF", minutes: 10 }],
  },
];

export function getModule(slug: string) {
  return modules.find((m) => m.slug === slug);
}

export function getLesson(moduleSlug: string, lessonSlug: string) {
  const mod = getModule(moduleSlug);
  const lesson = mod?.lessons.find((l) => l.slug === lessonSlug);
  return mod && lesson ? { module: mod, lesson } : null;
}

export function lessonKey(moduleSlug: string, lessonSlug: string) {
  return `${moduleSlug}/${lessonSlug}`;
}

/** Flat, ordered list of every available lesson (for prev/next navigation). */
export function allAvailableLessons() {
  return modules.filter((m) => m.available).flatMap((m) => m.lessons.map((l) => ({ module: m, lesson: l })));
}

export function findLessonForLab(labId: string) {
  return allAvailableLessons().find((x) => x.lesson.labId === labId) ?? null;
}
