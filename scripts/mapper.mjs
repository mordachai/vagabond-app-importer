/**
 * VgbndMapper
 *
 * Converts a Vagabond API response (format=foundry) into a valid
 * Actor.create() payload, resolving all items from system compendiums.
 *
 * Features:
 *  - Compendium lookup by name (case-insensitive)
 *  - Automatic equip of weapons, armor, and focus spells
 *  - Portrait + token image from API `img` field
 *  - Duplicate detection within the same pack (picks first, warns)
 *  - Unresolved item report returned alongside actor data
 */
export class VgbndMapper {

  // ──────────────────────────────────────────────────────────
  //  Compendium config
  // ──────────────────────────────────────────────────────────

  static #SINGLE_PACK = {
    ancestry: "vagabond.ancestries",
    class:    "vagabond.classes",
    perk:     "vagabond.perks",
    spell:    "vagabond.spells",
  };

  // Tried in order for type "equipment"
  static #EQUIPMENT_PACKS = [
    "vagabond.weapons",
    "vagabond.armor",
    "vagabond.gear",
    "vagabond.alchemical-items",
    "vagabond.relics",
  ];

  // equipmentType values that should be auto-equipped on import
  static #AUTO_EQUIP_TYPES = new Set(["weapon", "armor"]);

  // ──────────────────────────────────────────────────────────
  //  Public API
  // ──────────────────────────────────────────────────────────

  /**
   * Convert a raw vgbnd API payload to an Actor creation object.
   *
   * @param {object} raw  Parsed JSON from the API
   * @returns {Promise<{ actorData: object, unresolved: string[] }>}
   *   actorData  → pass directly to Actor.create()
   *   unresolved → array of "Name (type)" strings that had no compendium match
   */
  static async toActor(raw) {
    const unresolved = [];
    const items = await this.#resolveItems(raw.items ?? [], raw.system?.focus?.spellIds ?? [], unresolved);

    const img = raw.img ?? "icons/svg/mystery-man.svg";

    const prototypeToken = { texture: { src: img } };
    if (game.settings.get("vgbnd-importer", "dynamic-token-rings")) {
      const ringColor    = game.user.color?.toString() ?? "#ffffff";
      const subjectScale = game.settings.get("vgbnd-importer", "dtr-subject-scale");
      prototypeToken.ring = {
        enabled: true,
        subject: { texture: raw.subjectTexture ?? img, scale: subjectScale },
        colors:  { ring: ringColor },
      };
    }

    const actorData = {
      name:   raw.name ?? "Unnamed Character",
      type:   raw.type ?? "character",
      img,
      prototypeToken,
      system: this.#mapSystem(raw.system ?? {}),
      items,
    };

    return { actorData, unresolved };
  }

  // ──────────────────────────────────────────────────────────
  //  Item resolution
  // ──────────────────────────────────────────────────────────

  static async #resolveItems(apiItems, focusSpellIds, unresolved) {
    const resolved = [];

    for (const apiItem of apiItems) {
      const doc = await this.#lookupItem(apiItem);

      if (doc) {
        const itemData = doc.toObject();
        this.#applyOverrides(itemData, apiItem, focusSpellIds);
        resolved.push(itemData);
      } else {
        unresolved.push({ name: apiItem.name, type: apiItem.type, system: apiItem.system });
        console.warn(`vgbnd-importer | "${apiItem.name}" (${apiItem.type}) — no compendium match, skipping.`);
        // We intentionally do NOT push a fallback item — unresolved are reported to the GM
      }
    }

    return resolved;
  }

  /**
   * Look up an item across the relevant packs.
   * Returns the first match. Warns if a pack contains duplicates.
   */
  static async #lookupItem(apiItem) {
    const name = apiItem.name?.trim().toLowerCase();
    if (!name) return null;

    const packIds = this.#packsForType(apiItem.type);

    for (const packId of packIds) {
      const pack = game.packs.get(packId);
      if (!pack) {
        console.warn(`vgbnd-importer | Pack not found: ${packId}`);
        continue;
      }

      await pack.getIndex();

      const matches = pack.index.filter(e => e.name.trim().toLowerCase() === name);

      if (matches.length === 0) continue;

      if (matches.length > 1) {
        console.warn(
          `vgbnd-importer | "${apiItem.name}" has ${matches.length} entries in ${packId} — using the first one.`
        );
      }

      return await pack.getDocument(matches[0]._id);
    }

    return null;
  }

  static #packsForType(type) {
    if (type in this.#SINGLE_PACK) return [this.#SINGLE_PACK[type]];
    if (type === "equipment")      return this.#EQUIPMENT_PACKS;
    return [...Object.values(this.#SINGLE_PACK), ...this.#EQUIPMENT_PACKS];
  }

  /**
   * Partial case-insensitive search across all relevant packs for a given type.
   * @param {string} query
   * @param {string} type  Vagabond item type
   * @returns {Promise<Array<{name:string, packId:string, packLabel:string, id:string}>>}
   */
  static async searchByName(query, type) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    const results = [];
    const seen = new Set();

    for (const packId of this.#packsForType(type)) {
      const pack = game.packs.get(packId);
      if (!pack) continue;
      await pack.getIndex();

      for (const entry of pack.index) {
        const haystack = entry.name.trim().toLowerCase();
        const words = needle.split(/\W+/).filter(Boolean);
        const matches = haystack.includes(needle)
          || needle.includes(haystack)
          || words.every(w => haystack.includes(w));
        if (!matches) continue;
        const key = `${packId}:${entry._id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ name: entry.name, packId, packLabel: pack.metadata.label, id: entry._id });
      }
    }

    return results;
  }

  // ──────────────────────────────────────────────────────────
  //  System data
  // ──────────────────────────────────────────────────────────

  // The API already sends system data in Foundry format via ?format=foundry,
  // so we pass it through directly. Foundry fills in any missing fields with defaults.
  static #mapSystem(apiSystem) {
    foundry.utils.setProperty(apiSystem, "details.builderDismissed", true);
    return apiSystem;
  }

  // ──────────────────────────────────────────────────────────
  //  Overrides applied on top of the compendium clone
  // ──────────────────────────────────────────────────────────

  static #applyOverrides(itemData, apiItem, focusSpellIds) {
    const sys = itemData.system ?? {};

    // ── Quantity ───────────────────────────────────────────
    if (apiItem.system?.quantity !== undefined) {
      foundry.utils.setProperty(itemData, "system.quantity", apiItem.system.quantity);
    }

    // ── Equip: honour explicit flag from source data, fall back to type heuristic ──
    if (apiItem.type === "equipment") {
      const shouldEquip = apiItem.system?.equipped
        ?? this.#AUTO_EQUIP_TYPES.has(sys.equipmentType ?? "");
      if (shouldEquip) foundry.utils.setProperty(itemData, "system.equipped", true);
    }

    // ── Spells: favorite so they appear on the front of the sheet ──────────────
    if (apiItem.type === "spell") {
      foundry.utils.setProperty(itemData, "system.favorite", true);
    }

    // ── Auto-equip focus spells ────────────────────────────────────────────────
    if (apiItem.type === "spell" && focusSpellIds.includes(apiItem.id)) {
      foundry.utils.setProperty(itemData, "system.focus", true);
    }
  }
}
