/**
 * trips-diff.json stores each feed's service sets as indices into one list
 * of service_ids (`service_ids`) instead of repeating the ids in every set
 * (IDFM: 33 sets naming 95,900 ids, 9,459 distinct; 8.2 of the file's
 * 10.8 MB). expandServiceSets() restores the string sets every reader uses;
 * an index written before this encoding comes back unchanged.
 *
 * Pure and type-only on imports: the Node build imports it.
 */

interface StringSets {
  base: string[][];
  new: string[][];
}

interface IndexSets {
  base: number[][];
  new: number[][];
}

/** A trips index as written: service sets as indices into `service_ids`. */
export type CompactTripsIndex<T extends { service_sets: StringSets }> = Omit<
  T,
  'service_sets'
> & { service_ids: string[]; service_sets: IndexSets };

export function compactServiceSets<T extends { service_sets: StringSets }>(
  doc: T,
): CompactTripsIndex<T> {
  const ids = [
    ...new Set([
      ...doc.service_sets.base.flat(),
      ...doc.service_sets.new.flat(),
    ]),
  ].sort();
  const at = new Map(ids.map((id, i) => [id, i]));
  const side = (sets: string[][]): number[][] =>
    sets.map((set) => set.map((s) => at.get(s) ?? -1));
  return {
    ...doc,
    service_ids: ids,
    service_sets: {
      base: side(doc.service_sets.base),
      new: side(doc.service_sets.new),
    },
  };
}

/** The trips index with string service sets, whichever way it was written. */
export function expandServiceSets<T extends { service_sets: StringSets }>(
  doc: T | CompactTripsIndex<T>,
): T {
  if (!('service_ids' in doc)) return doc;
  const ids = doc.service_ids;
  const side = (sets: number[][]): string[][] =>
    sets.map((set) => set.map((i) => ids.at(i) ?? ''));
  const out: Record<string, unknown> = {
    ...doc,
    service_sets: {
      base: side(doc.service_sets.base),
      new: side(doc.service_sets.new),
    },
  };
  delete out.service_ids;
  return out as T;
}
