import test from 'node:test';
import {purchaseReconciliationTests} from './purchase-reconciliation.js';
for(const [name,run]of purchaseReconciliationTests)test(name,run);
