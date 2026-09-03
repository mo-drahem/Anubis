// Lightweight per-test cleanup helper — runs registered tasks in LIFO order, so a resource
// gets torn down before whatever it depends on (e.g. a child entity before its parent
// workspace). Playwright's fixtures already give per-test teardown for free (code after
// `await use()`), so this doesn't need magpie's global cross-test priority queue ("Goblin") —
// this exists for the narrower case where ONE test creates multiple interdependent resources
// and needs them torn down in the right order.
export class CleanupStack {
  // Accepts `Promise<unknown>` (not just `Promise<void>`) so callers can pass an API client
  // call directly — e.g. `cleanup.push(() => connectionApi.delete(id))` — without an extra
  // wrapper just to discard its resolved value.
  private tasks: Array<() => Promise<unknown> | void> = [];

  push(task: () => Promise<unknown> | void) {
    this.tasks.push(task);
  }

  async runAll() {
    while (this.tasks.length) {
      const task = this.tasks.pop()!;
      try {
        await task();
      } catch (err) {
        // Don't let one failed cleanup stop the rest — best-effort cleanup, matching
        // magpie's Goblin behavior, logged rather than swallowed.
        console.error('Cleanup task failed:', err);
      }
    }
  }
}
