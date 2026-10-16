import {readFile,writeFile} from 'node:fs/promises';
import {runtimeZip} from '../release.mjs';
import {outputPath} from '../audit-artifacts.mjs';
const files=new Map();for(const name of ['manifest.json','core.js','probe.js','panel.js'])files.set(name,await readFile(new URL('./xbox-web-validation/'+name,import.meta.url)));
const path=await outputPath('audit-artifacts/console-web-validation/GL-Xbox-Web-Validation.zip');
await writeFile(path,runtimeZip(files));console.log('Created read-only Xbox validation helper: '+path);
