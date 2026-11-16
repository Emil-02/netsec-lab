import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>NetSec Lab — belajar jaringan & keamanan siber dari nol, dengan simulasi interaktif.</p>
        <p>
          Gunakan ilmu ini secara etis. Baca <Link href="/learn/pengenalan/etika-dan-hukum" className="text-accent hover:underline">etika & hukum</Link>.
        </p>
      </div>
    </footer>
  );
}
