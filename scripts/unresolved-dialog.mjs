import { VgbndMapper } from "./mapper.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class VgbndUnresolvedDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #actor;
  #items;
  #resolveClose;
  closed = new Promise(resolve => this.#resolveClose = resolve);

  constructor(actor, items, options = {}) {
    super(options);
    this.#actor = actor;
    this.#items = items;
  }

  async close(options) {
    const result = await super.close(options);
    this.#resolveClose();
    return result;
  }

  static DEFAULT_OPTIONS = {
    id: "vgbnd-unresolved-dialog",
    tag: "div",
    classes: ["vgbnd-unresolved-dialog"],
    window: {
      title: "VGBND.UnresolvedTitle",
      icon: "fa-solid fa-triangle-exclamation",
      resizable: true,
    },
    position: { width: 540, height: 480 },
    actions: {
      search: VgbndUnresolvedDialog.#onSearch,
      add:    VgbndUnresolvedDialog.#onAdd,
      create: VgbndUnresolvedDialog.#onCreate,
    },
  };

  static PARTS = {
    form: { template: "modules/vgbnd-importer/templates/unresolved-dialog.hbs" },
  };

  async _prepareContext() {
    return { items: this.#items };
  }

  // Auto-search all items once the dialog is in the DOM
  _onFirstRender(context, options) {
    const itemEls = this.element.querySelectorAll(".vgbnd-unresolved-item");
    for (const el of itemEls) this.#runSearch(el);
  }

  // ──────────────────────────────────────────────────────────
  //  Actions
  // ──────────────────────────────────────────────────────────

  static async #onSearch(_event, target) {
    const index  = target.dataset.index;
    const itemEl = this.element.querySelector(`.vgbnd-unresolved-item[data-index="${index}"]`);
    await this.#runSearch(itemEl);
  }

  static async #onAdd(_event, target) {
    const packId    = target.dataset.pack;
    const docId     = target.dataset.docId;
    const itemIndex = target.dataset.itemIndex;

    const pack = game.packs.get(packId);
    if (!pack) return;
    const doc = await pack.getDocument(docId);
    if (!doc) return;

    const itemData   = doc.toObject();
    const origSystem = this.#items[Number(itemIndex)]?.system;
    if (origSystem?.quantity !== undefined) foundry.utils.setProperty(itemData, "system.quantity", origSystem.quantity);
    if (origSystem?.equipped)               foundry.utils.setProperty(itemData, "system.equipped", true);

    await this.#actor.createEmbeddedDocuments("Item", [itemData]);
    this.#markResolved(itemIndex, doc.name);
  }

  static async #onCreate(_event, target) {
    const { name, type, index } = target.dataset;
    await this.#actor.createEmbeddedDocuments("Item", [{ name, type }]);
    this.#markResolved(index, name);
  }

  // ──────────────────────────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────────────────────────

  async #runSearch(itemEl) {
    const query     = itemEl.querySelector(".vgbnd-search-input").value;
    const type      = itemEl.dataset.type;
    const resultsEl = itemEl.querySelector(".vgbnd-results");
    const index     = itemEl.dataset.index;

    resultsEl.innerHTML = `<li class="vgbnd-status-row"><i class="fa-solid fa-spinner fa-spin"></i> ${game.i18n.localize("VGBND.Searching")}</li>`;

    const results = await VgbndMapper.searchByName(query, type);

    if (!results.length) {
      resultsEl.innerHTML = `<li class="vgbnd-status-row vgbnd-none">${game.i18n.localize("VGBND.NoResults")}</li>`;
      return;
    }

    resultsEl.innerHTML = results.map(r => `
      <li class="vgbnd-result-item">
        <span class="vgbnd-result-name">${r.name}</span>
        <span class="vgbnd-result-pack">${r.packLabel}</span>
        <button type="button" data-action="add"
                data-pack="${r.packId}" data-doc-id="${r.id}" data-item-index="${index}">
          <i class="fa-solid fa-plus"></i> ${game.i18n.localize("VGBND.AddToActor")}
        </button>
      </li>
    `).join("");
  }

  #markResolved(index, name) {
    const itemEl = this.element.querySelector(`.vgbnd-unresolved-item[data-index="${index}"]`);
    if (!itemEl) return;
    itemEl.classList.add("vgbnd-resolved");
    itemEl.querySelector(".vgbnd-results").innerHTML =
      `<li class="vgbnd-status-row vgbnd-done"><i class="fa-solid fa-check"></i> ${name} ${game.i18n.localize("VGBND.Added")}</li>`;
  }
}
