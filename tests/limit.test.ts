import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { limit } from "kit-p";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("limit", () => {
  test("limits concurrent executions to the specified limit", async () => {
    let activeCount = 0;
    let maxActiveCount = 0;

    const task = async () => {
      activeCount++;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      await delay(50);
      activeCount--;
    };

    const limitedTask = limit(2, task);

    // Launch 5 tasks concurrently
    await Promise.all([
      limitedTask(),
      limitedTask(),
      limitedTask(),
      limitedTask(),
      limitedTask(),
    ]);

    assert.equal(maxActiveCount, 2, "Should never exceed 2 active tasks");
  });

  test("runs all queued tasks and returns correct resolved values", async () => {
    const fn = async (x: number) => {
      await delay(10);
      return x * 2;
    };

    const limitedFn = limit(1, fn);

    const results = await Promise.all([
      limitedFn(1),
      limitedFn(2),
      limitedFn(3),
    ]);

    assert.deepEqual(results, [2, 4, 6]);
  });

  test("frees slots even when tasks reject", async () => {
    let callCount = 0;

    const fn = async (shouldThrow: boolean) => {
      callCount++;
      await delay(10);
      if (shouldThrow) {
        throw new Error("Task failed");
      }
      return "success";
    };

    const limitedFn = limit(1, fn);

    // Run a failing task first
    await assert.rejects(async () => await limitedFn(true), {
      message: "Task failed",
    });

    // Ensure subsequent task can run despite previous failure
    const result = await limitedFn(false);
    assert.equal(result, "success");
    assert.equal(callCount, 2);
  });

  test("safely handles synchronous exceptions and frees slot on same instance", async () => {
    let shouldThrow = true;
    const syncFn = () => {
      if (shouldThrow) {
        throw new Error("Sync error");
      }
      return "ok";
    };

    const limitedFn = limit(1, syncFn);

    // Verify synchronous error is caught properly
    await assert.rejects(async () => await limitedFn(), {
      message: "Sync error",
    });

    // Reuse the SAME instance to verify the slot was actually freed
    shouldThrow = false;
    const result = await limitedFn();
    assert.equal(result, "ok");
  });

  test("handles synchronous non-promise returns properly", async () => {
    const limitedFn = limit(2, (x: number) => x * 10);

    const results = await Promise.all([
      limitedFn(1),
      limitedFn(2),
      limitedFn(3),
    ]);
    assert.deepEqual(results, [10, 20, 30]);
  });

  test("preserves 'this' execution context", async () => {
    const obj = {
      factor: 3,
      async multiply(x: number) {
        await delay(5);
        return x * this.factor;
      },
    };

    // oxlint-disable-next-line typescript/unbound-method
    const limitedMultiply = limit(1, obj.multiply);
    const result = await limitedMultiply.call(obj, 5);

    assert.equal(result, 15);
  });

  test("preserves function metadata properties (length and name)", () => {
    function myCustomFunction(a: number, b: string, c: boolean) {
      return `${a}-${b}-${c}`;
    }

    const limitedFn = limit(3, myCustomFunction);

    assert.equal(limitedFn.name, "myCustomFunction");
    assert.equal(limitedFn.length, 3);
  });
});
