[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/W7W01A1ZN1)

![Foundry v13](https://img.shields.io/badge/foundry-v13%2B-green?style=for-the-badge) ![GitHub Release](https://img.shields.io/github/v/release/mordachai/vagabond-app-importer?display_name=tag&style=for-the-badge&label=Current%20version)

# Vagabond App Importer

Imports characters from [vgbnd.app](https://www.vgbnd.app) directly into Foundry VTT as Vagabond system actors.

**Requirements:**

- Foundry VTT v13+
- [Vagabond system](https://github.com/FoundryVTT-Vagabond/vagabond) installed and active

---

## How to Use

1. Open the **Actors** sidebar tab — click **Import from Vagabond** at the bottom
2. Paste your character URL or UUID into the input field
3. Click **Import**

The module tries a direct fetch first. If the browser blocks it (CORS), the dialog expands with a fallback:

- Click the arrow button to open the character JSON in a new tab
- Select all, copy, paste into the textarea
- Click **Import** again

---

## What Gets Imported

- Stats, health, mana, skills, saves, currency
- All items resolved from the Vagabond compendiums (ancestry, class, perks, equipment)
- Weapons and armor are auto-equipped
- Portrait and token image (falls back to the default mystery-man if none is set)

Items that don't match any compendium entry exactly open a **resolution dialog** where you can search by partial name and add the correct item, or create a blank one to fill in manually.

---

## Spellcasters

If the character's class or ancestry is marked as a spellcaster, you'll be prompted to pick spells from the compendium after import. The dialog shows how many spells the character should have for their level (e.g. `0 / 4`).

> **Note:** The vgbnd.app API does not export spells yet. This is a manual step until that changes.

---

## Installation

Search for **"vagabond app importer"** in Foundry's module browser, or use the manifest URL:

```
https://github.com/mordachai/vagabond-app-importer/releases/latest/download/module.json
```

---

## License

MIT License

---

“Vagabond Importer for Foundry is an independent product published under the Land of the Blind Third-Party License and is not affiliated with Land of the Blind, LLC.

[Vagabond](https://landoftheblind.myshopify.com/) // Pulp Fantasy RPG © 2025 Land of theBlind, LLC.”
