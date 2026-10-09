import test from 'node:test';
import {crossProviderCollectionTests} from './cross-provider-collections.js';
for(const [name,run] of crossProviderCollectionTests)test(name,run);
