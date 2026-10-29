// Tool-count sweep sets (TOOL_SET=count in eval-choice.ts): the tools one request is offered when
// the menu is held at `count` tools. The head (prod's most-called tools) comes first, then the rest
// of the registry in a seeded shuffle; each request's labelled tool is always added. With the same
// seed, a request's set at a smaller count is a subset of its set at every larger count, so
// accuracy at 40 and at 96 is compared on the same requests, the 96 set adding only distractors.

/** The registry order every count draws from: head tools present in `names`, then the rest
 *  shuffled by `seed` (names sorted first, so registration order does not move the draw). */
export function countOrder(names, head, seed) {
  const pool = [...new Set(names)].sort();
  const first = head.filter((h) => pool.includes(h));
  const rest = pool.filter((n) => !first.includes(n));
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...first, ...rest];
}

/** `count` tool names in `order`'s order: the first ones, plus `label` (if any) in its own place,
 *  so the label's position in the declarations is no hint. */
export function countSet(order, count, label) {
  if (count > order.length) throw new Error(`count ${count} > ${order.length} registered tools`);
  const take = label && !order.slice(0, count).includes(label) ? count - 1 : count;
  const picked = new Set(order.slice(0, take));
  if (label) picked.add(label);
  return order.filter((n) => picked.has(n));
}
