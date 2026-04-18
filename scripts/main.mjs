import { VgbndImportDialog } from "./import-dialog.mjs";
import { VgbndUnresolvedDialog } from "./unresolved-dialog.mjs";
import { VgbndMapper } from "./mapper.mjs";

// Re-export for external use / debugging
export { VgbndImportDialog, VgbndUnresolvedDialog, VgbndMapper };

Hooks.once("init", () => {
  console.log("vgbnd-importer | Initialised");
});

Hooks.on("renderActorDirectory", (_app, html, _data) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("vgbnd-import-btn");
  btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> ${game.i18n.localize("VGBND.SidebarButton")}`;
  btn.addEventListener("click", () => new VgbndImportDialog().render(true));

  // html may be a jQuery object (v13) or a plain HTMLElement (v14)
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  const target = root.querySelector(".directory-footer")
    ?? root.querySelector("footer")
    ?? root.querySelector(".header-actions");
  if (target) target.prepend(btn);
});
