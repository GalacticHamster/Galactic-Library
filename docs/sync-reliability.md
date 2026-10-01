# Provider profiles and scan ordering

Every importer asks for a local account/profile label and confirmation that it matches the signed-in website account. Labels are user declarations, not automatic account detection. Do not use the same label for different website accounts. No account cookies or authentication tokens are retained.

The first scan for a label establishes a full baseline. A different label requires a full rescan and the explicit profile-switch checkbox. A failed scan keeps the prior active library. A successful switch archives the old profile's records, preserving their original observation dates and enrichment. Old profile records do not participate in current ownership matching. Reviews that reference the replaced records are removed to prevent native IDs shared between accounts from carrying confirmations into another account; review relationships again after switching.

The worker persists a per-provider scan token, bound to the importing tab. Only the latest token can commit. Newer scans, clear, restore, and direct provider replacement invalidate pending scans. Independent providers can scan concurrently. Short reads and mutations use the existing writer queue; network scanning happens outside it. Tokens survive worker restart, but are excluded from backups and the companion API.

An incremental scan can promote itself to a validated full scan when a provider needs it (for example, an old Amazon Games baseline). A required full scan cannot be downgraded to incremental. Fandango carries the profile context through its tab-local navigation workflow.

Already-open pages running an older importer can import only while the provider remains unassigned. Once a profile is established they must reload and use the confirmed scan protocol. Labels cannot detect switching website accounts while retaining the same declared label: re-check the signed-in account before each import.
