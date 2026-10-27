# Chrome Web Store assets

The five screenshots in `screenshots/` are 1280x800 images prepared for the
Chrome Web Store listing:

- `00-galactic-library-promo.jpg` — Galactic Library promotional overview banner
  with logo and feature highlights.
- `01-library.jpg` — Combined library view with multi-provider items, media
  filters, search, and ownership cards.
- `02-providers.jpg` — Connected digital storefront providers, import controls,
  and account management.
- `03-comic-coverage.jpg` — Comic Coverage workbench showing issue coverage,
  collection overlap, and publication resolution.
- `04-kindle.jpg` — Kindle contents discovery, book chapter acquisition, and
  captured evidence inspection.

`promo/small-promo-tile-440x280.jpg` is the required 440x280 small promo tile.
It is a faithful crop-and-scale of `promo/galactic-library-promo.jpg`.

These are store listing assets, not extension runtime files. Upload them
separately in the Chrome Web Store dashboard; `scripts/package-release.mjs`
deliberately excludes this directory from the distributed extension ZIP.
