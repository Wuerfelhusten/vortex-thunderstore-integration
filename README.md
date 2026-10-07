# Vortex Thunderstore Integration

Browse and install Thunderstore packages through Vortex, with downloads and mod management handled by Vortex rather than the Thunderstore Mod Manager.

## Features

- Browse packages and modpacks with search, sorting, pagination, and installed-state indicators.
- Keep Thunderstore identities and metadata separate from Nexus Mods IDs.
- Check Thunderstore updates through Vortex's normal update actions.
- Resolve dependencies and validate download URLs and archive paths.
- Use explicit game mappings and installation adapters rather than guessing from game names.

Mappings are maintained in [`data/catalog.json`](data/catalog.json). Only games available on both Nexus Mods and Thunderstore are in scope. Catalog inclusion is not a guarantee of end-to-end testing for every game or package layout. Valheim is the primary reference game; other games require additional testing.

This is an independent integration, not an official Nexus Mods or Thunderstore product.

## Installation

1. Download the extension ZIP asset from GitHub Releases, not the automatic source-code ZIP.
2. Install it using the extension installation area on Vortex's Extensions page.
3. Restart Vortex, manage a supported game, and open **Browse Thunderstore**.

Allow Vortex to install the game's own extension when prompted. This integration does not replace game-specific extensions or their loader handling. Normal use does not require a Nexus API key.

## Release status

The package version is `1.1.0`. See the [changelog](CHANGELOG.md) for changes since 1.0.0. Release archives are built locally; do not silently replace an existing release.

Automated tests do not replace testing inside Vortex. The latest update-event and download fixes still need runtime verification. Packages incorrectly laid out by an older build require reinstallation after upgrading; existing staging folders are not automatically rewritten.

## Development

Use Node.js 22 and npm. The committed `.npmrc` enables the peer-dependency compatibility setting required by the Vortex API development dependency.

```sh
npm ci
npm run verify
```

Verification runs type checking, tests, and a build. Output goes to `dist/`; React and the Vortex API are supplied by Vortex at runtime. Tests and builds require no API credentials.

### Source layout

- `src/index.ts`: extension entry point.
- `src/vortex/`: host registrations, package lookup, downloads, installation, mod actions, and update events. Only this integration layer and the UI depend on Vortex's runtime API.
- `src/ui/`: browse page orchestration, toolbar, package cards, pagination, and independently testable search/sort/presentation helpers.
- Other `src/*.ts` modules: API transport, catalog, identities, dependencies, metadata, archive validation, installation layouts, and version comparison.
- `tests/`: core and transport tests, archive/CDN regressions, browse tests, and Vortex event tests using a host double. `vitest.config.mts` maps the type-only Vortex API package to that test double; production builds still use Vortex's real API.

The unconnected operation coordinator and Nexus lookup module were removed. The tested context validation helpers remain, but are not currently wired into installation; they do not imply runtime profile-change protection.

### Optional catalog discovery

Copy `.env.example` to `.env`, set your own `NEXUS_API_KEY`, then run:

```sh
npm run sync:nexus-games
npm run sync:catalog
```

These commands query external services and generate discovery snapshots in `data/`. They do not automatically qualify installation support or replace the runtime `data/catalog.json`. Review IDs, adapters, and capabilities before changing the runtime catalog. Raw snapshots and `.env` are excluded from Git. Never publish API keys or unredacted logs.

## Packaging

On Windows, after verification:

```sh
npm run package:release
```

This rebuilds and exports an allowlisted ZIP with a SHA-256 checksum into `release/`, without overwriting prior exports. It does not upload, publish, tag, or install anything. GitHub Actions verifies builds and attaches workflow artifacts only. Before publishing, choose a new version for unreleased changes, update both package manifests and the changelog, test the ZIP in Vortex, and provide the matching source and build scripts with the release.

## Bug reports

Include Vortex and extension versions, game ID, package namespace/name/version, reproduction steps, and a redacted log excerpt. For layout issues, include relative archive paths and expected deployment paths. Do not attach `.env` or account credentials.

## Licensing

The project's original source code is licensed under the [GNU General Public License v3.0](LICENSE) (SPDX: `GPL-3.0-only`). Thunderstore branding and third-party dependencies remain subject to their owners' rights and licenses; no ownership or relicensing of those assets is claimed.
