import test from 'node:test';
import {purchasePresentationTests} from './purchase-presentation.js';
for(const [name,run]of purchasePresentationTests)test(name,run);
