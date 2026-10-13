import '../../shared/natural-title-sort.js';

export function compareTitles(left, right) {
  return globalThis.LibraryTitleSort.compare(left,right);
}
