import { getDatabase } from '../lib/storage.js';

const summary = document.querySelector('#summary');
try {
  const database = await getDatabase();
  const records = Object.values(database.providerItems);
  const total = records.filter((item) => item.mediaType === 'game').length;
  const addOnCount = records.filter((item) => item.mediaType === 'game-addon').length;
  const unique = Object.keys(database.canonicalItems).length;
  summary.textContent = total ? `${unique} unique game${unique === 1 ? '' : 's'} from ${total} game record${total === 1 ? '' : 's'}${addOnCount ? `, plus ${addOnCount} DLC add-on${addOnCount === 1 ? '' : 's'}` : ''}.` : 'No libraries connected yet.';
} catch (error) {
  summary.textContent = `Could not load library: ${error.message}`;
}
