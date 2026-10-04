// Database values have already passed validation. Compare JSON-shaped data
// without serializing it or treating object insertion order as a migration.
export function equalDatabaseData(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, index) => equalDatabaseData(value, right[index]));
  }
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && equalDatabaseData(left[key], right[key]));
}
