import type { Metadata } from "next";
import { BinaryConverter } from "@/components/learn/binary-converter";
import { SubnetCalculator } from "@/components/learn/subnet-calculator";

export const metadata: Metadata = { title: "Kalkulator Subnet" };

export default function SubnetToolPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-white">Kalkulator Subnet</h1>
      <p className="mt-2 text-muted">Hitung alamat network, broadcast, rentang host, dan lihat representasi binernya secara langsung.</p>
      <SubnetCalculator />
      <h2 className="mt-12 text-xl font-semibold text-white">Konverter Biner ↔ Desimal</h2>
      <BinaryConverter />
    </main>
  );
}
