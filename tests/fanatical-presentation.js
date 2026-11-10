import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../src/providers/fanatical.js', import.meta.url), 'utf8'), context);
const GF = context.GalacticFanatical;

export const fanaticalPresentationTests = [
  ['GalacticFanatical.formatScanSummary formats successful quick updates and full rescans', () => {
    // 1. Successful Quick Update with no new items
    const quickZero = GF.formatScanSummary({ ordersScanned: 2, addedProducts: 0, ownedLeafProducts: 179 }, { fullScan: false });
    assert.equal(quickZero.title, 'Quick update completed');
    assert.equal(quickZero.detail, 'Checked 2 purchases. No new items found.');
    assert.equal(quickZero.library, '179 items in your library.');
    assert.equal(quickZero.text, 'Quick update completed\n\nChecked 2 purchases. No new items found.\n\n179 items in your library.');
    assert.equal(quickZero.html, '<strong>Quick update completed</strong>\n\nChecked 2 purchases. No new items found.\n\n179 items in your library.');

    // Singular checked purchase
    const quickSingleZero = GF.formatScanSummary({ ordersScanned: 1, addedProducts: 0, ownedLeafProducts: 1 }, { fullScan: false });
    assert.equal(quickSingleZero.detail, 'Checked 1 purchase. No new items found.');
    assert.equal(quickSingleZero.library, '1 item in your library.');

    // Zero checked purchases on quick update
    const quickNoChecked = GF.formatScanSummary({ ordersScanned: 0, addedProducts: 0, ownedLeafProducts: 179 }, { fullScan: false });
    assert.equal(quickNoChecked.detail, 'No purchases needed checking. No new items found.');

    // 2. Successful Quick Update with newly imported items
    const quickNew = GF.formatScanSummary({ ordersScanned: 2, addedProducts: 10, ownedLeafProducts: 189 }, { fullScan: false });
    assert.equal(quickNew.title, 'Quick update completed');
    assert.equal(quickNew.detail, 'Checked 2 purchases. Imported 10 new items.');
    assert.equal(quickNew.library, '189 items in your library.');

    // Singular newly imported item
    const quickSingleNew = GF.formatScanSummary({ ordersScanned: 1, addedProducts: 1, ownedLeafProducts: 10 }, { fullScan: false });
    assert.equal(quickSingleNew.detail, 'Checked 1 purchase. Imported 1 new item.');

    // 3. Successful Full Import
    const fullImport = GF.formatScanSummary({ ordersScanned: 3, addedProducts: 122, ownedLeafProducts: 179 }, { fullScan: true });
    assert.equal(fullImport.title, 'Full import completed');
    assert.equal(fullImport.detail, 'Checked 3 purchases. Imported 122 new items.');
    assert.equal(fullImport.library, '179 items in your library.');

    // Full import with zero new items
    const fullZeroNew = GF.formatScanSummary({ ordersScanned: 3, addedProducts: 0, ownedLeafProducts: 179 }, { fullScan: true });
    assert.equal(fullZeroNew.title, 'Full import completed');
    assert.equal(fullZeroNew.detail, 'Checked 3 purchases. No new items found.');

    // Full import on empty account
    const fullEmpty = GF.formatScanSummary({ ordersScanned: 0, addedProducts: 0, ownedLeafProducts: 0 }, { fullScan: true });
    assert.equal(fullEmpty.detail, 'No purchases found in your account.');
    assert.equal(fullEmpty.library, '0 items in your library.');
  }],

  ['GalacticFanatical.formatScanSummary formats partial imports without redundant warnings', () => {
    // 4. Partial import (User Example 1)
    const partialSingle = GF.formatScanSummary({
      outcome: 'partial',
      unresolvedOrders: 1,
      verifiedPurchasesSaved: 2,
      addedProducts: 50,
      ownedLeafProducts: 150
    }, { fullScan: false });
    assert.equal(partialSingle.title, 'Quick update partially completed');
    assert.equal(partialSingle.detail, "Couldn't check 1 purchase. It will be retried on your next update.");
    assert.equal(partialSingle.library, 'Saved 2 purchases and added 50 items. Your library now contains 150 items. Earlier records were preserved.');
    assert.equal(partialSingle.text, "Quick update partially completed\n\nCouldn't check 1 purchase. It will be retried on your next update.\n\nSaved 2 purchases and added 50 items. Your library now contains 150 items. Earlier records were preserved.");

    // Partial with plural unresolved
    const partialPlural = GF.formatScanSummary({
      outcome: 'partial',
      unresolvedOrders: 3,
      verifiedPurchasesSaved: 5,
      addedProducts: 0,
      totalItems: 100
    }, { fullScan: false });
    assert.equal(partialPlural.detail, "Couldn't check 3 purchases. They will be retried on your next update.");
    assert.equal(partialPlural.library, 'Saved 5 purchases. No new items found. Your library now contains 100 items. Earlier records were preserved.');

    // Partial with listing incomplete only
    const partialListing = GF.formatScanSummary({
      outcome: 'partial-discovery',
      listingIncomplete: true,
      verifiedPurchasesSaved: 10,
      addedProducts: 20,
      ownedLeafProducts: 120
    }, { fullScan: false });
    assert.equal(partialListing.detail, "Part of your purchase list couldn't be checked. It will be retried on your next update.");
    assert.equal(partialListing.library, 'Saved 10 purchases and added 20 items. Your library now contains 120 items. Earlier records were preserved.');

    // Partial with both unresolved and listing incomplete (combined single warning)
    const partialBoth = GF.formatScanSummary({
      outcome: 'partial',
      unresolvedOrders: 2,
      listingIncomplete: true,
      verifiedPurchasesSaved: 4,
      addedProducts: 5,
      ownedLeafProducts: 105
    }, { fullScan: false });
    assert.equal(partialBoth.detail, "Couldn't check 2 purchases and part of your purchase list could not be reached. They will be retried on your next update.");
    assert.equal(partialBoth.library, 'Saved 4 purchases and added 5 items. Your library now contains 105 items. Earlier records were preserved.');

    // Non-retryable partial
    const partialNonRetryable = GF.formatScanSummary({
      outcome: 'partial',
      unresolvedOrders: 1,
      retryable: false,
      verifiedPurchasesSaved: 2,
      addedProducts: 0,
      ownedLeafProducts: 100
    }, { fullScan: false });
    assert.equal(partialNonRetryable.detail, "Couldn't check 1 purchase.");
  }],

  ['GalacticFanatical.formatScanSummary formats failed imports tailored to failure category', () => {
    // 5. Failed import (Authentication - User Example 2)
    const failedAuth = GF.formatScanSummary({ outcome: 'failed', category: 'authentication' });
    assert.equal(failedAuth.title, 'Import failed');
    assert.equal(failedAuth.detail, "Couldn't access your Fanatical purchases. Make sure you're signed in to Fanatical, then try again.");
    assert.equal(failedAuth.library, 'Your existing library was not changed.');
    assert.equal(failedAuth.text, "Import failed\n\nCouldn't access your Fanatical purchases. Make sure you're signed in to Fanatical, then try again.\n\nYour existing library was not changed.");

    // Failed import (Storage)
    const failedStorage = GF.formatScanSummary({ outcome: 'failed', category: 'storage' });
    assert.equal(failedStorage.detail, "Couldn't save your purchases locally. Check available browser storage, then try again.");
    assert.equal(failedStorage.library, 'Your existing library was not changed.');

    // Failed import (Scope)
    const failedScope = GF.formatScanSummary({ outcome: 'failed', category: 'scope' });
    assert.equal(failedScope.detail, "The signed-in account doesn't match your saved library. Check your active account, then try again.");
    assert.equal(failedScope.library, 'Your existing library was not changed.');

    // Failed import (Rate limit)
    const failedLimit = GF.formatScanSummary({ outcome: 'failed', category: 'limit' });
    assert.equal(failedLimit.detail, "Fanatical requested a temporary delay before checking more purchases. Please try again later.");

    // Failed import (Unavailable)
    const failedUnavailable = GF.formatScanSummary({ outcome: 'failed', category: 'unavailable' });
    assert.equal(failedUnavailable.detail, "Fanatical didn't respond or is currently unavailable. Check your connection, then try again.");

    // Failed import (Shape / default)
    const failedShape = GF.formatScanSummary({ outcome: 'failed', category: 'shape' });
    assert.equal(failedShape.detail, "Couldn't read purchase information from Fanatical. Please try again later.");
  }]
];
