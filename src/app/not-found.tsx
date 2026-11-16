import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-24 text-center">
      <div>
        <p className="font-mono text-sm text-accent">404 · Destination Host Unreachable</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-muted">Paketmu tersesat. Coba kembali ke rute yang benar.</p>
        <Link href="/" className="mt-6 inline-block text-accent hover:underline">
          ← Kembali ke beranda
        </Link>
      </div>
    </main>
  );
}
