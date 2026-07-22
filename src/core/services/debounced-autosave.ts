export type AutosaveStatus =
  | "unchanged"
  | "dirty"
  | "saving"
  | "saved"
  | "error";

type TimerHandle = ReturnType<typeof setTimeout>;

export class DebouncedAutosave<Value> {
  private timer: TimerHandle | null = null;
  private pending: Value | undefined;

  constructor(
    private readonly save: (value: Value) => void,
    private readonly onStatus: (status: AutosaveStatus) => void,
    private readonly delay = 750,
  ) {}

  schedule(value: Value) {
    this.pending = value;
    this.onStatus("dirty");
    this.clearTimer();
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  flush() {
    this.clearTimer();

    if (this.pending === undefined) {
      return true;
    }

    const value = this.pending;
    this.onStatus("saving");

    try {
      this.save(value);
      this.pending = undefined;
      this.onStatus("saved");
      return true;
    } catch {
      this.onStatus("error");
      return false;
    }
  }

  retry() {
    return this.flush();
  }

  hasPending() {
    return this.pending !== undefined;
  }

  dispose({ flush = true } = {}) {
    if (flush) {
      this.flush();
    } else {
      this.clearTimer();
    }
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
