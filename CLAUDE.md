# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Foundry VTT module (`vgbnd-importer`) that imports characters from the Vagabond Tag Along companion web app (vgbnd.app) into Foundry as fully-configured actors in the Vagabond RPG system.

## Build & Deployment

There is **no build step**. The module is pure ES modules loaded directly by Foundry. CSS is built automatically — do not compile it manually or re-read it after edits.

Release is automated via GitHub Actions (`.github/workflows/release.yml`): push to `main` with a bumped version in `module.json` to trigger a release that zips `module.json`, `scripts/`, `styles/`, `templates/`, and `lang/` into `module.zip`.

## Architecture

The module has six source files in `scripts/`:

- **`main.mjs`** — Entry point. Registers the "renderActorDirectory" Foundry hook that injects the "Browse Vagabond Tag Along" button. Stores Firebase tokens in client-only game settings.
- **`firebase.mjs`** (`VgbndFirebase`) — All Firebase Auth and Firestore interaction. Handles sign-in, token refresh, and queries for characters/groups/users from Firestore's typed value format.
- **`mapper.mjs`** (`VgbndMapper`) — Transforms Vagabond character data into a Foundry actor creation payload. Resolves items by case-insensitive name match against these compendium packs: `vagabond.ancestries`, `vagabond.classes`, `vagabond.perks`, `vagabond.spells`, `vagabond.weapons`, `vagabond.armor`, `vagabond.gear`, `vagabond.alchemical-items`, `vagabond.relics`. Returns unresolved item names that had no compendium match.
- **`browser-dialog.mjs`** (`VgbndBrowserDialog`) — Main UI dialog using Foundry v13 `ApplicationV2` + `HandlebarsApplicationMixin`. Two views (login/browser), two tabs (My Characters grid / Groups sidebar). Converts Firestore data to mapper format via `#fromFirestore()`. Falls back to public API if Firebase is unavailable.
- **`unresolved-dialog.mjs`** (`VgbndUnresolvedDialog`) — Shows items with no compendium match after import, with live compendium search and "Create blank" fallback. Returns a `closed` Promise.
- **`spell-dialog.mjs`** — removed; spell import is now handled automatically via `known_spells` from Firestore.

### Import Flow

Login → Browse characters/groups → Select → `VgbndMapper.toActor()` creates actor → `VgbndUnresolvedDialog` for missing items (if any) → done.

`VgbndUnresolvedDialog` is awaited via its `closed` Promise, which blocks bulk group import until each character's unresolved items are handled before the next one starts.

## Foundry API Conventions

- Use `foundry.applications.handlebars.loadTemplates()` (not the deprecated global `loadTemplates()`).
- UI uses `ApplicationV2` + `HandlebarsApplicationMixin` from Foundry v13. See existing dialogs for the pattern.
- Scene tool buttons follow the pattern established in `main.mjs` (hook-based injection).
- `_onFirstRender(context, options)` runs once after first DOM insertion; use it for event listeners and initial DOM setup. `_onRender` runs on every re-render.
- Actions in `DEFAULT_OPTIONS.actions` are declared as `static` methods, but `this` inside them is the **instance** (Foundry rebinds the context at call time).

## `closed` Promise Pattern

`VgbndUnresolvedDialog` exposes a `closed` Promise that resolves when the dialog is dismissed. The pattern: store a resolver in the constructor, override `close()` to call it after `super.close()`. This allows callers to `await dlg.closed` after `dlg.render(true)` without polling.

## Data Flow: Firestore → Mapper

`VgbndFirebase` returns raw Firestore documents (already deserialized from typed values). `VgbndBrowserDialog.#fromFirestore()` normalizes these into the same shape the public vgbnd.app API returns (`{ name, type, img, items[], system{} }`). Both paths converge at `VgbndMapper.toActor(raw)`.

`known_spells` (array of name strings) and `selected_perks` are mapped to `{ name, type }` item entries so the mapper resolves them from compendium packs like any other item. `current_wealth` from Firestore uses short keys `{g, s, c}`; `#fromFirestore()` normalises these to `{gold, silver, copper}`.

Portrait images (base64 from Firestore) are uploaded to `assets/vagabond/portraits/<uuid>.<ext>` via `FilePicker.upload()` before being passed to the mapper.

## Templates & Localization

- Two Handlebars templates in `templates/`: `browser-dialog.hbs`, `unresolved-dialog.hbs`.
- All user-facing strings are in `lang/en.json` under the `VGBND` namespace. Add new keys there; never hardcode UI strings.

## Firebase Integration

- Project: `vagabond-tag-along`. API key is intentionally public (client-side Firebase).
- Auth: Identity Toolkit (password sign-in) + Secure Token API (token refresh).
- Firestore collections: `characters` (by userId), `groups` (by member UID), `users` (display names).
- Deserializing Firestore's typed value format (e.g. `{stringValue: "..."}`) is handled by `fsVal`/`fsFields` in `firebase.mjs`.
- Session is stored as JSON in a `client`-scoped game setting (`firebase-session`); `getToken()` auto-refreshes and clears the session on failure.
