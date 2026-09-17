export const DATABASE_SCHEMA_VERSION = 1;
export const DATABASE_STORAGE_KEY = 'galacticLibraryDatabase';
export const EXTERNAL_CLIENT_IDS_STORAGE_KEY = 'galacticLibraryAllowedExternalClientIds';
export const EXTERNAL_API_VERSION = 1;
export const BACKUP_FORMAT = 'galactic-library-backup';
export const BACKUP_VERSION = 1;

export const PROVIDERS = Object.freeze(['steam', 'gog', 'epic', 'audible', 'kindle', 'amazon-video', 'kobo', 'humble']);
export const MEDIA_TYPES = Object.freeze(['game', 'game-addon', 'audiobook', 'book', 'movie', 'tv']);
export const OWNERSHIP_STATES = Object.freeze(['owned', 'claimed', 'subscription', 'rental', 'unknown']);
