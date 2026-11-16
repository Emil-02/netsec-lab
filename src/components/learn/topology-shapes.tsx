const node = (x: number, y: number, key: string, color = "#60a5fa") => (
  <g key={key}>
    <circle cx={x} cy={y} r={9} fill="#0d1424" stroke={color} strokeWidth={2.5} />
  </g>
);

const line = (x1: number, y1: number, x2: number, y2: number, key: string) => (
  <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#475569" strokeWidth={2} />
);

function Bus() {
  const xs = [20, 60, 100, 140];
  return (
    <>
      {line(10, 60, 150, 60, "bus")}
      {xs.map((x, i) => line(x, 60, x, i % 2 ? 90 : 30, `l${i}`))}
      {xs.map((x, i) => node(x, i % 2 ? 90 : 30, `n${i}`))}
    </>
  );
}

function Star() {
  const pts = [0, 1, 2, 3, 4].map((i) => [80 + 50 * Math.cos((i * 2 * Math.PI) / 5 - Math.PI / 2), 60 + 45 * Math.sin((i * 2 * Math.PI) / 5 - Math.PI / 2)]);
  return (
    <>
      {pts.map(([x, y], i) => line(80, 60, x, y, `l${i}`))}
      {pts.map(([x, y], i) => node(x, y, `n${i}`))}
      {node(80, 60, "hub", "#22d3ee")}
    </>
  );
}

function Ring() {
  const pts = [0, 1, 2, 3, 4, 5].map((i) => [80 + 50 * Math.cos((i * Math.PI) / 3), 60 + 45 * Math.sin((i * Math.PI) / 3)]);
  return (
    <>
      {pts.map(([x, y], i) => line(x, y, pts[(i + 1) % 6][0], pts[(i + 1) % 6][1], `l${i}`))}
      {pts.map(([x, y], i) => node(x, y, `n${i}`))}
    </>
  );
}

function Mesh() {
  const pts = [0, 1, 2, 3, 4].map((i) => [80 + 50 * Math.cos((i * 2 * Math.PI) / 5 - Math.PI / 2), 60 + 45 * Math.sin((i * 2 * Math.PI) / 5 - Math.PI / 2)]);
  const lines = [];
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) lines.push(line(pts[a][0], pts[a][1], pts[b][0], pts[b][1], `l${a}-${b}`));
  return (
    <>
      {lines}
      {pts.map(([x, y], i) => node(x, y, `n${i}`))}
    </>
  );
}

const shapes = [
  { name: "Bus", Comp: Bus, desc: "Satu kabel utama dipakai bersama. Murah, tapi satu kabel putus = semua mati." },
  { name: "Star", Comp: Star, desc: "Semua terhubung ke satu pusat (switch). Paling umum di LAN modern." },
  { name: "Ring", Comp: Ring, desc: "Membentuk lingkaran; data berputar dari satu node ke node berikutnya." },
  { name: "Mesh", Comp: Mesh, desc: "Setiap node terhubung ke banyak node lain. Sangat andal, tapi mahal." },
];

export function TopologyShapes() {
  return (
    <div className="not-prose my-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {shapes.map(({ name, Comp, desc }) => (
        <div key={name} className="rounded-xl border border-border bg-surface p-4">
          <svg viewBox="0 0 160 120" className="mx-auto h-28">
            <Comp />
          </svg>
          <div className="mt-2 font-semibold text-white">Topologi {name}</div>
          <p className="text-sm text-muted">{desc}</p>
        </div>
      ))}
    </div>
  );
}
