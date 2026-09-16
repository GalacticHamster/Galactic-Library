export const DATABASE_SCHEMA_VERSION = 1;
export const DATABASE_STORAGE_KEY = 'galacticLibraryDatabase';
export const BACKUP_FORMAT = 'galactic-library-backup';
export const BACKUP_VERSION = 1;

export const PROVIDERS = Object.freeze(['steam', 'gog', 'epic', 'audible']);
export const MEDIA_TYPES = Object.freeze(['game', 'game-addon', 'audiobook']);
export const OWNERSHIP_STATES = Object.freeze(['owned', 'claimed', 'subscription', 'unknown']);
