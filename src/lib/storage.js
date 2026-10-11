import { BACKUP_FORMAT, BACKUP_VERSION } from './constants.js';
import { validateDatabase } from './models.js';
import { STORAGE_MESSAGE_TYPE, STORAGE_OPERATIONS } from './storage-protocol.js';

/** Each extension page sends operations to the one service-worker writer. */
export function createStorageClient(sendMessage) {
  return Object.freeze(Object.fromEntries(STORAGE_OPERATIONS.map((operation) => [
    operation,
    async (...args) => {
      const response = await sendMessage({ type: STORAGE_MESSAGE_TYPE, operation, args });
      if (!response?.ok) throw new Error(response?.error ?? 'The library operation did not complete.');
      return response.result;
    }
  ])));
}

const client = createStorageClient((message) => chrome.runtime.sendMessage(message));
export const {
  getDatabase, getCommittedLibraryView, restoreDatabase, replaceProviderItems, mergeProviderItems, clearDatabase, saveOwnershipPolicy,
  saveReadingState,removeReadingState,saveReadingOrder,removeReadingOrder,
  removeCompanionFeed,
  getProviderProfiles,previewProviderProfileRemoval,removeProviderProfile,resetProviderProfileBaseline,selectProviderProfile,renameProviderProfile,cancelProviderScan,saveReminderReview,getReminderNotificationSettings,saveReminderNotificationSettings,
  getGoogleBooksApiKey, saveGoogleBooksApiKey, getGoogleBooksEnrichmentJob,
  saveGoogleBooksEnrichmentJob, clearGoogleBooksEnrichmentJob, startGoogleBooksEnrichmentJob,
  acquireEnrichmentRun, commitEnrichmentBatch, finishEnrichmentRun,
  getAllowedExternalClientIds, saveAllowedExternalClientIds, addAllowedExternalClientId,
  saveManualMatchDecision, savePreferredDisplayTitle, removeManualMatchDecision, saveOpenLibraryEnrichment,
  saveEnrichmentReview, dismissEnrichmentReview, undoEnrichmentSelection,
  applyReviewedEnrichments, dismissEnrichmentReviews, undoEnrichmentSelections,
  separateEdition, undoEditionSeparation, saveTitleAliases,
  saveOwnershipReview,removeOwnershipReview,importPurchaseEvidence,refreshPurchaseEvidence,applyPurchaseEvidence,dismissPurchaseEvidence,
  saveGoogleBooksEnrichments, saveGoogleBooksGenreHints, saveKindleComicContents, reparseKindleContents,
  saveContentReview, removeContentReview,
  getUiPreferences, saveUiPreferences, getShowEnrichmentActions, saveShowEnrichmentActions
} = client;

export function createBackup(database) {
  const validated = validateDatabase(database);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    database: validated
  };
}

export function parseBackup(value) {
  if (!value || typeof value !== 'object' || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION) {
    throw new Error('This is not a Galactic Library backup version 1.');
  }
  return validateDatabase(value.database);
}
