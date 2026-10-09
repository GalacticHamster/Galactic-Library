import test from 'node:test';
import {bundleMatchContextTests} from './bundle-match-context.js';
for(const [name,run] of bundleMatchContextTests)test(name,run);
