import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { queue } from "kit-p";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("queue", () => {
  test("limits concurrent executions to the specified concurrency", async () => {
    let activeCount = 0;
    let maxActiveCount = 0;

    const q = queue({ concurrency: 2 });

    const task = async () => {
      activeCount++;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      await delay(50);
      activeCount--;
    };

    // Launch 5 tasks concurrently
    await Promise.all([
      q.add(task),
      q.add(task),
      q.add(task),
      q.add(task),
      q.add(task),
    ]);

    assert.equal(maxActiveCount, 2, "Should never exceed 2 active tasks");
  });

  test("runs all queued tasks and returns correct resolved values", async () => {
    const q = queue({ concurrency: 1 });

    const results = await Promise.all([
      q.add(async () => {
        await delay(10);
        return 1 * 2;
      }),
      q.add(async () => {
        await delay(10);
        return 2 * 2;
      }),
      q.add(async () => {
        await delay(10);
        return 3 * 2;
      }),
    ]);

    assert.deepEqual(results, [2, 4, 6]);
  });

  test("frees slots even when tasks reject", async () => {
    let callCount = 0;
    const q = queue({ concurrency: 1 });

    // Run a failing task first
    await assert.rejects(
      async () =>
        await q.add(async () => {
          callCount++;
          await delay(10);
          throw new Error("Task failed");
        }),
      {
        message: "Task failed",
      },
    );

    // Ensure subsequent task can run despite previous failure
    const result = await q.add(async () => {
      callCount++;
      return "success";
    });

    assert.equal(result, "success");
    assert.equal(callCount, 2);
  });

  test("safely handles synchronous exceptions and frees slot", async () => {
    const q = queue({ concurrency: 1 });

    // Verify synchronous error is caught properly
    await assert.rejects(
      async () =>
        await q.add(() => {
          throw new Error("Sync error");
        }),
      {
        message: "Sync error",
      },
    );

    // Reuse the SAME instance to verify the slot was actually freed
    const result = await q.add(() => "ok");
    assert.equal(result, "ok");
  });

  test("handles synchronous non-promise returns properly", async () => {
    const q = queue({ concurrency: 2 });

    const results = await Promise.all([
      q.add(() => 10),
      q.add(() => 20),
      q.add(() => 30),
    ]);

    assert.deepEqual(results, [10, 20, 30]);
  });

  test("accurately tracks size and pending properties", async () => {
    const q = queue({ concurrency: 1 });

    assert.equal(q.size, 0);
    assert.equal(q.pending, 0);

    const promise1 = q.add(() => delay(50));
    const promise2 = q.add(() => delay(50));

    assert.equal(q.pending, 1, "Should have 1 active task running");
    assert.equal(q.size, 1, "Should have 1 queued task waiting");

    await Promise.all([promise1, promise2]);

    assert.equal(q.pending, 0);
    assert.equal(q.size, 0);
  });

  test("clears queued tasks and rejects their promises", async () => {
    const q = queue({ concurrency: 1 });
    let executedCount = 0;

    const task = async () => {
      executedCount++;
      await delay(50);
    };

    const p1 = q.add(task);
    const p2 = q.add(task);
    const p3 = q.add(task);

    assert.equal(q.size, 2);

    q.clear();

    assert.equal(q.size, 0);

    // Waiting queued tasks must reject rather than hanging indefinitely
    await assert.rejects(p2, { message: "Queue cleared" });
    await assert.rejects(p3, { message: "Queue cleared" });

    await p1;
    await delay(100);

    assert.equal(
      executedCount,
      1,
      "Only the task that started before clear() should run",
    );
  });

  test("resolves onIdle immediately if queue is already idle", async () => {
    const q = queue({ concurrency: 1 });
    await q.onIdle();
    assert.equal(q.pending, 0);
    assert.equal(q.size, 0);
  });

  test("resolves onIdle when all tasks finish", async () => {
    const q = queue({ concurrency: 2 });
    let completed = 0;

    q.add(async () => {
      await delay(20);
      completed++;
    });
    q.add(async () => {
      await delay(40);
      completed++;
    });
    q.add(async () => {
      await delay(10);
      completed++;
    });

    await q.onIdle();

    assert.equal(completed, 3);
    assert.equal(q.pending, 0);
    assert.equal(q.size, 0);
  });

  test("resolves onIdle when clear() empties remaining tasks and active finishes", async () => {
    const q = queue({ concurrency: 1 });
    let completed = 0;

    q.add(async () => {
      await delay(20);
      completed++;
    });
    const p2 = q.add(async () => {
      await delay(50);
      completed++;
    });

    // Suppress unhandled rejections on p2 due to clear
    p2.catch(() => {});

    q.clear();

    await q.onIdle();

    assert.equal(completed, 1);
    assert.equal(q.pending, 0);
    assert.equal(q.size, 0);
  });

  test("defaults to Infinity concurrency when no options provided", async () => {
    const q = queue();
    let activeCount = 0;
    let maxActiveCount = 0;

    const task = async () => {
      activeCount++;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      await delay(20);
      activeCount--;
    };

    await Promise.all([q.add(task), q.add(task), q.add(task), q.add(task)]);

    assert.equal(
      maxActiveCount,
      4,
      "Should execute all tasks concurrently by default",
    );
  });
});
