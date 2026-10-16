import {test} from 'node:test';
import {consoleLibraryTests} from './console-library.js';
import {nintendoImportTests} from './nintendo-import.js';
for(const [name,run] of [...consoleLibraryTests,...nintendoImportTests])test(name,run);
