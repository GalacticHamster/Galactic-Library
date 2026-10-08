import {countLabel} from './formatters.js';
import { getDatabase } from '../lib/storage.js';

const summary = document.querySelector('#summary');
try {
  const database = await getDatabase();
  const records = Object.values(database.providerItems);
  document.querySelector('#add-library-link').hidden=records.length>0;
  const total = records.filter((item) => item.mediaType === 'game').length;
  const addOnCount = records.filter((item) => item.mediaType === 'game-addon').length;
  const audiobookCount = records.filter((item) => item.mediaType === 'audiobook').length;
  const bookCount = records.filter((item) => item.mediaType === 'book').length;
  const movieCount = records.filter((item) => item.mediaType === 'movie').length;
  const tvCount = records.filter((item) => item.mediaType === 'tv').length;
  const canonical = Object.values(database.canonicalItems);
  const gameCount = canonical.filter((item) => item.mediaType === 'game').length;
  const uniqueAudiobookCount = canonical.filter((item) => item.mediaType === 'audiobook').length;
  const uniqueBookCount = canonical.filter((item) => item.mediaType === 'book').length;
  const uniqueMovieCount = canonical.filter((item) => item.mediaType === 'movie').length;
  const uniqueTvCount = canonical.filter((item) => item.mediaType === 'tv').length;
  const parts = [];
  const softwareCount=canonical.filter(item=>item.mediaType==='software').length;
  if(softwareCount)parts.push(countLabel(softwareCount,'software title'));
  if (total) parts.push(`${gameCount} unique game${gameCount === 1 ? '' : 's'} from ${total} game record${total === 1 ? '' : 's'}`);
  if (audiobookCount) parts.push(`${uniqueAudiobookCount} unique audiobook${uniqueAudiobookCount === 1 ? '' : 's'} from ${audiobookCount} record${audiobookCount === 1 ? '' : 's'}`);
  if (bookCount) parts.push(`${uniqueBookCount} unique book${uniqueBookCount === 1 ? '' : 's'} from ${bookCount} record${bookCount === 1 ? '' : 's'}`);
  if (movieCount) parts.push(`${uniqueMovieCount} unique movie${uniqueMovieCount === 1 ? '' : 's'} from ${movieCount} record${movieCount === 1 ? '' : 's'}`);
  if (tvCount) parts.push(`${uniqueTvCount} unique TV title${uniqueTvCount === 1 ? '' : 's'} from ${tvCount} record${tvCount === 1 ? '' : 's'}`);
  if (addOnCount) parts.push(`${addOnCount} DLC add-on${addOnCount === 1 ? '' : 's'}`);
  summary.textContent = parts.length ? `${parts.join('; ')}.` : Object.keys(database.providerProfiles??{}).length?'No imported items to show. Check your saved accounts in Providers.':'No libraries imported yet.';
} catch (error) {
  summary.textContent = `Could not load library: ${error.message}`;
}
