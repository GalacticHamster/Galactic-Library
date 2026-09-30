const titleCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function compareTitles(left, right) {
  return titleCollator.compare(left, right) || left.localeCompare(right);
}
