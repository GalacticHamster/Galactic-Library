import test from 'node:test';import {purchaseRepairTests} from './purchase-repair.js';for(const [name,work]of purchaseRepairTests)test(name,work);
