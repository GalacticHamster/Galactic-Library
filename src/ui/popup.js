import { getDatabase } from '../lib/storage.js';

const summary = document.querySelector('#summary');
try {
  const database = await getDatabase();
  const records = Object.values(database.providerItems);
  const total = records.filter((item) => item.mediaType === 'game').length;
  const addOnCount = records.filter((item) => item.mediaType === 'game-addon').length;
  const audiobookCount = records.filter((item) => item.mediaType === 'audiobook').length;
  const canonical = Object.values(database.canonicalItems);
  const gameCount = canonical.filter((item) => item.mediaType === 'game').length;
  const uniqueAudiobookCount = canonical.filter((item) => item.mediaType === 'audiobook').length;
  const parts = [];
  if (total) parts.push(`${gameCount} unique game${gameCount === 1 ? '' : 's'} from ${total} game record${total === 1 ? '' : 's'}`);
  if (audiobookCount) parts.push(`${uniqueAudiobookCount} unique audiobook${uniqueAudiobookCount === 1 ? '' : 's'} from ${audiobookCount} record${audiobookCount === 1 ? '' : 's'}`);
  if (addOnCount) parts.push(`${addOnCount} DLC add-on${addOnCount === 1 ? '' : 's'}`);
  summary.textContent = parts.length ? `${parts.join('; ')}.` : 'No libraries connected yet.';
} catch (error) {
  summary.textContent = `Could not load library: ${error.message}`;
}
