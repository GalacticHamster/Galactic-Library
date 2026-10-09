# UI text encoding

Write source and documentation as UTF-8. Prefer ASCII for navigation, buttons, controls and statuses. Do not add decorative Unicode without explicitly checking its bytes and browser rendering. Never use question marks or replacement glyphs as fallback separators. Preserve Unicode library titles, authors and user input.

When shell scripts author files, verify file-read encoding and pipeline encoding as well as file-write encoding: an ASCII pipeline can replace Unicode before a UTF-8 writer sees it, and an implicit legacy Windows read encoding can produce mojibake. Prefer ASCII literals or explicit Unicode escapes in automated edits. The package builders normalize line endings; they do not translate labels. Test source and actual package bytes with fatal UTF-8 decoding, known replacement/mojibake checks and narrow damaged-navigation patterns. Ordinary questions in prose are allowed.

Purchase-sharing repair checks live in tests/purchase-repair.test.mjs and the native purchase-sharing browser script. They supplement each repository's normal suites and packaging checks.
