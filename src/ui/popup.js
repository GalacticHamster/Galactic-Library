import { getDatabase } from '../lib/storage.js';

const summary = document.querySelector('#summary');
try {
  const database = await getDatabase();
  const total = Object.keys(database.providerItems).length;
  const unique = Object.keys(database.canonicalItems).length;
  summary.textContent = total ? `${unique} unique game${unique === 1 ? '' : 's'} from ${total} provider record${total === 1 ? '' : 's'}.` : 'No libraries connected yet.';
} catch (error) {
  summary.textContent = `Could not load library: ${error.message}`;
}
