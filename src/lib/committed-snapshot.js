// Only the storage writer registers fully validated, detached, deeply frozen
// committed data here. A merely frozen caller object is not a trusted revision.
const committed = new WeakSet();
const sequences=new WeakMap();let sequence=0;
const effectiveCatalogs=new WeakMap();
// Effective views have validated observation metadata, not raw certificate
// provenance. Never register them in the raw committed WeakSet.
export function registerEffectiveSnapshot(view,catalog){
  if(!Object.isFrozen(view)||!isCommittedSnapshot(catalog))throw Error('An effective view requires a committed catalog.');
  effectiveCatalogs.set(view,catalog);return view;
}
export const committedCatalogSnapshot=view=>committed.has(view)?view:effectiveCatalogs.get(view)??null;
export function registerCommittedSnapshot(database) {
  if (!Object.isFrozen(database)) throw Error('A committed snapshot must be immutable.');
  committed.add(database);
  if(!sequences.has(database))sequences.set(database,++sequence);
  return database;
}
export const isCommittedSnapshot = database => committed.has(database);
// Opaque object identity for diagnostics, not a persisted/content revision.
export const committedSnapshotSequence = database => sequences.get(database)??0;
