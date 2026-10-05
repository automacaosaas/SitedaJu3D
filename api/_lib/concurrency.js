'use strict';
// Runs fn over items with at most `limit` calls in flight at once, and returns the results in the order of the items.
// For calls to an outside service inside a request (the panel asking Bling about notes still processing): in parallel,
// so the wait is about the slowest call instead of the sum of all, but capped, so the service is not flooded.
// The first error rejects the whole run (callers that must not fail catch inside fn).
async function mapLimit(items, limit, fn) {
  const list = Array.from(items), results = new Array(list.length);
  const width = Math.max(1, Math.min(Math.floor(Number(limit)) || 1, list.length));
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const index = next++;
      results[index] = await fn(list[index], index);
    }
  }
  await Promise.all(Array.from({length: list.length ? width : 0}, worker));
  return results;
}

module.exports = {mapLimit};
