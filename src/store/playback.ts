import type { BrowserEvent, ExecResult, HopEvent, SimEvent } from "@/engine";

export interface ActiveHop {
  event: HopEvent;
  start: number;
  duration: number;
}

export interface PlaybackCallbacks {
  output(text: string): void;
  hopStarted(event: HopEvent): void;
  browser(event: BrowserEvent): void;
  /** Called at most once per animation frame with the hops currently on the wire. */
  activeChanged(hops: ActiveHop[]): void;
  done(): void;
}

/**
 * Replays a command's event timeline in (scaled) real time using a single
 * requestAnimationFrame loop, so that scans with thousands of packets stay smooth.
 */
export class Playback {
  private events: SimEvent[];
  private next = 0;
  private active: ActiveHop[] = [];
  private startedAt = 0;
  private frame = 0;
  private stopped = false;

  constructor(
    private result: ExecResult,
    private speed: number,
    private cb: PlaybackCallbacks,
  ) {
    this.events = [...result.events].sort((a, b) => a.at - b.at);
  }

  start() {
    if (this.speed === 0) {
      this.flush();
      return;
    }
    this.startedAt = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Emits everything that has not been shown yet and finishes immediately (Ctrl+C / "Instan"). */
  flush() {
    if (this.stopped) return;
    for (; this.next < this.events.length; this.next++) this.emit(this.events[this.next], performance.now());
    this.finish();
  }

  cancel() {
    this.flush();
  }

  private emit(e: SimEvent, now: number) {
    if (e.kind === "output") this.cb.output(e.text);
    else if (e.kind === "browser") this.cb.browser(e);
    else {
      this.cb.hopStarted(e);
      if (this.speed > 0) this.active.push({ event: e, start: now, duration: e.duration / this.speed });
    }
  }

  private tick = (now: number) => {
    if (this.stopped) return;
    const simNow = (now - this.startedAt) * this.speed;
    let changed = false;
    while (this.next < this.events.length && this.events[this.next].at <= simNow) {
      const e = this.events[this.next++];
      // Position the hop as if it had started exactly on time.
      this.emit(e, this.startedAt + e.at / this.speed);
      if (e.kind === "hop") changed = true;
    }
    const before = this.active.length;
    this.active = this.active.filter((h) => now < h.start + h.duration + 120);
    if (changed || before !== this.active.length) this.cb.activeChanged(this.active);

    if (this.next >= this.events.length && simNow >= this.result.duration + 150 && !this.active.length) {
      this.finish();
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private finish() {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    this.active = [];
    this.cb.activeChanged([]);
    this.cb.done();
  }
}
