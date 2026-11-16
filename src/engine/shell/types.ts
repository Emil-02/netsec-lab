import type { Network } from "../core/network";
import type { Device } from "../core/types";

export const ansi = {
  reset: "\x1b[0m",
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  boldBlue: (s: string) => `\x1b[1;34m${s}\x1b[0m`,
  boldGreen: (s: string) => `\x1b[1;32m${s}\x1b[0m`,
};

export interface ShellSession {
  device: Device;
  cwd: string;
  history: string[];
  /** Logged-in user (defaults to the device's user). */
  user?: string;
  /** Home directory of `user` (defaults to the device filesystem's home). */
  home?: string;
  /** Session to return to on `exit` (set when logging in with ssh). */
  parent?: ShellSession;
  /** Cleanup run when this session ends (e.g. closing the SSH TCP connection). */
  onExit?: (ctx: CommandContext) => void;
}

/** Traffic that other (simulated) users generate, replayed while e.g. tcpdump is listening. */
export interface BackgroundJob {
  device: string;
  command: string;
}

export type ResumeFn = (input: string, ctx: CommandContext) => number | void;

export interface CommandContext {
  net: Network;
  session: ShellSession;
  device: Device;
  name: string;
  args: string[];
  stdin: string | null;
  /** Simulated time cursor; commands advance it as they wait for packets. */
  t: number;
  /** Prints a line at the current time cursor. */
  print(text?: string): void;
  printAt(at: number, text: string): void;
  /** Writes text without a trailing newline (only meaningful inside pipes/redirects). */
  write(text: string): void;
  error(text: string): void;
  fact(fact: string): void;
  isRoot(): boolean;
  /** Set by the shell when running a command through `sudo`. */
  sudo: boolean;
  /** Commands unlocked in the current lab (undefined = all). */
  allowed?: string[];
  /** User the command runs as (before sudo). */
  user: string;
  clear(): void;
  /** Asks the learner for a line of input (e.g. a password); `resume` runs once it is entered. */
  ask(prompt: string, secret: boolean, resume: ResumeFn): void;
  /** Replaces the terminal's current session (ssh login / logout). */
  switchTo(session: ShellSession): void;
  /** Runs the lab's background jobs starting at `ctx.t`; returns when they are finished. */
  runBackground(): number;
}

export interface CommandDef {
  name: string;
  aliases?: string[];
  category: "dasar" | "file" | "teks" | "jaringan" | "switch" | "keamanan";
  summary: string;
  usage: string;
  run(ctx: CommandContext): number | void;
}

export function requireRoot(ctx: CommandContext, what: string): boolean {
  if (ctx.isRoot()) return true;
  ctx.error(`${what}: Operation not permitted`);
  ctx.print(ansi.yellow(`Petunjuk: perintah ini butuh hak akses admin. Coba tambahkan 'sudo' di depannya.`));
  return false;
}

export function hasFlag(args: string[], ...flags: string[]) {
  return args.some((a) => flags.includes(a) || (/^-[a-zA-Z]+$/.test(a) && flags.some((f) => f.length === 2 && a.includes(f[1]))));
}

export function positional(args: string[]) {
  return args.filter((a) => !a.startsWith("-"));
}
