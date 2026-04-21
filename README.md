[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/W7W01A1ZN1)

![Foundry v13](https://img.shields.io/badge/foundry-v13%2B-green?style=for-the-badge) ![GitHub Release](https://img.shields.io/github/v/release/mordachai/vagabond-app-importer?display_name=tag&style=for-the-badge&label=Current%20version)

# Vagabond App Importer

<img width="1000" height="528" alt="CopyQ MHOecn" src="https://github.com/user-attachments/assets/46ad4ce3-d642-448a-8fe1-4e1b5501ed3d" />

### Imports characters from **Vagabond Tag Along** (https://www.vgbnd.app) directly into Foundry VTT as Vagabond system actors.

---

## How to Use (video below):

https://github.com/user-attachments/assets/9aef8c9a-0660-45e9-8fd5-b5bbda862604

1. Open the **Actors** sidebar tab — click **Browse Vagabond Tag Along** at the bottom
2. Sign in with your [Vagabond Tag Along](https://www.vgbnd.app) account (email + password)
3. Your characters appear in the **My Characters** tab — click **Import** next to any character

### Group Import

Switch to the **Group** tab to see groups you belong to. Select a group to browse all member characters and import them individually. GMs get an **Import All** button to pull in every character in the group at once.

---

## What Gets Imported

- Stats, health, mana, skills, saves, spells, currency...
- All items resolved from the Vagabond compendiums (ancestry, class, perks, equipment)
- Weapons, spells, items and armor are auto-equipped

Items that don't match any compendium entry exactly open a **resolution dialog** where you can search by partial name and add the correct item, or create a blank one to fill in manually.

---

**Requirements:**

- Foundry VTT v13+
- [Vagabond system](https://github.com/FoundryVTT-Vagabond/vagabond) installed and active

## Installation

Search for **"vagabond app importer"** in Foundry's module browser, or use the manifest URL:

```
https://raw.githubusercontent.com/mordachai/vagabond-app-importer/main/module.json
```

---

## Acknowledgment

This module exists because of **lzrface** (Discord: `lzrface8855`), who built [Vagabond Tag Along](https://www.vgbnd.app/) — the companion app that manages your Vagabond characters and exposes the API this importer talks to. Without his work there would be nothing to import. Go check out the app.

---

## License

MIT License

---

“Vagabond Importer for Foundry is an independent product published under the Land of the Blind Third-Party License and is not affiliated with Land of the Blind, LLC.

[Vagabond](https://landoftheblind.myshopify.com/) // Pulp Fantasy RPG © 2025 Land of theBlind, LLC.”
