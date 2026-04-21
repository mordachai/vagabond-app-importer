import { VgbndBrowserDialog }    from "./browser-dialog.mjs";
import { VgbndUnresolvedDialog } from "./unresolved-dialog.mjs";
import { VgbndMapper }           from "./mapper.mjs";
import { VgbndFirebase }         from "./firebase.mjs";

// Re-export for external use / debugging
export { VgbndBrowserDialog, VgbndUnresolvedDialog, VgbndMapper, VgbndFirebase };

Hooks.once("init", () => {
  console.log("vgbnd-importer | Initialised");

  // Store Firebase session per-client (not synced to other players)
  game.settings.register("vgbnd-importer", "firebase-session", {
    scope:   "client",
    config:  false,
    type:    String,
    default: "",
  });

  game.settings.register("vgbnd-importer", "dynamic-token-rings", {
    name:    "VGBND.SettingDTRName",
    hint:    "VGBND.SettingDTRHint",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: false,
  });

  game.settings.register("vgbnd-importer", "dtr-subject-scale", {
    name:    "VGBND.SettingDTRScaleName",
    hint:    "VGBND.SettingDTRScaleHint",
    scope:   "world",
    config:  true,
    type:    Number,
    range:   { min: 0.5, max: 1.5, step: 0.05 },
    default: 0.8,
  });
});

Hooks.on("updateActor", async (actor, changes) => {
  if (!game.user.isGM) return;
  if (!changes.ownership) return;
  if (!game.settings.get("vgbnd-importer", "dynamic-token-rings")) return;

  // Find the first non-GM user with full ownership after this update
  const owner = Object.entries(actor.ownership)
    .filter(([id, level]) => id !== "default" && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
    .map(([id]) => game.users.get(id))
    .find(u => u && !u.isGM);

  if (!owner) return;

  const ringColor = owner.color?.toString() ?? "#ffffff";

  // Update prototypeToken so future placed tokens get the right color
  await actor.update({ "prototypeToken.ring.colors.ring": ringColor });

  // Update every placed token for this actor across all scenes
  for (const scene of game.scenes) {
    const tokens = scene.tokens.filter(t => t.actorId === actor.id && t.ring?.enabled);
    if (!tokens.length) continue;
    await scene.updateEmbeddedDocuments("Token", tokens.map(t => ({
      _id: t.id,
      "ring.colors.ring": ringColor,
    })));
  }
});

Hooks.on("renderActorDirectory", (_app, html, _data) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  const target = root.querySelector(".directory-footer")
    ?? root.querySelector("footer")
    ?? root.querySelector(".header-actions");
  if (!target) return;

  const browseBtn = document.createElement("button");
  browseBtn.type = "button";
  browseBtn.classList.add("vgbnd-import-btn");
  browseBtn.innerHTML = `<i class="fa-solid fa-users"></i> ${game.i18n.localize("VGBND.SidebarBrowseButton")}`;
  browseBtn.addEventListener("click", () => new VgbndBrowserDialog().render(true));
  target.prepend(browseBtn);
});
