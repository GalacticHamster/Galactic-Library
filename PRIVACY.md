# Privacy policy

Galactic Library stores its library database locally in the current Chrome profile. It has no developer-operated server, analytics, advertising, affiliate links, account system, or cloud synchronization.

The Steam importer reads game and DLC IDs, titles, and DLC parent App IDs only after the user selects **Sync Steam library** on Steam Store while signed in. It reads the account's owned App IDs, then sends those IDs to Steam's own StoreBrowse title service to resolve entries Steam identifies as games or DLC. It does not ask for, copy, or store a Steam password, cookie, or Web API key. Future provider importers will follow the same signed-in, user-initiated model. Backups are created only when the user explicitly selects Export and are restored only when the user explicitly selects a file.

Stored data will include provider item identifiers, titles, ownership state, provider metadata necessary for the library, sync timestamps, and user match decisions. Data remains until the user clears it, restores another backup, or uninstalls the extension.
