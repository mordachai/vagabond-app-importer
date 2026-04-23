const SKILL_PDF_MAP = {
  arcana:      { dc: "Arcana Skill Difficulty",        trained: "Arcana Trained" },
  brawl:       { dc: "Brawn Skill Difficulty",         trained: "Brawn Trained" },
  craft:       { dc: "Craft Skill Difficulty",         trained: "Craft Trained" },
  detect:      { dc: "Detect Skill Difficulty",        trained: "Detect Trained" },
  finesse:     { dc: "Finesse Skill Difficulty",       trained: "Finesse Trained" },
  influence:   { dc: "Influence Skill Difficulty",     trained: "Influence Trained" },
  leadership:  { dc: "Leadership Skill Difficulty",    trained: "Leadership Trained" },
  medicine:    { dc: "Medicine Skill Difficulty",      trained: "Medicine Trained" },
  melee:       { dc: "Melee Attack Check Difficulty",  trained: "Melee Weapons Trained" },
  mysticism:   { dc: "Mysticism Skill Difficulty",     trained: "Mysticism Trained" },
  performance: { dc: "Performance Skill Difficulty",   trained: "Performance Trained" },
  ranged:      { dc: "Ranged Attack Difficulty",       trained: "Ranged Weapons Trained" },
  sneak:       { dc: "Sneak Skill Difficulty",         trained: "Sneak Trained" },
  survival:    { dc: "Survival Skill Difficulty",      trained: "Survival Trained" },
};

const STAT_PDF_MAP = {
  awareness: "AWR",
  dexterity: "DEX",
  reason:    "LOG",
  luck:      "LUK",
  might:     "MIT",
  presence:  "PRS",
};

function _setText(form, fieldName, value) {
  try { form.getTextField(fieldName).setText(_sanitizeWinAnsi(String(value ?? ""))); }
  catch { /* field not found */ }
}

function _setCheck(form, fieldName, checked) {
  try { const f = form.getCheckBox(fieldName); if (checked) f.check(); else f.uncheck(); }
  catch { /* field not found */ }
}

function _setDropdown(form, fieldName, value) {
  try { form.getDropdown(fieldName).select(value); }
  catch { /* field not found */ }
}

function _stripHtml(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
  return div.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

const _TRANSLIT = {
  "Ā":"A","ā":"a","Ă":"A","ă":"a","Ą":"A","ą":"a",
  "Ć":"C","ć":"c","Ĉ":"C","ĉ":"c","Ċ":"C","ċ":"c",
  "Č":"C","č":"c","Ď":"D","ď":"d","Đ":"D","đ":"d",
  "Ē":"E","ē":"e","Ĕ":"E","ĕ":"e","Ė":"E","ė":"e",
  "Ę":"E","ę":"e","Ě":"E","ě":"e","Ĝ":"G","ĝ":"g",
  "Ğ":"G","ğ":"g","Ġ":"G","ġ":"g","Ģ":"G","ģ":"g",
  "Ĥ":"H","ĥ":"h","Ħ":"H","ħ":"h","Ĩ":"I","ĩ":"i",
  "Ī":"I","ī":"i","Ĭ":"I","ĭ":"i","Į":"I","į":"i",
  "İ":"I","ı":"i","Ĵ":"J","ĵ":"j","Ķ":"K","ķ":"k",
  "Ĺ":"L","ĺ":"l","Ļ":"L","ļ":"l","Ľ":"L","ľ":"l",
  "Ł":"L","ł":"l",
  "Ń":"N","ń":"n","Ņ":"N","ņ":"n","Ň":"N","ň":"n",
  "Ō":"O","ō":"o","Ŏ":"O","ŏ":"o","Ő":"O","ő":"o",
  "Œ":"OE","œ":"oe",
  "Ŕ":"R","ŕ":"r","Ŗ":"R","ŗ":"r","Ř":"R","ř":"r",
  "Ś":"S","ś":"s","Ŝ":"S","ŝ":"s","Ş":"S","ş":"s",
  "Š":"S","š":"s","Ţ":"T","ţ":"t","Ť":"T","ť":"t",
  "Ŧ":"T","ŧ":"t","Ũ":"U","ũ":"u","Ū":"U","ū":"u",
  "Ŭ":"U","ŭ":"u","Ů":"U","ů":"u","Ű":"U","ű":"u",
  "Ų":"U","ų":"u","Ŵ":"W","ŵ":"w","Ŷ":"Y","ŷ":"y",
  "Ÿ":"Y","Ź":"Z","ź":"z","Ż":"Z","ż":"z","Ž":"Z",
  "ž":"z",
  "–":"-","—":"--","‘":"'","’":"'","‚":"'",
  "“":'"',"”":'"',"„":'"',"…":"...","′":"'","″":'"',
};

function _sanitizeWinAnsi(str) {
  let result = "";
  let dropped = false;
  for (const ch of str) {
    if (_TRANSLIT[ch] !== undefined) {
      result += _TRANSLIT[ch];
    } else if (ch.codePointAt(0) <= 0xFF) {
      result += ch;
    } else {
      dropped = true;
    }
  }
  if (dropped) console.warn("[VGBND Export] Some characters could not be encoded for PDF and were removed.");
  return result;
}

let _pdfLibPromise = null;
async function _getPdfLib() {
  if (typeof PDFLib !== "undefined") return PDFLib;
  _pdfLibPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "modules/vgbnd-importer/scripts/lib/pdf-lib.min.js";
    script.onload  = () => resolve(PDFLib);
    script.onerror = () => reject(new Error("Failed to load pdf-lib"));
    document.head.appendChild(script);
  });
  return _pdfLibPromise;
}

export async function exportActorToPdf(actor) {
  if (!actor || actor.type !== "character") {
    ui.notifications.warn(game.i18n.localize("VGBND.ExportErrorNotCharacter"));
    return;
  }

  ui.notifications.info(game.i18n.format("VGBND.ExportStarting", { name: actor.name }));

  try {
    const PDFLib = await _getPdfLib();
    if (!PDFLib) throw new Error("pdf-lib could not be loaded");

    const choice = game.settings.get("vgbnd-importer", "export-template");
    const templateUrl = `modules/vgbnd-importer/pdf/vagabond-hero-record-${choice}.pdf`;

    const response = await fetch(templateUrl);
    if (!response.ok) throw new Error(`Failed to load PDF template: ${response.status}`);
    const pdfDoc = await PDFLib.PDFDocument.load(await response.arrayBuffer());
    const form = pdfDoc.getForm();
    const sys = actor.system;

    // Character Info
    _setText(form, "Name", actor.name);
    _setText(form, "Level", sys.attributes?.level?.value ?? 0);
    _setText(form, "XP", sys.attributes?.xp ?? 0);

    const ancestryItem = actor.items.find(i => i.type === "ancestry");
    const classItem    = actor.items.find(i => i.type === "class");
    _setText(form, "Ancestry", ancestryItem?.name ?? "");
    _setText(form, "Class",    classItem?.name ?? "");

    const beingType = sys.ancestryData?.beingType ?? ancestryItem?.system?.ancestryType ?? "Humanlike";
    const size      = sys.ancestryData?.size      ?? ancestryItem?.system?.size          ?? "medium";
    const sizeMap   = { tiny: "T", small: "S", medium: "M", large: "L", huge: "H", gargantuan: "G" };
    _setDropdown(form, "Being Type", beingType);
    _setDropdown(form, "Size", sizeMap[size] ?? "M");

    // Stats
    for (const [statKey, pdfField] of Object.entries(STAT_PDF_MAP)) {
      const val = sys.stats?.[statKey]?.total ?? sys.stats?.[statKey]?.value ?? 0;
      _setText(form, pdfField, val);
    }

    // HP / Mana / Luck / Fatigue
    _setText(form, "Max HP",          sys.health?.max ?? "");
    _setText(form, "Current HP",      sys.health?.value ?? "");
    _setText(form, "Max Mana",        sys.mana?.max || "");
    _setText(form, "Current Mana",    sys.mana?.current || "");
    _setText(form, "Current Luck",    sys.currentLuck ?? "");
    _setText(form, "Fatigue",         sys.fatigue ?? 0);
    _setText(form, "Casting Maximum", sys.mana?.castingMax || "");

    // Combat
    _setText(form, "Armor Rating", sys.armor ?? "");
    _setText(form, "Endure Save Difficulty", sys.saves?.endure?.difficulty ?? "");
    _setText(form, "Reflex Save Difficulty", sys.saves?.reflex?.difficulty ?? "");
    _setText(form, "Will Save Difficulty",   sys.saves?.will?.difficulty   ?? "");

    // Skills
    for (const [skillKey, info] of Object.entries(SKILL_PDF_MAP)) {
      const skill = sys.skills?.[skillKey];
      _setText(form,  info.dc,      skill?.difficulty ?? "");
      _setCheck(form, info.trained, skill?.trained    ?? false);
    }

    // Speed
    _setText(form, "Speed",        sys.speed?.base   ?? "");
    _setText(form, "Speed Bonus",  "");
    _setText(form, "Crawl Speed",  sys.speed?.crawl  ?? "");
    _setText(form, "Travel Speed", sys.speed?.travel ?? "");

    // Wealth
    _setText(form, "Wealth (g)", sys.currency?.gold   ?? "");
    _setText(form, "Wealth (s)", sys.currency?.silver ?? "");
    _setText(form, "Wealth (c)", sys.currency?.copper ?? "");

    // Weapons (up to 3 equipped)
    const equippedWeapons = actor.items.filter(
      i => i.type === "equipment" && i.system?.equipmentType === "weapon" && i.system?.equipped
    );
    for (let w = 0; w < 3; w++) {
      const idx    = w + 1;
      const weapon = equippedWeapons[w];
      if (weapon) {
        _setText(form, `Weapon ${idx}`, weapon.name);
        const isTwoHand = weapon.system.equipmentState === "twoHands";
        const dmg       = isTwoHand ? weapon.system.damageTwoHands : weapon.system.damageOneHand;
        _setText(form, `Weapon Damage ${idx}`, dmg || "");
        const props = Array.isArray(weapon.system.properties) ? weapon.system.properties.join(", ") : "";
        _setText(form, `Weapon Properties ${idx}`, props);
        _setDropdown(form, `Grip ${idx}`, isTwoHand ? "2H" : "1H");
      } else {
        _setText(form,     `Weapon ${idx}`, "");
        _setText(form,     `Weapon Damage ${idx}`, "");
        _setText(form,     `Weapon Properties ${idx}`, "");
        _setDropdown(form, `Grip ${idx}`, "F");
      }
    }

    // Inventory (stacked — duplicates merged into "Name x N"; weapons excluded, they have their own section)
    const equipment = actor.items.filter(i => i.type === "equipment" && i.system?.equipmentType !== "weapon");
    const groupMap  = new Map();
    for (const item of equipment) {
      const bs  = item.system?.baseSlots;
      const key = `${item.name}::${bs ?? ""}`;
      let g = groupMap.get(key);
      if (!g) {
        g = { name: item.name, baseSlots: bs, total: 0, anyEquipped: false };
        groupMap.set(key, g);
      }
      const qty = Number(item.system?.quantity ?? 1);
      g.total += Number.isFinite(qty) ? qty : 1;
      if (item.system?.equipped) g.anyEquipped = true;
    }
    const stackedInventory = [...groupMap.values()].sort((a, b) => {
      const aEq = a.anyEquipped ? 0 : 1;
      const bEq = b.anyEquipped ? 0 : 1;
      return aEq !== bEq ? aEq - bEq : a.name.localeCompare(b.name);
    });

    for (let i = 0; i < 14; i++) {
      const idx = i + 1;
      const g   = stackedInventory[i];
      if (g) {
        const displayName = g.total > 1 ? `${g.name} x ${g.total}` : g.name;
        _setText(form, `Inventory ${idx}`, displayName);
        const slotValue = (typeof g.baseSlots === "number" && Number.isFinite(g.baseSlots))
          ? (g.baseSlots * g.total)
          : (g.baseSlots ?? "");
        _setText(form, `Item Slot ${idx}`, slotValue);
      } else {
        _setText(form, `Inventory ${idx}`, "");
        _setText(form, `Item Slot ${idx}`, "");
      }
    }

    _setText(form, "Maximum Item Slots",  sys.inventory?.baseMaxSlots ?? sys.inventory?.maxSlots ?? "");
    _setText(form, "Occupied Item Slots", sys.inventory?.occupiedSlots ?? "");
    _setText(form, "Bonus Item Slots",    "0");

    // Magic (split across 2 fields)
    const spells = actor.items
      .filter(i => i.type === "spell")
      .sort((a, b) => a.name.localeCompare(b.name));

    const spellEntries = spells.map(spell => {
      const s       = spell.system;
      const dmgType = s.damageType
        ? (s.damageType === "-" ? "-" : s.damageType.charAt(0).toUpperCase() + s.damageType.slice(1))
        : "-";
      const desc  = _stripHtml(s.description || "");
      let entry   = `${spell.name} [Damage Base: ${dmgType}]: ${desc}`;
      const critText = s.critContinual ? "Duration is continual." : (s.crit || "").trim();
      if (critText) entry += `\rCrit: ${critText}`;
      return entry;
    });

    const half = Math.ceil(spellEntries.length / 2);
    _setText(form, "Magic 1", spellEntries.slice(0, half).join("\r\r"));
    _setText(form, "Magic 2", spellEntries.slice(half).join("\r\r"));

    // Abilities (ancestry traits + class features up to level + perks)
    const level        = sys.attributes?.level?.value ?? 1;
    const abilityLines = [];

    if (ancestryItem?.system?.traits) {
      for (const trait of ancestryItem.system.traits) {
        if (trait.name) abilityLines.push(`${trait.name}: ${_stripHtml(trait.description)}`);
      }
    }
    if (classItem?.system?.levelFeatures) {
      for (const feat of classItem.system.levelFeatures) {
        if (feat.level <= level && feat.name !== "Perk") {
          abilityLines.push(`${feat.name}: ${_stripHtml(feat.description)}`);
        }
      }
    }
    for (const perk of actor.items.filter(i => i.type === "perk")) {
      abilityLines.push(`${perk.name}: ${_stripHtml(perk.system?.description || "")}`);
    }

    _setText(form, "Abilities", abilityLines.join("\r\r"));

    const pdfBytes = await pdfDoc.save();
    const safeName  = actor.name.replace(/[\\/:*?"<>|]/g, "_");
    const filename  = `${safeName} - Vagabond.pdf`;

    // Try native OS "Save As" dialog (Electron + Chrome/Edge)
    if (typeof window.showSaveFilePicker === "function") {
      let handle;
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "PDF Document", accept: { "application/pdf": [".pdf"] } }],
        });
      } catch (err) {
        if (err.name === "AbortError") return; // user cancelled — silent exit
        throw err; // unexpected error — let outer catch handle it
      }
      const writable = await handle.createWritable();
      await writable.write(pdfBytes);
      await writable.close();
      ui.notifications.info(game.i18n.format("VGBND.ExportSuccess", { name: actor.name, path: handle.name }));
      return;
    }

    // Fallback for Firefox / unsupported browsers: save to Foundry user data folder
    const exportDir = (game.settings.get("vgbnd-importer", "export-folder") || "assets/vagabond/exports").replace(/\/+$/, "");
    try { await FilePicker.createDirectory("data", exportDir); } catch { /* already exists */ }
    const blob   = new Blob([pdfBytes], { type: "application/pdf" });
    const file   = new File([blob], filename, { type: "application/pdf" });
    const result = await FilePicker.upload("data", exportDir, file, { notify: false });
    ui.notifications.info(game.i18n.format("VGBND.ExportSuccess", { name: actor.name, path: result.path }));

  } catch (err) {
    console.error("[VGBND Export] Error:", err);
    ui.notifications.error(game.i18n.format("VGBND.ExportErrorFailed", { error: err.message }));
  }
}

Hooks.on("renderVagabondCharacterSheet", (app, html) => {
  const actor = app.actor ?? app.document;
  if (actor?.type !== "character") return;

  const appEl = app.element instanceof HTMLElement
    ? app.element
    : (app.element?.[0] ?? (html instanceof HTMLElement ? html : html[0])?.closest?.(".application,.window-app"));
  if (!appEl) return;
  if (appEl.querySelector(".vgbnd-export-pdf")) return;

  const controls = appEl.querySelector(".window-controls") ?? appEl.querySelector(".window-header");
  if (!controls) return;

  const btn     = document.createElement("button");
  btn.type      = "button";
  btn.className = "header-control vgbnd-export-pdf";
  const tooltip = game.i18n.localize("VGBND.ExportButtonTooltip");
  btn.title     = tooltip;
  btn.setAttribute("aria-label", tooltip);
  btn.innerHTML = '<i class="fas fa-file-export"></i>';
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    exportActorToPdf(actor);
  });

  controls.insertBefore(btn, controls.firstChild);
});
