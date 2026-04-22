import { VgbndFirebase } from "./firebase.mjs";

export class VgbndSync {

  static async syncActor(actor) {
    const firestoreId = actor.getFlag("vgbnd-importer", "firestoreId");
    if (!firestoreId) {
      ui.notifications.warn(game.i18n.localize("VGBND.SyncNotImported"));
      return;
    }

    const tok = await VgbndFirebase.getToken();
    if (!tok) {
      ui.notifications.warn(game.i18n.localize("VGBND.SyncNotSignedIn"));
      return;
    }

    let existingDoc;
    try {
      existingDoc = await VgbndFirebase.getCharacter(tok.idToken, firestoreId);
    } catch (err) {
      ui.notifications.error(game.i18n.format("VGBND.SyncErrorFetch", { error: err.message }));
      return;
    }

    const fields = VgbndSync.#toFirestoreFields(actor, existingDoc);

    try {
      await VgbndFirebase.patchCharacter(tok.idToken, firestoreId, fields);
      ui.notifications.info(game.i18n.format("VGBND.SyncSuccess", { name: actor.name }));
    } catch (err) {
      ui.notifications.error(game.i18n.format("VGBND.SyncError", { error: err.message }));
    }
  }

  // ── Build Firestore fields object ────────────────────────────────────────────

  static #toFirestoreFields(actor, existingDoc) {
    const sys = actor.system;
    const fields = {};

    // Simple integer fields
    fields.level       = { integerValue: String(sys.attributes?.level?.value ?? 1) };
    fields.xp          = { integerValue: String(sys.attributes?.xp ?? 0) };
    fields.current_hp  = { integerValue: String(sys.health?.value ?? 0) };
    fields.current_luck = { integerValue: String(sys.currentLuck ?? 0) };
    if (sys.mana?.current != null) {
      fields.current_mana = { integerValue: String(sys.mana.current) };
    }

    // Stats
    const statFields = {};
    for (const stat of ["might", "dexterity", "awareness", "reason", "presence", "luck"]) {
      const val = sys.stats?.[stat]?.value;
      if (val != null) statFields[stat] = { integerValue: String(val) };
    }
    if (Object.keys(statFields).length) {
      fields.assignedStats = { mapValue: { fields: statFields } };
    }

    // Wealth
    const cur = sys.currency ?? {};
    if (cur.gold != null || cur.silver != null || cur.copper != null) {
      fields.current_wealth = { mapValue: { fields: {
        g: { integerValue: String(cur.gold   ?? 0) },
        s: { integerValue: String(cur.silver ?? 0) },
        c: { integerValue: String(cur.copper ?? 0) },
      }}};
    }

    // Known spells
    const spellNames = actor.items
      .filter(i => i.type === "spell")
      .map(i => ({ stringValue: i.name }));
    fields.known_spells = { arrayValue: { values: spellNames } };

    // Inventory — merge with existing Firestore doc to preserve item metadata
    fields.inventory = { arrayValue: { values: VgbndSync.#mergeInventory(actor, existingDoc) } };

    // Perks — merge using stored firestoreData flag, fallback to minimal entry
    fields.selected_perks = { arrayValue: { values: VgbndSync.#mergePerks(actor) } };

    // Trained skills
    const skillValues = Object.entries(sys.skills ?? {})
      .filter(([, v]) => v.trained)
      .map(([name]) => ({ stringValue: VgbndSync.#titleCase(name) }));
    fields.trained_skills = { arrayValue: { values: skillValues } };

    return fields;
  }

  // ── Inventory merge ──────────────────────────────────────────────────────────

  static #mergeInventory(actor, existingDoc) {
    const fsItems = existingDoc.inventory ?? [];
    const fsMap = new Map(fsItems.map(item => [item.name?.toLowerCase(), item]));

    const foundryItems = actor.items.filter(i => i.type === "equipment");
    const seen = new Set();
    const result = [];

    for (const fItem of foundryItems) {
      const key = fItem.name.toLowerCase();
      seen.add(key);
      const existing = fsMap.get(key);

      if (existing) {
        // Update only quantity and is_equipped, preserve all other Firestore fields
        const merged = foundry.utils.deepClone(existing);
        merged.quantity   = fItem.system?.quantity ?? existing.quantity ?? 1;
        merged.is_equipped = fItem.system?.equipped ?? existing.is_equipped ?? false;
        result.push(VgbndSync.#toFsMap(merged));
      } else {
        // New item added in Foundry — minimal entry
        result.push(VgbndSync.#toFsMap({
          id:         foundry.utils.randomID(),
          name:       fItem.name,
          type:       "Gear",
          category:   "Gear",
          quantity:   fItem.system?.quantity ?? 1,
          is_equipped: fItem.system?.equipped ?? false,
          slots:      1,
          notes:      "",
        }));
      }
    }

    return result;
  }

  // ── Perk merge ───────────────────────────────────────────────────────────────

  static #mergePerks(actor) {
    return actor.items
      .filter(i => i.type === "perk")
      .map(item => {
        const stored = item.getFlag("vgbnd-importer", "firestoreData");
        if (stored) return VgbndSync.#toFsMap(stored);
        // Perk added in Foundry after import — minimal entry
        return VgbndSync.#toFsMap({
          id:     item.name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, ""),
          name:   item.name,
          source: "foundry",
          prereqs: {},
        });
      });
  }

  // ── Firestore serialiser ─────────────────────────────────────────────────────

  static #toFsMap(obj) {
    return { mapValue: { fields: VgbndSync.#toFsFields(obj) } };
  }

  static #toFsFields(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = VgbndSync.#toFsValue(v);
    }
    return out;
  }

  static #toFsValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean")        return { booleanValue: v };
    if (typeof v === "number")         return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === "string")         return { stringValue: v };
    if (Array.isArray(v))              return { arrayValue: { values: v.map(i => VgbndSync.#toFsValue(i)) } };
    if (typeof v === "object")         return { mapValue: { fields: VgbndSync.#toFsFields(v) } };
    return { stringValue: String(v) };
  }

  static #titleCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
