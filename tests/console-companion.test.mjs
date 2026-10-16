import test from 'node:test';
import {consoleCompanionTests} from './console-companion.js';
for(const [name,run]of consoleCompanionTests)test(name,run);
