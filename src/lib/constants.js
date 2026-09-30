export const DATABASE_SCHEMA_VERSION = 1;
export const DATABASE_STORAGE_KEY = 'galacticLibraryDatabase';
export const EXTERNAL_CLIENT_IDS_STORAGE_KEY = 'galacticLibraryAllowedExternalClientIds';
export const EXTERNAL_API_VERSION = 1;
export const BACKUP_FORMAT = 'galactic-library-backup';
export const BACKUP_VERSION = 1;
export const GOOGLE_BOOKS_API_KEY_STORAGE_KEY = 'googleBooksApiKey';
export const GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY = 'googleBooksEnrichmentJob';
export const SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY = 'galacticLibraryShowEnrichmentActions';

export const PROVIDERS = Object.freeze(['steam', 'gog', 'epic', 'amazon-games', 'audible', 'kindle', 'amazon-video', 'fandango-at-home', 'kobo', 'fanatical', 'humble']);
export const MEDIA_TYPES = Object.freeze(['game', 'game-addon', 'audiobook', 'book', 'movie', 'tv']);
export const OWNERSHIP_STATES = Object.freeze(['owned', 'claimed', 'subscription', 'rental', 'unknown']);
