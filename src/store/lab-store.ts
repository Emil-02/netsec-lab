"use client";

import { createStore } from "zustand/vanilla";
import {
  buildNetwork,
  evaluateObjectives,
  execute,
  type ExecResult,
  type BrowserEvent,
  type HopEvent,
  type LabDefinition,
  type PendingInput,
  type Network,
  type Packet,
  type ShellSession,
  packetProtocol,
} from "@/engine";
import { Playback, type ActiveHop } from "./playback";

export type { ActiveHop };

const MAX_LOG = 800;

export interface LoggedPacket {
  no: number;
  time: number;
  event: HopEvent;
}

export interface TerminalIO {
  write(text: string): void;
  clear(): void;
  done(): void;
}

/** Playback speed multiplier; 0 means "instant" (no animation). */
export const SPEEDS = [0.25, 0.5, 1, 2, 0] as const;

export interface LabState {
  lab: LabDefinition;
  net: Network;
  sessions: Record<string, ShellSession>;
  activeDevice: string;
  facts: Set<string>;
  completed: string[];
  completedAt: number | null;
  version: number;
  resetCount: number;
  speed: number;
  running: boolean;
  activeHops: ActiveHop[];
  packetLog: LoggedPacket[];
  selectedPacket: number | null;
  selectedDevice: string | null;
  bottomTab: "paket" | "perangkat" | "browser";
  hintsRevealed: number;
  /** A command is waiting for input (e.g. a password prompt). */
  pending: { prompt: string; secret: boolean } | null;
  /** Pages opened with the `browser` command, newest last. */
  pages: BrowserEvent[];
  currentPage: number | null;

  session(): ShellSession;
  run(line: string, io: TerminalIO): void;
  answer(input: string, io: TerminalIO): void;
  cancel(io: TerminalIO): void;
  setSpeed(speed: number): void;
  setActiveDevice(id: string): void;
  selectPacket(no: number | null): void;
  selectDevice(id: string | null): void;
  setBottomTab(tab: LabState["bottomTab"]): void;
  showPage(index: number): void;
  addFact(fact: string): void;
  addFacts(facts: string[]): void;
  revealHint(): void;
  reset(): void;
}

/** Facts emitted when the learner opens a packet in the inspector. */
export function inspectionFacts(p: Packet): string[] {
  const facts = ["ui:packet-inspected", `ui:inspect:${packetProtocol(p)}`];
  if (p.arp) facts.push(`ui:inspect:arp-${p.arp.op}`);
  if (p.tcp) facts.push(`ui:inspect:tcp:${p.tcp.flags.join("+")}`);
  if (p.icmp) facts.push(`ui:inspect:icmp:${p.icmp.type}`);
  if (p.eth?.vlan !== undefined) facts.push("ui:inspect:vlan-tag");
  if (p.note?.startsWith("NAT")) facts.push("ui:inspect:nat");
  if (p.app?.protocol === "HTTP" && /pass(word)?=/i.test(p.app.data ?? "")) facts.push("ui:inspect:http-password");
  if (p.app?.protocol === "TLS" && p.app.summary.startsWith("Application Data")) facts.push("ui:inspect:tls-data");
  return facts;
}

function makeSession(net: Network, deviceId: string): ShellSession {
  const device = net.device(deviceId);
  return { device, cwd: device.fs?.home ?? "/", history: [], user: device.user };
}

export function createLabStore(lab: LabDefinition, onComplete?: (lab: LabDefinition) => void) {
  let playback: Playback | null = null;
  let pendingInput: PendingInput | null = null;
  let simClock = 0;
  let inspectedIcmp: Packet[] = [];

  const initial = () => {
    const net = buildNetwork(lab.topology);
    return {
      net,
      sessions: { [lab.controllable[0]]: makeSession(net, lab.controllable[0]) },
      activeDevice: lab.controllable[0],
      facts: new Set<string>(),
      completed: [] as string[],
      completedAt: null,
      activeHops: [] as ActiveHop[],
      packetLog: [] as LoggedPacket[],
      selectedPacket: null,
      selectedDevice: null,
      hintsRevealed: 0,
      running: false,
      pending: null,
      pages: [] as BrowserEvent[],
      currentPage: null,
    };
  };

  return createStore<LabState>()((set, get) => {
    const evaluate = (recent: Set<string>) => {
      const { net, facts, completedAt } = get();
      const completed = evaluateObjectives(lab.objectives, { net, facts, recent }, get().completed);
      const allDone = completed.length === lab.objectives.length;
      set({ completed, completedAt: allDone ? (completedAt ?? Date.now()) : completedAt });
      if (allDone && !completedAt) onComplete?.(lab);
    };

    /** Plays a command result: terminal output, packet animation, packet log, and objective checks. */
    const play = (result: ExecResult, io: TerminalIO) => {
      const state = get();
      const facts = new Set(state.facts);
      result.facts.forEach((f) => facts.add(f));
      const recent = new Set(result.facts);
      const sessions = result.switchTo ? { ...state.sessions, [state.activeDevice]: result.switchTo } : state.sessions;
      set({ facts, sessions, running: true, version: state.version + 1 });
      if (result.clear) io.clear();

      const base = simClock;
      simClock += result.duration + 1000;
      let buffer: LoggedPacket[] = [];
      const flushLog = () => {
        if (!buffer.length) return;
        const add = buffer;
        buffer = [];
        set((s) => {
          let no = s.packetLog.length ? s.packetLog[s.packetLog.length - 1].no : 0;
          const entries = add.map((e) => ({ ...e, no: ++no }));
          return { packetLog: [...s.packetLog, ...entries].slice(-MAX_LOG) };
        });
      };

      playback = new Playback(result, state.speed, {
        output: (text) => io.write(text),
        hopStarted: (event) => buffer.push({ no: 0, time: base + event.at, event }),
        browser: (page) =>
          set((s) => {
            const pages = [...s.pages, page].slice(-20);
            return { pages, currentPage: pages.length - 1, bottomTab: "browser" };
          }),
        activeChanged: (hops) => {
          flushLog();
          set({ activeHops: [...hops] });
        },
        done: () => {
          playback = null;
          flushLog();
          pendingInput = result.pending ?? null;
          set((s) => ({
            running: false,
            activeHops: [],
            version: s.version + 1,
            pending: result.pending ? { prompt: result.pending.prompt, secret: result.pending.secret } : null,
          }));
          evaluate(recent);
          io.done();
        },
      });
      playback.start();
    };

    return {
      lab,
      ...initial(),
      version: 0,
      resetCount: 0,
      speed: 1,
      bottomTab: "paket",

      session() {
        const s = get();
        return s.sessions[s.activeDevice];
      },

      run(line, io) {
        const state = get();
        const result = execute(state.net, state.session(), line, { allowedCommands: lab.allowedCommands, background: lab.background, flags: lab.flags });
        play(result, io);
      },

      answer(input, io) {
        const p = pendingInput;
        if (!p || get().running) return;
        pendingInput = null;
        set({ pending: null });
        play(p.resume(input), io);
      },

      cancel(io) {
        if (pendingInput) {
          pendingInput = null;
          set({ pending: null });
          io.write("^C");
          io.done();
          return;
        }
        if (!playback) return;
        io.write("^C");
        playback.cancel();
      },

      setSpeed: (speed) => set({ speed }),

      setActiveDevice(id) {
        const s = get();
        if (!lab.controllable.includes(id) || s.running || s.pending) return;
        set({ activeDevice: id, sessions: s.sessions[id] ? s.sessions : { ...s.sessions, [id]: makeSession(s.net, id) } });
      },

      selectPacket(no) {
        set({ selectedPacket: no, bottomTab: "paket" });
        if (no === null) return;
        const picked = get().packetLog.find((p) => p.no === no)?.event.packet;
        get().addFacts(picked ? inspectionFacts(picked) : ["ui:packet-inspected"]);
        if (picked?.icmp && picked.ip) {
          const sameMessageDifferentFrame = inspectedIcmp.some(
            (p) =>
              p.icmp?.seq === picked.icmp!.seq &&
              p.icmp?.type === picked.icmp!.type &&
              p.ip?.src === picked.ip!.src &&
              p.ip?.dst === picked.ip!.dst &&
              p.eth?.src !== picked.eth?.src,
          );
          inspectedIcmp.push(picked);
          if (sameMessageDifferentFrame) get().addFact("ui:compared-hops");
        }
      },

      selectDevice(id) {
        set({ selectedDevice: id, bottomTab: id ? "perangkat" : get().bottomTab });
        if (id) get().addFact(`ui:device:${id}`);
      },

      setBottomTab: (bottomTab) => set({ bottomTab }),

      showPage: (index) => set((s) => ({ currentPage: Math.max(0, Math.min(s.pages.length - 1, index)) })),

      addFact(fact) {
        get().addFacts([fact]);
      },

      addFacts(list) {
        const s = get();
        const fresh = list.filter((f) => !s.facts.has(f));
        const facts = new Set(s.facts);
        fresh.forEach((f) => facts.add(f));
        if (fresh.length) set({ facts });
        evaluate(new Set(list));
      },

      revealHint: () => set((s) => ({ hintsRevealed: Math.min(s.hintsRevealed + 1, lab.hints.length) })),

      reset() {
        playback?.cancel();
        playback = null;
        pendingInput = null;
        simClock = 0;
        inspectedIcmp = [];
        set((s) => ({ ...initial(), version: s.version + 1, resetCount: s.resetCount + 1 }));
      },
    };
  });
}

export type LabStore = ReturnType<typeof createLabStore>;
