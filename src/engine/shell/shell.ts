import type { Network } from "../core/network";
import type { SimEvent } from "../core/types";
import { basicCommands } from "./commands/basic";
import { browserCommand } from "./commands/browser";
import { submitFlagCommand } from "./commands/ctf";
import { fileCommands } from "./commands/files";
import { cryptoCommands } from "./commands/crypto";
import { firewallCommands } from "./commands/firewall";
import { nmapCommand } from "./commands/nmap";
import { tcpdumpCommand } from "./commands/tcpdump";
import { netCommands } from "./commands/net";
import { serviceCommands } from "./commands/services";
import { switchCommands } from "./commands/switch";
import { textCommands } from "./commands/text";
import { FsError } from "./fs";
import { ansi, type BackgroundJob, type CommandContext, type CommandDef, type FlagDef, type ResumeFn, type ShellSession } from "./types";

type Token = { type: "word"; value: string } | { type: "op"; value: "|" | ">" | ">>" | "&&" | ";" };

const registry = new Map<string, CommandDef>();
function register(defs: CommandDef[]) {
  for (const def of defs) {
    registry.set(def.name, def);
    for (const alias of def.aliases ?? []) registry.set(alias, def);
  }
}
register(basicCommands(() => registry));
register(fileCommands);
register(textCommands);
register(netCommands);
register(serviceCommands);
register(firewallCommands);
register(switchCommands);
register(cryptoCommands);
register([nmapCommand, tcpdumpCommand, browserCommand, submitFlagCommand]);

export function registerCommands(defs: CommandDef[]) {
  register(defs);
}

export function commandNames(): string[] {
  return [...registry.keys()].sort();
}

export class ParseError extends Error {}

export function tokenize(line: string, env: Record<string, string>): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let current = "";
  let hasWord = false;
  const flush = () => {
    if (hasWord) tokens.push({ type: "word", value: current });
    current = "";
    hasWord = false;
  };
  const expand = (str: string, start: number) => {
    const m = /^\$(\w+)/.exec(str.slice(start));
    if (!m) return null;
    return { value: env[m[1]] ?? "", length: m[0].length };
  };

  while (i < line.length) {
    const ch = line[i];
    if (ch === " " || ch === "\t") {
      flush();
      i++;
    } else if (ch === "'" || ch === '"') {
      const end = line.indexOf(ch, i + 1);
      if (end < 0) throw new ParseError("tanda kutip tidak ditutup");
      const inner = line.slice(i + 1, end);
      current += ch === '"' ? inner.replace(/\$(\w+)/g, (_, name: string) => env[name] ?? "") : inner;
      hasWord = true;
      i = end + 1;
    } else if (ch === "|" || ch === ";" || ch === ">" || (ch === "&" && line[i + 1] === "&")) {
      flush();
      if (ch === ">" && line[i + 1] === ">") {
        tokens.push({ type: "op", value: ">>" });
        i += 2;
      } else if (ch === "&") {
        tokens.push({ type: "op", value: "&&" });
        i += 2;
      } else {
        tokens.push({ type: "op", value: ch as "|" | ";" | ">" });
        i++;
      }
    } else if (ch === "$") {
      const exp = expand(line, i);
      if (exp) {
        current += exp.value;
        hasWord = true;
        i += exp.length;
      } else {
        current += ch;
        hasWord = true;
        i++;
      }
    } else {
      current += ch;
      hasWord = true;
      i++;
    }
  }
  flush();
  return tokens;
}

interface Statement {
  pipeline: string[][];
  redirect?: { append: boolean; file: string };
  /** Run only if previous statement succeeded (&&). */
  conditional: boolean;
}

function parse(tokens: Token[]): Statement[] {
  const statements: Statement[] = [];
  let current: Statement = { pipeline: [[]], conditional: false };
  const push = () => {
    if (current.pipeline.some((p) => p.length)) {
      if (current.pipeline.some((p) => !p.length)) throw new ParseError("sintaks salah di dekat '|'");
      statements.push(current);
    }
  };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === "word") {
      current.pipeline[current.pipeline.length - 1].push(tok.value);
    } else if (tok.value === "|") {
      current.pipeline.push([]);
    } else if (tok.value === ">" || tok.value === ">>") {
      const file = tokens[i + 1];
      if (!file || file.type !== "word") throw new ParseError(`sintaks salah di dekat '${tok.value}'`);
      current.redirect = { append: tok.value === ">>", file: file.value };
      i++;
    } else {
      push();
      current = { pipeline: [[]], conditional: tok.value === "&&" };
    }
  }
  push();
  return statements;
}

export interface ExecOptions {
  /** If provided, only these commands can be used in the lab. */
  allowedCommands?: string[];
  /** Lab traffic replayed by commands that "wait and listen" (tcpdump). */
  background?: BackgroundJob[];
  /** CTF flags accepted by `submit-flag`. */
  flags?: FlagDef[];
}

export interface PendingInput {
  prompt: string;
  secret: boolean;
  resume(input: string): ExecResult;
}

export interface ExecResult {
  events: SimEvent[];
  duration: number;
  facts: string[];
  clear: boolean;
  exitCode: number;
  /** Set when a command is waiting for the learner to type something (e.g. a password). */
  pending?: PendingInput;
  /** Set when the terminal should switch to another session (ssh login / exit). */
  switchTo?: ShellSession;
}

interface RunState {
  t: number;
  facts: string[];
  clear: boolean;
  /** Suppresses terminal output (used for background jobs). */
  silent: boolean;
  pending?: { prompt: string; secret: boolean; resume: ResumeFn; session: ShellSession };
  switchTo?: ShellSession;
}

export function sessionUser(session: ShellSession) {
  return session.user ?? session.device.user;
}

export function sessionHome(session: ShellSession) {
  const user = sessionUser(session);
  if (session.home) return session.home;
  if (user === session.device.user) return session.device.fs?.home ?? "/";
  return user === "root" ? "/root" : `/home/${user}`;
}

/** Runs `fn` with the device filesystem acting as the session's user (home dir and default file owner). */
function asUser<T>(session: ShellSession, fn: () => T): T {
  const fs = session.device.fs;
  if (!fs) return fn();
  const prevHome = fs.home;
  const prevUser = fs.user;
  const home = sessionHome(session);
  fs.user = sessionUser(session);
  fs.home = home;
  try {
    return fn();
  } finally {
    fs.home = prevHome;
    fs.user = prevUser;
  }
}

interface ContextInit {
  name: string;
  args: string[];
  stdin: string | null;
  sudo: boolean;
  capture: { buf: string } | null;
}

function makeContext(net: Network, session: ShellSession, state: RunState, options: ExecOptions, init: ContextInit): CommandContext {
  const device = session.device;
  const user = sessionUser(session);
  const capture = init.capture;
  return {
    net,
    session,
    device,
    name: init.name,
    args: init.args,
    stdin: init.stdin,
    t: state.t,
    sudo: init.sudo,
    user,
    allowed: options.allowedCommands,
    flags: options.flags,
    print(text = "") {
      if (capture) capture.buf += `${text}\n`;
      else if (!state.silent) net.output(this.t, text);
    },
    printAt(at, text) {
      if (capture) capture.buf += `${text}\n`;
      else if (!state.silent) net.output(at, text);
    },
    write(text) {
      if (capture) capture.buf += text;
      else if (!state.silent) net.output(this.t, text);
    },
    error(text) {
      if (!state.silent) net.output(this.t, ansi.red(text));
    },
    fact(f) {
      state.facts.push(f);
    },
    isRoot() {
      return init.sudo || user === "root";
    },
    clear() {
      state.clear = true;
    },
    ask(promptText, secret, resume) {
      state.pending = { prompt: promptText, secret, resume, session };
    },
    switchTo(next) {
      state.switchTo = next;
    },
    runBackground() {
      let end = this.t;
      for (const job of options.background ?? []) {
        const bgDevice = net.devices.get(job.device);
        if (!bgDevice) continue;
        const bg: ShellSession = { device: bgDevice, cwd: bgDevice.fs?.home ?? "/", history: [] };
        const bgState: RunState = { t: this.t, facts: [], clear: false, silent: true };
        runLine(net, bg, job.command, {}, bgState);
        end = Math.max(end, bgState.t);
      }
      return end;
    },
  };
}

/** Parses and runs one command line, appending events to the current recording. Returns the exit code. */
function runLine(net: Network, session: ShellSession, line: string, options: ExecOptions, state: RunState): number {
  const device = session.device;
  const user = sessionUser(session);
  const env: Record<string, string> = {
    HOME: sessionHome(session),
    USER: user,
    PWD: session.cwd,
    HOSTNAME: device.hostname,
    SHELL: "/bin/bash",
  };
  const out = (text: string) => {
    if (!state.silent) net.output(state.t, text);
  };

  let statements: Statement[] = [];
  try {
    statements = parse(tokenize(line.trim(), env));
  } catch (err) {
    if (err instanceof ParseError) {
      out(ansi.red(`bash: ${err.message}`));
      return 2;
    }
    throw err;
  }

  return asUser(session, () => {
    let exitCode = 0;
    for (const stmt of statements) {
      if (stmt.conditional && exitCode !== 0) continue;
      if (state.pending || state.switchTo) break;
      let stdin: string | null = null;

      for (let idx = 0; idx < stmt.pipeline.length; idx++) {
        let words = stmt.pipeline[idx];
        let sudo = false;
        if (words[0] === "sudo") {
          sudo = true;
          words = words.slice(1);
          if (!words.length) {
            out("usage: sudo <perintah>");
            exitCode = 1;
            break;
          }
          state.facts.push("cmd:sudo");
        }
        const [name, ...args] = words;
        const isLast = idx === stmt.pipeline.length - 1;
        const capture: { buf: string } | null = !isLast || stmt.redirect ? { buf: "" } : null;
        const def = registry.get(name);

        if (!def) {
          out(ansi.red(`bash: ${name}: perintah tidak ditemukan`) + ansi.dim("  (ketik 'help' untuk melihat daftar perintah)"));
          exitCode = 127;
          break;
        }
        if (options.allowedCommands && !options.allowedCommands.includes(def.name) && !ALWAYS_ALLOWED.includes(def.name)) {
          out(ansi.yellow(`${name}: perintah ini belum dibuka di lab ini. Fokus pada tujuan lab dulu ya!`));
          exitCode = 126;
          break;
        }

        const ctx = makeContext(net, session, state, options, { name, args, stdin, sudo, capture });
        state.facts.push(`cmd:${def.name}`);
        exitCode = def.run(ctx) ?? 0;
        state.t = ctx.t;
        stdin = capture ? capture.buf : null;
      }

      if (stmt.redirect && stdin !== null && exitCode !== 127) {
        try {
          const fs = device.fs;
          if (!fs) throw new FsError("sistem file tidak tersedia");
          const abs = fs.resolve(stmt.redirect.file, session.cwd);
          // The redirect is performed by the calling shell, so `sudo` does not apply to it.
          if (!fs.canWrite(abs, user, user === "root")) throw new FsError("Izin ditolak (Permission denied)");
          fs.writeFile(abs, stdin, user, stmt.redirect.append);
          state.facts.push(`write:${abs}`);
        } catch (err) {
          if (!(err instanceof FsError)) throw err;
          out(ansi.red(`bash: ${stmt.redirect.file}: ${err.message}`));
          exitCode = 1;
        }
      }
    }
    return exitCode;
  });
}

const ALWAYS_ALLOWED = ["help", "clear", "exit", "submit-flag"];

function finish(net: Network, state: RunState, exitCode: number, options: ExecOptions): ExecResult {
  const lastEventEnd = net.events.reduce((max, e) => Math.max(max, e.kind === "hop" ? e.at + e.duration : e.at), 0);
  const result: ExecResult = {
    events: [...net.events],
    duration: Math.max(state.t, lastEventEnd),
    facts: state.facts,
    clear: state.clear,
    exitCode,
    switchTo: state.switchTo,
  };
  const pending = state.pending;
  if (pending) {
    result.pending = {
      prompt: pending.prompt,
      secret: pending.secret,
      resume(input: string) {
        net.beginRecording();
        const next: RunState = { t: 0, facts: [], clear: false, silent: false };
        const code = asUser(pending.session, () => {
          const ctx = makeContext(net, pending.session, next, options, { name: "", args: [], stdin: null, sudo: false, capture: null });
          const c = pending.resume(input, ctx) ?? 0;
          next.t = ctx.t;
          return c;
        });
        return finish(net, next, code, options);
      },
    };
  }
  return result;
}

export function execute(net: Network, session: ShellSession, line: string, options: ExecOptions = {}): ExecResult {
  net.beginRecording();
  const trimmed = line.trim();
  if (trimmed) session.history.push(trimmed);
  const state: RunState = { t: 0, facts: [], clear: false, silent: false };
  const exitCode = runLine(net, session, trimmed, options, state);
  return finish(net, state, exitCode, options);
}

export function prompt(session: ShellSession): string {
  const { device, cwd } = session;
  if (device.kind === "switch") return `${ansi.boldBlue(device.hostname)}# `;
  const user = sessionUser(session);
  const home = sessionHome(session);
  const shown = cwd === home || cwd.startsWith(home + "/") ? "~" + cwd.slice(home.length) : cwd;
  const symbol = user === "root" ? "#" : "$";
  const userColor = device.kind === "attacker" ? ansi.red : session.parent ? ansi.yellow : ansi.boldGreen;
  return `${userColor(`${user}@${device.hostname}`)}:${ansi.boldBlue(shown)}${symbol} `;
}

export function complete(session: ShellSession, line: string): string[] {
  const parts = line.split(" ");
  if (parts.length === 1) return commandNames().filter((n) => n.startsWith(parts[0]));
  const fs = session.device.fs;
  if (!fs) return [];
  const partial = parts[parts.length - 1];
  const slash = partial.lastIndexOf("/");
  const dirPart = slash >= 0 ? partial.slice(0, slash + 1) : "";
  const base = slash >= 0 ? partial.slice(slash + 1) : partial;
  const dir = fs.get(fs.resolve(dirPart || ".", session.cwd));
  if (!dir || dir.type !== "dir") return [];
  return [...dir.children.entries()]
    .filter(([name]) => name.startsWith(base) && (base.startsWith(".") || !name.startsWith(".")))
    .map(([name, node]) => dirPart + name + (node.type === "dir" ? "/" : ""));
}
