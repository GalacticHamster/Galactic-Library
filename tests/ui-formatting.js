import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {providerLabel,accountLabel,accessLabel,readingAccessLabel,countLabel,rangeLabel,formatDate} from '../src/ui/formatters.js';
import {safeProviderUrl,PROVIDER_SYNC_URLS} from '../src/ui/sync-health.js';
import {PROVIDER_SITES} from '../src/ui/provider-accounts.js';
export const uiFormattingTests=[
 ['generated provider/account captions retain exact account nicknames',()=>{const record={provider:'humble',profileId:'a'},db={providerProfiles:{a:{nickname:'Family ? 日本語'}}};assert.equal(providerLabel('gog'),'GOG');assert.equal(accountLabel(record,db),'Humble Bundle — Family ? 日本語');assert.equal(accountLabel({...record,profileId:'b'},db),'Humble Bundle — Unnamed account');}],
 ['providerLabel formats console providers and falls back safely for unknown providers',()=>{
   assert.equal(providerLabel('playstation'),'PlayStation — PS4/PS5 Purchased Library');
   assert.equal(providerLabel('xbox'),'Xbox — Web Library');
   assert.equal(providerLabel('nintendo'),'Nintendo');
   assert.equal(providerLabel('unknown_provider'),'unknown_provider');
   const psSite=PROVIDER_SITES.find(s=>s.provider==='playstation');
   assert.equal(psSite?.name,'PlayStation — PS4/PS5 Purchased Library');
   assert(!psSite?.name.includes('?'),'PlayStation site name must not contain question marks');
 }],
 ['safeProviderUrl resolves valid destinations for console providers and rejects missing/unsafe schemes',()=>{
   assert.equal(safeProviderUrl('playstation'),'https://library.playstation.com/recently-purchased');
   assert.equal(safeProviderUrl('xbox'),'https://play.xbox.com/library?tab=fullLibrary&view=grid&catalog=owned');
   assert.equal(safeProviderUrl('nintendo'),'https://accounts.nintendo.com/portal/vgcs');
   assert.equal(safeProviderUrl('steam'),'https://store.steampowered.com/');
   assert.equal(safeProviderUrl('unknown_provider'),null);
   assert.equal(safeProviderUrl(''),null);
   assert.equal(safeProviderUrl(null),null);
   for(const [provider,url] of Object.entries(PROVIDER_SYNC_URLS)){
     assert.equal(typeof url,'string');
     assert(/^https?:\/\//i.test(url),`URL for ${provider} must use http/https scheme`);
   }
 }],
 ['ownership and self-reported access unknown labels remain distinct',()=>{assert.equal(accessLabel('unknown'),'Ownership unconfirmed');assert.equal(readingAccessLabel('unknown'),'Access not checked');assert.equal(accessLabel('borrowed'),'Borrowed');assert.equal(accessLabel('claimed'),'Permanently claimed');assert.equal(accessLabel('rental'),'Rented');}],
 ['UI count/range formatting handles zero, one and many',()=>{assert.equal(countLabel(0,'software title'),'0 software titles');assert.equal(countLabel(1,'software title'),'1 software title');assert.equal(countLabel(2,'software title'),'2 software titles');assert.equal(rangeLabel(1,50),'1–50');}],
 ['date-only captions retain the calendar day across local timezones',()=>{const previous=process.env.TZ;try{for(const zone of ['America/New_York','Pacific/Honolulu','Asia/Tokyo']){process.env.TZ=zone;assert.equal(formatDate('2026-10-01',{locale:'en-US'}),'Oct 1, 2026');}}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}}],
 ['timestamps and invalid/missing dates have readable distinct captions',()=>{assert.equal(formatDate(null),'Not recorded');assert.equal(formatDate('invalid'),'Not recorded');assert.equal(formatDate('2026-02-31'),'Invalid date');assert.match(formatDate('2026-10-08T17:00:00Z',{locale:'en-US'}),/2026/);}],
 ['authored publisher, progress and Kindle timing examples have no corrupted punctuation',async()=>{for(const file of ['src/ui/local-metadata-tools.js','src/ui/options.js','src/ui/pagination.js','src/providers/kindle-content.js','src/ui/provider-accounts.js']){const source=await readFile(new URL('../'+file,import.meta.url),'utf8');assert(!/PlayStation \?|Copy \?Collects|Looking up \?|20\?50|\uFFFD|â€”/u.test(source),file+' has malformed authored text');}const options=await readFile(new URL('../src/ui/options.js',import.meta.url),'utf8');assert(options.includes('Looking up “'));const pagination=await readFile(new URL('../src/ui/pagination.js',import.meta.url),'utf8');assert(pagination.includes('\\u2013'));}],
];
