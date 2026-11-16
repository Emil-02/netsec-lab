import type { LabDefinition, TopologySpec } from "@/engine";
import { fileAt, has, hasMatch } from "./helpers";

const LINUX_COMMANDS = ["pwd", "ls", "cd", "cat", "echo", "mkdir", "touch", "rm", "mv", "cp", "chmod", "whoami", "hostname", "man", "history", "uname", "date", "grep", "head", "tail", "wc"];

function singlePc(files: TopologySpec["devices"][number]["files"]): TopologySpec {
  return {
    devices: [{ id: "pc", name: "Komputer Kamu", hostname: "netsec", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "192.168.1.10/24" }], files }],
    links: [],
  };
}

export const linuxNavigasi: LabDefinition = {
  id: "linux-navigasi",
  title: "Menjelajah File System",
  summary: "Gunakan pwd, ls, dan cd untuk menjelajah direktori dan menemukan pesan tersembunyi.",
  difficulty: "pemula",
  estimatedMinutes: 10,
  xp: 60,
  controllable: ["pc"],
  allowedCommands: LINUX_COMMANDS,
  briefing: [
    "Seorang admin meninggalkan pesan rahasia di suatu tempat di folder home-mu. Pesan itu disimpan di file tersembunyi (nama file diawali titik).",
    "Gunakan perintah navigasi yang sudah kamu pelajari untuk menemukannya.",
  ],
  topology: singlePc({
    "dokumen/catatan.txt": "Belanja: kabel LAN, switch 8 port, crimping tool\n",
    "dokumen/rahasia/.pesan-admin": "Selamat! Kamu menemukan file tersembunyi.\nKode: NAVIGATOR-01\n",
    "dokumen/rahasia/bukan-di-sini.txt": "Hmm, coba lihat file tersembunyi dengan ls -a\n",
    "proyek/website/index.html": "<h1>Halo Dunia</h1>\n",
    "unduhan/": { dir: true },
    ".bashrc": "# konfigurasi shell\nalias ll='ls -l'\n",
  }),
  objectives: [
    { id: "pwd", text: "Cek posisimu sekarang dengan `pwd`", check: has("cmd:pwd") },
    { id: "ls", text: "Lihat isi folder dengan `ls`", check: has("cmd:ls") },
    { id: "cd", text: "Masuk ke folder `dokumen/rahasia`", check: has("cd:/home/siswa/dokumen/rahasia") },
    { id: "hidden", text: "Tampilkan file tersembunyi dengan `ls -a`", check: has("ls:all") },
    { id: "read", text: "Baca isi pesan rahasia admin dengan `cat`", check: has("cat:/home/siswa/dokumen/rahasia/.pesan-admin") },
    { id: "home", text: "Kembali ke home directory dengan `cd ~` (atau cukup `cd`)", check: (ctx) => ctx.facts.has("cat:/home/siswa/dokumen/rahasia/.pesan-admin") && hasMatch(/^cd:\/home\/siswa$/)(ctx) },
  ],
  hints: [
    "Ketik `cd dokumen` lalu `cd rahasia`, atau langsung `cd dokumen/rahasia`.",
    "File yang namanya diawali titik (.) disembunyikan. Pakai `ls -a` untuk melihatnya.",
    "Tekan Tab untuk melengkapi nama file secara otomatis. Contoh: ketik `cat .pe` lalu Tab.",
  ],
};

export const linuxFile: LabDefinition = {
  id: "linux-file",
  title: "Membuat & Mengelola File",
  summary: "Buat folder, tulis file, salin, ganti nama, dan hapus file.",
  difficulty: "pemula",
  estimatedMinutes: 12,
  xp: 70,
  controllable: ["pc"],
  allowedCommands: LINUX_COMMANDS,
  briefing: [
    "Kamu baru bergabung di tim IT. Tugas pertamamu adalah merapikan folder home dan menyiapkan folder latihan.",
  ],
  topology: singlePc({
    "sampah.txt": "file ini tidak dibutuhkan lagi\n",
    "laporan-lama.txt": "Laporan jaringan Q1\n",
  }),
  objectives: [
    { id: "mkdir", text: "Buat folder baru bernama `latihan`", check: (ctx) => fileAt(ctx, "pc", "/home/siswa/latihan")?.type === "dir" },
    {
      id: "write",
      text: "Buat file `latihan/halo.txt` berisi teks yang mengandung kata **halo** (petunjuk: `echo ... > file`)",
      check: (ctx) => {
        const f = fileAt(ctx, "pc", "/home/siswa/latihan/halo.txt");
        return f?.type === "file" && f.content.toLowerCase().includes("halo");
      },
    },
    { id: "cp", text: "Salin `halo.txt` menjadi `latihan/halo-backup.txt`", check: (ctx) => fileAt(ctx, "pc", "/home/siswa/latihan/halo-backup.txt")?.type === "file" },
    {
      id: "mv",
      text: "Pindahkan `laporan-lama.txt` ke folder `latihan` dengan nama `laporan-q1.txt`",
      check: (ctx) => !fileAt(ctx, "pc", "/home/siswa/laporan-lama.txt") && fileAt(ctx, "pc", "/home/siswa/latihan/laporan-q1.txt")?.type === "file",
    },
    { id: "rm", text: "Hapus file `sampah.txt`", check: (ctx) => !fileAt(ctx, "pc", "/home/siswa/sampah.txt") },
  ],
  hints: [
    "`mkdir latihan` membuat folder.",
    "`echo \"halo dunia\" > latihan/halo.txt` menulis teks ke file. Cek hasilnya dengan `cat latihan/halo.txt`.",
    "`cp asal tujuan` untuk menyalin, `mv asal tujuan` untuk memindah/mengganti nama, `rm file` untuk menghapus.",
  ],
};

export const linuxPermission: LabDefinition = {
  id: "linux-permission",
  title: "User, sudo & Permission",
  summary: "Pahami siapa pemilik file, baca izin akses, dan gunakan sudo dengan bijak.",
  difficulty: "pemula",
  estimatedMinutes: 12,
  xp: 80,
  controllable: ["pc"],
  allowedCommands: LINUX_COMMANDS,
  briefing: [
    "Ada skrip backup yang tidak bisa dijalankan dan sebuah log keamanan yang hanya boleh dibaca admin. Saatnya mempraktikkan permission!",
  ],
  topology: singlePc({
    "skrip/backup.sh": { content: "#!/bin/bash\necho 'Membuat backup...'\n", mode: 0o644 },
    "/var/log/keamanan.log": { content: "[ALERT] 3 percobaan login gagal untuk user admin\nFLAG: sudo-itu-kekuatan-besar\n", mode: 0o600, owner: "root" },
  }),
  objectives: [
    { id: "whoami", text: "Cek user yang sedang kamu pakai dengan `whoami`", check: has("cmd:whoami") },
    { id: "lsl", text: "Lihat detail izin file di folder `skrip` dengan `ls -l`", check: has("ls:long") },
    { id: "chmod", text: "Buat `skrip/backup.sh` bisa dieksekusi: ubah izinnya menjadi `755`", check: (ctx) => fileAt(ctx, "pc", "/home/siswa/skrip/backup.sh")?.mode === 0o755 },
    { id: "denied", text: "Coba baca `/var/log/keamanan.log` (akan ditolak!)", check: has("denied:/var/log/keamanan.log") },
    { id: "sudo", text: "Baca log tersebut menggunakan `sudo`", check: (ctx) => ctx.facts.has("cmd:sudo") && ctx.facts.has("cat:/var/log/keamanan.log") },
  ],
  hints: [
    "`ls -l skrip` menampilkan kolom izin seperti `-rw-r--r--`.",
    "755 berarti: pemilik rwx (7), grup r-x (5), lainnya r-x (5). Ketik `chmod 755 skrip/backup.sh`.",
    "Tambahkan `sudo` di depan perintah: `sudo cat /var/log/keamanan.log`.",
  ],
};

const authLog = [
  ["Nov 14 08:01:12", "Accepted password for siswa from 192.168.1.10 port 51022 ssh2"],
  ["Nov 14 09:15:40", "Failed password for root from 203.0.113.45 port 40122 ssh2"],
  ["Nov 14 09:15:42", "Failed password for root from 203.0.113.45 port 40124 ssh2"],
  ["Nov 14 09:15:44", "Failed password for admin from 203.0.113.45 port 40126 ssh2"],
  ["Nov 14 09:20:03", "Failed password for siswa from 192.168.1.10 port 51210 ssh2"],
  ["Nov 14 09:20:09", "Accepted password for siswa from 192.168.1.10 port 51211 ssh2"],
  ["Nov 14 10:02:51", "Failed password for root from 203.0.113.45 port 40301 ssh2"],
  ["Nov 14 10:02:53", "Failed password for test from 203.0.113.45 port 40303 ssh2"],
  ["Nov 14 10:02:55", "Failed password for oracle from 203.0.113.45 port 40305 ssh2"],
  ["Nov 14 11:30:00", "Accepted publickey for admin from 192.168.1.5 port 60001 ssh2"],
  ["Nov 14 12:45:17", "Failed password for admin from 198.51.100.7 port 33001 ssh2"],
  ["Nov 14 13:10:22", "Failed password for root from 203.0.113.45 port 40411 ssh2"],
  ["Nov 14 13:10:24", "Failed password for ubuntu from 203.0.113.45 port 40413 ssh2"],
]
  .map(([time, msg], i) => `${time} netsec sshd[${1200 + i * 7}]: ${msg}`)
  .join("\n");

export const linuxLogHunt: LabDefinition = {
  id: "linux-log-hunt",
  title: "Berburu Penyerang di Log",
  summary: "Gunakan grep, pipe, dan wc untuk menemukan IP yang mencoba membobol server.",
  difficulty: "pemula",
  estimatedMinutes: 15,
  xp: 100,
  controllable: ["pc"],
  allowedCommands: LINUX_COMMANDS,
  briefing: [
    "Server kita sepertinya sedang diserang! File `/var/log/auth.log` mencatat setiap percobaan login SSH.",
    "Tugasmu sebagai analis keamanan: temukan IP penyerang yang paling sering gagal login, lalu tulis laporan.",
  ],
  topology: singlePc({ "/var/log/auth.log": { content: authLog + "\n", mode: 0o644, owner: "root" } }),
  objectives: [
    { id: "cat", text: "Lihat isi `/var/log/auth.log`", check: has("cat:/var/log/auth.log") },
    { id: "grep", text: "Saring hanya baris yang mengandung `Failed`", check: has("cmd:grep") },
    { id: "count", text: "Hitung jumlah login gagal dengan pipe ke `wc -l`", check: (ctx) => ctx.facts.has("cmd:grep") && ctx.facts.has("cmd:wc") },
    {
      id: "report",
      text: "Tulis IP penyerang utama ke file `~/laporan.txt`",
      check: (ctx) => {
        const f = fileAt(ctx, "pc", "/home/siswa/laporan.txt");
        return f?.type === "file" && f.content.includes("203.0.113.45");
      },
    },
  ],
  hints: [
    "`grep Failed /var/log/auth.log` menampilkan baris yang mengandung kata Failed.",
    "Gabungkan perintah dengan pipe: `grep Failed /var/log/auth.log | wc -l`.",
    "Untuk menghitung per IP: `grep 203.0.113.45 /var/log/auth.log | wc -l`. Tulis laporan dengan `echo \"IP_PENYERANG\" > ~/laporan.txt`.",
  ],
};
