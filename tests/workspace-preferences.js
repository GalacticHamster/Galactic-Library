import assert from 'node:assert/strict';
import { createStorageWriter } from '../src/background/storage-writer.js';
import { UI_PREFERENCES_KEY } from '../src/lib/ui-preferences.js';
import { createBackup } from '../src/lib/storage.js';

export const workspacePreferenceTests = [
  ['display preferences start at Library, serialize partial filter updates, reject invalid writes and stay out of ownership backups', async () => {
    const values = {};
    const writer = createStorageWriter({
      get: async defaults => structuredClone({ ...defaults, ...values }),
      set: async updates => Object.assign(values, structuredClone(updates)),
      remove: async keys => { for (const key of keys) delete values[key]; }
    });
    assert.equal((await writer.getUiPreferences()).workspace, 'library');
    await Promise.all([
      writer.saveUiPreferences({ library: { search: 'Volume 2', page: 1 } }),
      writer.saveUiPreferences({ library: { provider: 'humble' }, books: { search: 'Manga', ownership: 'unknown' }, workspace: 'books' })
    ]);
    const saved = await writer.getUiPreferences();
    assert.equal(saved.browse.search, 'Volume 2');
    assert.equal(saved.browse.provider, 'humble');
    assert.equal(saved.browse.page, 1);
    assert.equal(saved.books.search, 'Manga');
    assert.equal(saved.workspace, 'books');
    const before = structuredClone(values);
    for (const invalid of [{ workspace: 'credentials' }, { secret: 'value' }, { books: { page: -1 } }, { library: { mediaType: 'guess' } }, { library: { search: 'x'.repeat(501) } }])
      await assert.rejects(writer.saveUiPreferences(invalid));
    assert.deepEqual(values, before);
    assert.ok(!JSON.stringify(createBackup(await writer.getDatabase())).includes('Volume 2'));
    await writer.clearDatabase();
    assert.ok(!(UI_PREFERENCES_KEY in values));
    assert.equal((await writer.getUiPreferences()).workspace, 'library');
  }]
];
