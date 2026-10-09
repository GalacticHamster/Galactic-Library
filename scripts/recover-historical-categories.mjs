#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {previewGenreRecovery} from './genre-recovery.mjs';
const [oldPath,currentPath,...flags]=process.argv.slice(2);
if(!oldPath||!currentPath||flags.some(flag=>flag!=='--examples'))throw Error('Usage: node scripts/recover-historical-categories.mjs OLD_BACKUP CURRENT_BACKUP [--examples] (read-only preview)');
const [oldBackup,currentBackup]=await Promise.all([oldPath,currentPath].map(async path=>JSON.parse(await readFile(path,'utf8'))));
const {patches,...report}=previewGenreRecovery(oldBackup,currentBackup,{examples:flags.includes('--examples')});
console.log(JSON.stringify(report,null,2));
