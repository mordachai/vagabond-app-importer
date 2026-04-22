# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Foundry VTT module (`vgbnd-importer`) that imports characters from the Vagabond Tag Along companion web app (vgbnd.app) into Foundry as fully-configured actors in the Vagabond RPG system, and syncs character state back to VTA after play.

## Build & Deployment

There is **no build step**. The module is pure ES modules loaded directly by Foundry. CSS is built automatically — do not compile it manually or re-read it after edits.

Release is automated via GitHub Actions (`.github/workflows/release.yml`): push to `main` with a bumped version in `module.json` to trigger a release that zips `module.json`, `scripts/`, `styles/`, `templates/`, and `lang/` into `module.zip`.

## Architecture

The module has seven source files in `scripts/`:

- **`main.mjs`** — Entry point. Registers hooks for the "Browse Vagabond Tag Along" and "Sync to VTA" buttons in the Actors sidebar footer. Stores Firebase tokens in client-only game settings.
- **`firebase.mjs`** (`VgbndFirebase`) — All Firebase Auth and Firestore interaction. Handles sign-in, token refresh, queries for characters/groups/users, and `patchCharacter()` for writing back to Firestore.
- **`mapper.mjs`** (`VgbndMapper`) — Transforms Vagabond character data into a Foundry actor creation payload. Resolves items by case-insensitive name match against these compendium packs: `vagabond.ancestries`, `vagabond.classes`, `vagabond.perks`, `vagabond.spells`, `vagabond.weapons`, `vagabond.armor`, `vagabond.gear`, `vagabond.alchemical-items`, `vagabond.relics`. Returns unresolved item names that had no compendium match.
- **`browser-dialog.mjs`** (`VgbndBrowserDialog`) — Main UI dialog using Foundry v13 `ApplicationV2` + `HandlebarsApplicationMixin`. Two views (login/browser), two tabs (My Characters grid / Groups sidebar). Converts Firestore data to mapper format via `#fromFirestore()`. Falls back to public API if Firebase is unavailable.
- **`unresolved-dialog.mjs`** (`VgbndUnresolvedDialog`) — Shows items with no compendium match after import, with live compendium search and "Create blank" fallback. Returns a `closed` Promise.
- **`sync.mjs`** (`VgbndSync`) — Syncs a Foundry actor back to VTA via Firestore PATCH. See Sync Flow below.
- **`spell-dialog.mjs`** — removed; spell import is now handled automatically via `known_spells` from Firestore.

### Import Flow

Login → Browse characters/groups → Select → `VgbndMapper.toActor()` creates actor → store `firestoreId` flag + perk `firestoreData` flags → `VgbndUnresolvedDialog` for missing items (if any) → done.

`VgbndUnresolvedDialog` is awaited via its `closed` Promise, which blocks bulk group import until each character's unresolved items are handled before the next one starts.

### Sync Flow

"Sync to VTA" button in the Actors sidebar syncs **all actors in the world that have a `firestoreId` flag** (i.e. were imported via this module). For each actor: fetch current Firestore doc → build updated fields via `VgbndSync.toFirestoreFields()` → PATCH only the changed fields.

Fields synced: `level`, `xp`, `current_hp`, `current_mana`, `current_luck`, `assignedStats`, `current_wealth`, `known_spells`, `inventory`, `selected_perks`, `trained_skills`.

**Inventory merge:** existing Firestore items matched by name; only `quantity` and `is_equipped` updated; all other Firestore metadata (damage, properties, item id, etc.) preserved. Items added in Foundry appended as minimal entries. Items removed in Foundry are dropped.

**Perk merge:** at import time, the full Firestore perk object (`id`, `source`, `prereqs`, `modifiers`) is stored as `flags.vgbnd-importer.firestoreData` on each perk item. Sync reads this flag back to reconstruct the rich Firestore structure. Perks added in Foundry after import (no flag) are written as minimal `{id, name, source:"foundry"}` entries.

**Conditions** are not synced — VTA does not store conditions in Firestore.

**Creating new Firestore documents from Foundry is not possible** — VTA's Firestore security rules block creating documents outside the VTA app itself. Only updating existing (imported) characters works.

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
- Serializing back to Firestore typed format is handled by `VgbndSync.#toFsValue()` in `sync.mjs`.
- Session is stored as JSON in a `client`-scoped game setting (`firebase-session`); `getToken()` auto-refreshes and clears the session on failure.
- Security rules allow reading and PATCHing documents where `userId == auth.uid`. Creating new documents from outside the VTA app is blocked.

## Actor Flags (`vgbnd-importer`)

| Flag | Set on | Purpose |
| --- | --- | --- |
| `firestoreId` | Actor | Firestore document ID of the source VTA character. Required for sync. |
| `firestoreData` | Perk items | Full Firestore perk object at import time. Used by sync to reconstruct rich perk structure. |
