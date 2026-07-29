export type AutosaveStatus =
  | "unchanged"
  | "dirty"
  | "saving"
  | "saved"
  | "error";

type TimerHandle = ReturnType<typeof setTimeout>;

type PendingSave<Value> = {
  value: Value;
  revision: number;
};

export class DebouncedAutosave<Value> {
  private timer: TimerHandle | null = null;
  private pending: PendingSave<Value> | undefined;
  private revision = 0;
  private inFlight: Promise<boolean> | null = null;
  private disposed = false;

  constructor(
    private readonly save: (value: Value) => void | Promise<void>,
    private readonly onStatus: (status: AutosaveStatus) => void,
    private readonly delay = 750,
  ) {}

  schedule(value: Value) {
    if (this.disposed) return;
    this.revision += 1;
    this.pending = { value, revision: this.revision };
    this.emitStatus("dirty");
    this.clearTimer();
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.delay);
  }

  async flush(): Promise<boolean> {
    this.clearTimer();

    if (this.inFlight) {
      const succeeded = await this.inFlight;
      return succeeded && this.pending ? this.flush() : succeeded;
    }

    if (!this.pending) return true;

    const operation = this.flushPending();
    this.inFlight = operation;

    try {
      return await operation;
    } finally {
      if (this.inFlight === operation) {
        this.inFlight = null;
      }
    }
  }

  retry() {
    return this.flush();
  }

  hasPending() {
    return Boolean(this.pending) || Boolean(this.inFlight);
  }

  async dispose({ flush = true } = {}): Promise<boolean> {
    this.disposed = true;
    if (flush) {
      return this.flush();
    }

    this.clearTimer();
    this.pending = undefined;
    return this.inFlight ? this.inFlight : true;
  }

  private async flushPending() {
    while (this.pending) {
      const current = this.pending;
      this.pending = undefined;
      this.emitStatus("saving");

      try {
        await this.save(current.value);
      } catch {
        if (!this.pending) {
          this.pending = current;
          this.emitStatus("error");
          return false;
        }

        // A newer full draft supersedes the failed revision. Persist it next;
        // never let the older response decide the final status.
        this.emitStatus("dirty");
        continue;
      }

      if (this.pending) {
        this.emitStatus("dirty");
      } else if (current.revision === this.revision) {
        this.emitStatus("saved");
      }
    }

    return true;
  }

  private emitStatus(status: AutosaveStatus) {
    if (!this.disposed) this.onStatus(status);
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
