// Import publishes both original and converted ownership before collection can run.
// A queue, rather than a busy flag, also orders collections that already started.
let pending: Promise<unknown> = Promise.resolve();
export function withProjectAssetOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => undefined);
  return result;
}
