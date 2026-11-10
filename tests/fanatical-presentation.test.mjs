import { test } from 'node:test';
import { fanaticalPresentationTests } from './fanatical-presentation.js';

for (const [name, run] of fanaticalPresentationTests) {
  test(name, run);
}
