import { VgbndMapper } from "./mapper.mjs";
import { VgbndUnresolvedDialog } from "./unresolved-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class VgbndImportDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "vgbnd-import-dialog",
    tag: "div",
    classes: ["vgbnd-import-dialog"],
    window: {
      title: "VGBND.ImportTitle",
      icon: "fa-solid fa-cloud-arrow-down",
      resizable: false,
    },
    position: { width: 480, height: "auto" },
    actions: {
      import:  VgbndImportDialog.#onImport,
      openUrl: VgbndImportDialog.#onOpenUrl,
    },
  };

  static PARTS = {
    form: { template: "modules/vgbnd-importer/templates/import-dialog.hbs" },
  };

  // ──────────────────────────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────────────────────────

  static extractUUID(input) {
    const match = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return match ? match[0] : null;
  }

  // ──────────────────────────────────────────────────────────
  //  Import action
  // ──────────────────────────────────────────────────────────

  static #onOpenUrl(_event, _target) {
    const input = this.element.querySelector("#vgbnd-uuid-input")?.value?.trim();
    const uuid  = input ? VgbndImportDialog.extractUUID(input) : null;
    if (!uuid) {
      ui.notifications.warn(game.i18n.localize("VGBND.ErrorInvalidUUID"));
      return;
    }
    window.open(`https://www.vgbnd.app/api/characters/${uuid}?format=foundry`, "_blank");
  }

  static async #onImport(_event, _target) {
    const jsonText  = this.element.querySelector("#vgbnd-json-input")?.value?.trim();
    const statusEl  = this.element.querySelector(".vgbnd-status");
    const importBtn = this.element.querySelector("[data-action='import']");

    if (!jsonText) {
      ui.notifications.warn(game.i18n.localize("VGBND.ErrorNoJSON"));
      return;
    }

    // ── Parse ─────────────────────────────────────────────
    let raw;
    try {
      raw = JSON.parse(jsonText);
    } catch (err) {
      ui.notifications.error(game.i18n.format("VGBND.ErrorBadJSON", { error: err.message }));
      return;
    }

    // ── Lock UI ───────────────────────────────────────────
    importBtn.disabled = true;
    statusEl.textContent = game.i18n.localize("VGBND.Importing");

    // ── Map ───────────────────────────────────────────────
    let actorData, unresolved;
    try {
      ({ actorData, unresolved } = await VgbndMapper.toActor(raw));
    } catch (err) {
      this.#resetUI(importBtn, statusEl);
      ui.notifications.error(game.i18n.format("VGBND.ErrorCreate", { error: err.message }));
      console.error("vgbnd-importer | Mapping error", err);
      return;
    }

    // ── Create actor ──────────────────────────────────────
    let actor;
    try {
      actor = await Actor.create(actorData);
    } catch (err) {
      this.#resetUI(importBtn, statusEl);
      ui.notifications.error(game.i18n.format("VGBND.ErrorCreate", { error: err.message }));
      console.error("vgbnd-importer | Actor creation error", err);
      return;
    }

    // ── Success ───────────────────────────────────────────
    actor?.sheet?.render(true);
    ui.notifications.info(game.i18n.format("VGBND.Success", { name: actor.name }));
    this.close();

    // ── Unresolved report ─────────────────────────────────
    if (unresolved.length > 0) {
      new VgbndUnresolvedDialog(actor, unresolved).render(true);
    }
  }

  // ──────────────────────────────────────────────────────────
  //  UI helpers
  // ──────────────────────────────────────────────────────────

  #resetUI(btn, statusEl) {
    btn.disabled = false;
    statusEl.textContent = "";
  }
}
