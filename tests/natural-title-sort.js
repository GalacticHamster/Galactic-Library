import assert from 'node:assert/strict';
import {compareTitles} from '../src/lib/title-sort.js';
import {checkTitleSorting} from './natural-title-sort-fixture.mjs';
export const naturalTitleSortTests=[['shared natural title sorting handles written numbers and ordinals only after volume markers',()=>checkTitleSorting({...globalThis.LibraryTitleSort,compare:compareTitles},assert)]];
