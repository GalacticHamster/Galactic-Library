// Only the storage writer registers fully validated, detached, deeply frozen
// committed data here. A merely frozen caller object is not a trusted revision.
const committed = new WeakSet();
export function registerCommittedSnapshot(database) {
  if (!Object.isFrozen(database)) throw Error('A committed snapshot must be immutable.');
  committed.add(database);
  return database;
}
export const isCommittedSnapshot = database => committed.has(database);
