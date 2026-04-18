const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SPELL_PACK = "vagabond.spells";

export class VgbndSpellDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #actor;
  #spellCount; // how many spells this character should pick (null = unknown)
  #added = 0;

  constructor(actor, spellCount = null, options = {}) {
    super(options);
    this.#actor = actor;
    this.#spellCount = spellCount;
  }

  static DEFAULT_OPTIONS = {
    id: "vgbnd-spell-dialog",
    tag: "div",
    classes: ["vgbnd-spell-dialog"],
    window: {
      title: "VGBND.SpellTitle",
      icon: "fa-solid fa-wand-sparkles",
      resizable: true,
    },
    position: { width: 480, height: 520 },
    actions: {
      add:    VgbndSpellDialog.#onAdd,
      finish: VgbndSpellDialog.#onFinish,
    },
  };

  static PARTS = {
    form: { template: "modules/vgbnd-importer/templates/spell-dialog.hbs" },
  };

  async _prepareContext() {
    const pack = game.packs.get(SPELL_PACK);
    if (!pack) return { spells: [], missing: true, spellCount: this.#spellCount, added: 0 };

    await pack.getIndex();

    const onActor = new Set(
      this.#actor.items.filter(i => i.type === "spell").map(i => i.name.trim().toLowerCase())
    );

    this.#added = onActor.size;

    const spells = [...pack.index]
      .map(e => ({
        name: e.name,
        nameLower: e.name.trim().toLowerCase(),
        id: e._id,
        added: onActor.has(e.name.trim().toLowerCase()),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      spells,
      missing: false,
      spellCount: this.#spellCount,
      added: this.#added,
      counterDone: this.#spellCount != null && this.#added >= this.#spellCount,
    };
  }

  _onFirstRender(context, options) {
    const input = this.element.querySelector(".vgbnd-spell-search");
    input?.addEventListener("input", () => this.#filterSpells(input.value));
  }

  // ──────────────────────────────────────────────────────────
  //  Actions
  // ──────────────────────────────────────────────────────────

  static async #onAdd(_event, target) {
    const pack = game.packs.get(SPELL_PACK);
    if (!pack) return;

    const doc = await pack.getDocument(target.dataset.id);
    if (!doc) return;

    await this.#actor.createEmbeddedDocuments("Item", [doc.toObject()]);

    target.disabled = true;
    target.closest(".vgbnd-spell-row").classList.add("vgbnd-added");
    target.innerHTML = `<i class="fa-solid fa-check"></i>`;

    this.#added++;
    this.#updateCounter();
  }

  static #onFinish(_event, _target) {
    this.close();
  }

  // ──────────────────────────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────────────────────────

  #filterSpells(query) {
    const needle = query.trim().toLowerCase();
    for (const row of this.element.querySelectorAll(".vgbnd-spell-row")) {
      row.hidden = needle && !row.dataset.name.includes(needle);
    }
  }

  #updateCounter() {
    const el = this.element.querySelector(".vgbnd-spell-counter");
    if (!el) return;
    el.textContent = this.#spellCount != null
      ? `${this.#added} / ${this.#spellCount}`
      : String(this.#added);
    el.classList.toggle("vgbnd-counter-done", this.#spellCount != null && this.#added >= this.#spellCount);
  }
}
