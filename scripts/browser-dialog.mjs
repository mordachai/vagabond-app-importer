import { VgbndFirebase }       from "./firebase.mjs";
import { VgbndMapper }          from "./mapper.mjs";
import { VgbndUnresolvedDialog } from "./unresolved-dialog.mjs";
import { VgbndSpellDialog }     from "./spell-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class VgbndBrowserDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id:      "vgbnd-browser-dialog",
    tag:     "div",
    classes: ["vgbnd-browser-dialog"],
    window:  { title: "VGBND.BrowserTitle", icon: "fa-solid fa-users", resizable: true },
    position: { width: 760, height: 560 },
    actions: {
      signIn:      VgbndBrowserDialog.#onSignIn,
      signOut:     VgbndBrowserDialog.#onSignOut,
      refresh:     VgbndBrowserDialog.#onRefresh,
      switchTab:   VgbndBrowserDialog.#onSwitchTab,
      selectGroup: VgbndBrowserDialog.#onSelectGroup,
      importChar:  VgbndBrowserDialog.#onImportChar,
      importGroup: VgbndBrowserDialog.#onImportGroup,
    },
  };

  static PARTS = {
    main: { template: "modules/vgbnd-importer/templates/browser-dialog.hbs" },
  };

  // ── State ──────────────────────────────────────────────────────────────────

  #view           = "login"; // "login" | "browser"
  #tab            = "mine";  // "mine"  | "group"
  #characters     = [];
  #groups         = [];
  #selectedGrpId  = null;
  #groupChars     = [];
  #error          = "";
  #loading        = false;
  #initDone       = false;   // guard so _onRender only auto-loads once

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async _prepareContext() {
    if (VgbndFirebase.isSignedIn() && this.#view === "login") this.#view = "browser";

    const selGroup = this.#groups.find(g => g.id === this.#selectedGrpId) ?? null;

    return {
      isLogin:   this.#view === "login",
      isBrowser: this.#view === "browser",
      isMine:    this.#tab === "mine",
      isGroup:   this.#tab === "group",
      loading:   this.#loading,
      error:     this.#error,
      characters:  this.#fmt(this.#characters),
      groups:      this.#groups.map(g => ({ ...g, isSelected: g.id === this.#selectedGrpId })),
      selectedGroup:  selGroup,
      groupChars:  this.#fmt(this.#groupChars),
      isGM:   game.user?.isGM ?? false,
    };
  }

  _onRender(_ctx, _opts) {
    if (!this.#initDone && this.#view === "browser" && !this.#loading) {
      this.#initDone = true;
      this.#loadMyData();
    }
  }

  // ── Formatting ─────────────────────────────────────────────────────────────

  #fmt(chars) {
    return chars.map(c => {
      const level    = c.level ?? c.system?.attributes?.level?.value ?? "";
      const ancestry = c.ancestry ?? c.ancestryName ?? "";
      const cls      = c["class"] ?? c.className ?? "";
      const parts    = [level ? `Level ${level}` : null, ancestry, cls].filter(Boolean);
      const updated  = c._updateTime
        ? new Date(c._updateTime).toLocaleDateString() : "";
      const playerName = c.displayName ?? c.userName ?? c.userDisplayName ?? "";
      return {
        ...c,
        portrait: c.img || c.character_image_base64 || "icons/svg/mystery-man.svg",
        summary:  parts.join(" ") || "",
        updated,
        playerName,
      };
    });
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  async #loadMyData() {
    this.#loading = true;
    this.#error   = "";
    this.render();
    try {
      const tok = await VgbndFirebase.getToken();
      if (!tok) { this.#view = "login"; return; }
      const [chars, groups] = await Promise.all([
        VgbndFirebase.listCharacters(tok.idToken, tok.uid),
        VgbndFirebase.listGroups(tok.idToken, tok.uid),
      ]);
      this.#characters = chars.sort((a, b) => (b._updateTime > a._updateTime ? 1 : -1));
      this.#groups     = groups;
    } catch (err) {
      this.#error = err.message;
      console.error("vgbnd-importer | list error", err);
    } finally {
      this.#loading = false;
      this.render();
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  static async #onSignIn() {
    const email    = this.element.querySelector("#vgbnd-email")?.value?.trim();
    const password = this.element.querySelector("#vgbnd-password")?.value;
    if (!email || !password) {
      this.#error = game.i18n.localize("VGBND.ErrorLoginMissing");
      this.render();
      return;
    }
    this.#error   = "";
    this.#loading = true;
    this.render();
    try {
      await VgbndFirebase.signIn(email, password);
      this.#view     = "browser";
      this.#initDone = true;
      await this.#loadMyData();
    } catch (err) {
      this.#error   = err.message;
      this.#loading = false;
      this.render();
    }
  }

  static #onSignOut() {
    VgbndFirebase.signOut();
    this.#view          = "login";
    this.#tab           = "mine";
    this.#characters    = [];
    this.#groups        = [];
    this.#selectedGrpId = null;
    this.#groupChars    = [];
    this.#error         = "";
    this.#loading       = false;
    this.#initDone      = false;
    this.render();
  }

  static #onSwitchTab(_e, target) {
    this.#tab = target.dataset.tab;
    this.render();
  }

  static async #onRefresh() {
    this.#characters    = [];
    this.#groups        = [];
    this.#groupChars    = [];
    this.#selectedGrpId = null;
    this.#error         = "";
    this.#initDone      = false;
    await this.#loadMyData();
  }

  static async #onSelectGroup(_e, target) {
    const groupId = target.dataset.groupId;
    this.#selectedGrpId = groupId;
    const group = this.#groups.find(g => g.id === groupId);
    if (!group?.members?.length) { this.render(); return; }
    this.#loading = true;
    this.render();
    try {
      const tok = await VgbndFirebase.getToken();
      if (!tok) return;
      // memberCharacters = { uid: [charId, ...], ... } — flatten to charId array
      const memberChars = group.memberCharacters ?? {};
      const charIds = Object.values(memberChars).flat();
      const charToUid = Object.fromEntries(
        Object.entries(memberChars).flatMap(([uid, ids]) => ids.map(id => [id, uid]))
      );

      // Resolve display names for all member UIDs in parallel
      const allUids = Object.keys(memberChars);
      const nameEntries = await Promise.all(
        allUids.map(async uid => {
          if (uid === tok.uid) return [uid, tok.displayName ?? ""];
          const name = await VgbndFirebase.getUserDisplayName(tok.idToken, uid);
          return [uid, name ?? ""];
        })
      );
      const uidToName = Object.fromEntries(nameEntries);

      const chars = await VgbndFirebase.getGroupCharacters(tok.idToken, charIds);
      this.#groupChars = chars.map(c => {
        const ownerUid = charToUid[c.id] ?? c.userId ?? "";
        return { ...c, displayName: uidToName[ownerUid] ?? "" };
      });
    } catch (err) {
      this.#error = err.message;
    } finally {
      this.#loading = false;
      this.render();
    }
  }

  static async #onImportChar(_e, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid ?? target.dataset.uuid;
    if (!uuid) return;
    const btn = target.closest("button") ?? target;
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    try {
      await VgbndBrowserDialog.#importByUuid(uuid);
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }

  static async #onImportGroup() {
    if (!game.user?.isGM) return;
    const chars = this.#groupChars;
    if (!chars.length) return;
    for (const c of chars) await VgbndBrowserDialog.#importByUuid(c.id);
  }

  // ── Core import ─────────────────────────────────────────────────────────────

  static async #importByUuid(uuid) {
    // Firestore is already authenticated — no CORS issues. Transform the raw document.
    const tok = await VgbndFirebase.getToken();
    if (tok) {
      try {
        const fsData = await VgbndFirebase.getCharacter(tok.idToken, uuid);
        if (fsData.ancestry || fsData.class || fsData.inventory?.length) {
          const raw = await VgbndBrowserDialog.#fromFirestore(uuid, fsData);
          return await VgbndBrowserDialog.#createActor(raw);
        }
      } catch (err) {
        console.warn("vgbnd-importer | Firestore import error:", err.message);
      }
    }

    // Fallback: vgbd.app API (blocked by CORS in browser context, opens new tab).
    let raw;
    try {
      const res = await fetch(`https://www.vgbnd.app/api/characters/${uuid}?format=foundry`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = await res.json();
    } catch {
      ui.notifications.warn(game.i18n.localize("VGBND.ErrorCORSFallback"));
      window.open(`https://www.vgbnd.app/api/characters/${uuid}?format=foundry`, "_blank");
      return;
    }

    await VgbndBrowserDialog.#createActor(raw);
  }

  // ── Firestore → mapper-compatible format ────────────────────────────────────

  static async #fromFirestore(uuid, fs) {
    const items = [];

    // Ancestry & class resolved by name from compendiums
    if (fs.ancestry) items.push({ name: VgbndBrowserDialog.#titleCase(fs.ancestry), type: "ancestry" });
    if (fs.class)    items.push({ name: VgbndBrowserDialog.#titleCase(fs.class),    type: "class"    });

    // Perks (includes ancestry + class source perks)
    for (const p of (fs.selected_perks ?? [])) {
      if (p.name) items.push({ name: p.name, type: "perk" });
    }

    // Inventory → equipment (mapper resolves from weapon/armor/gear packs)
    for (const inv of (fs.inventory ?? [])) {
      if (!inv.name) continue;
      items.push({ name: inv.name, type: "equipment", system: { quantity: inv.quantity ?? 1 } });
    }

    // Portrait — upload to Foundry's file system so it's a proper URL, not a db blob
    const img = await VgbndBrowserDialog.#uploadPortrait(uuid, fs.character_image_base64)
              ?? "icons/svg/mystery-man.svg";

    // Stats: assignedStats keys match Foundry system stat names exactly
    const statsObj = {};
    const src = fs.assignedStats ?? {};
    for (const stat of ["might", "dexterity", "awareness", "reason", "presence", "luck"]) {
      if (src[stat] != null) statsObj[stat] = { value: src[stat] };
    }

    // Skills: trained_skills — log raw value to confirm format, then map
    const skillsObj = {};
    for (const sk of (fs.trained_skills ?? [])) {
      const name = (typeof sk === "string" ? sk : (sk?.name ?? sk?.skill ?? null))?.toLowerCase();
      if (name) skillsObj[name] = { trained: true };
    }

    // Currency — current_wealth may be a {gold,silver,copper} map or separate fields
    const currency = {};
    const cw = fs.current_wealth;
    if (cw != null && typeof cw === "object") {
      if (cw.gold   != null) currency.gold   = cw.gold;
      if (cw.silver != null) currency.silver = cw.silver;
      if (cw.copper != null) currency.copper = cw.copper;
    } else {
      if (fs.gold   != null) currency.gold   = fs.gold;
      if (fs.silver != null) currency.silver = fs.silver;
      if (fs.copper != null) currency.copper = fs.copper;
    }

    const system = {
      attributes: { level: { value: fs.level ?? 1 } },
      details:    { builderDismissed: true },
      ...(Object.keys(statsObj).length  && { stats:    statsObj }),
      ...(Object.keys(skillsObj).length && { skills:   skillsObj }),
      ...(Object.keys(currency).length  && { currency: currency }),
      ...(fs.current_hp   != null && { health:      { value: fs.current_hp } }),
      ...(fs.current_mana != null && { mana:        { current: fs.current_mana } }),
      ...(fs.current_luck != null && { currentLuck: fs.current_luck }),
    };

    return { name: fs.name ?? "Unknown", type: "character", img, items, system };
  }

  static async #uploadPortrait(uuid, base64) {
    if (!base64?.startsWith("data:")) return null;
    try {
      const folder = "assets/vagabond/portraits";
      // Create each path segment; ignore errors (directory may already exist)
      const FP = foundry.applications.apps.FilePicker.implementation;
      for (const path of ["assets", "assets/vagabond", folder]) {
        try { await FP.createDirectory("data", path, {}); } catch { /* exists */ }
      }
      const [header, data] = base64.split(",");
      const mime = header.match(/:(.*?);/)?.[1] ?? "image/webp";
      const ext  = mime.split("/")[1] ?? "webp";
      const bytes = atob(data);
      const arr   = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const file = new File([arr], `${uuid}.${ext}`, { type: mime });
      const res  = await FP.upload("data", folder, file, { notify: false });
      return res?.path ?? null;
    } catch (err) {
      console.warn("vgbnd-importer | Portrait upload failed:", err.message);
      return null;
    }
  }

  static #titleCase(str) {
    return str?.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) ?? str;
  }

  static async #createActor(raw) {
    let actorData, unresolved;
    try {
      ({ actorData, unresolved } = await VgbndMapper.toActor(raw));
    } catch (err) {
      ui.notifications.error(game.i18n.format("VGBND.ErrorCreate", { error: err.message }));
      return;
    }

    let actor;
    try {
      actor = await Actor.create(actorData);
    } catch (err) {
      ui.notifications.error(game.i18n.format("VGBND.ErrorCreate", { error: err.message }));
      return;
    }

    actor?.sheet?.render(true);

    // Wait for unresolved items to be handled before continuing
    if (unresolved.length) {
      const dlg = new VgbndUnresolvedDialog(actor, unresolved);
      dlg.render(true);
      await dlg.closed;
    }

    // Wait for spell selection before continuing to the next character
    const classItem    = actor.items.find(i => i.type === "class");
    const ancestryItem = actor.items.find(i => i.type === "ancestry");
    const isSpellcaster = classItem?.system?.isSpellcaster === true
                       || ancestryItem?.system?.isSpellcaster === true;
    if (isSpellcaster) {
      const level      = actor.system?.attributes?.level?.value ?? 1;
      const spellCount = classItem?.system?.isSpellcaster
        ? (classItem.system?.levelSpells?.find(ls => ls.level === level)?.spells ?? null)
        : null;
      const proceed = await foundry.applications.api.DialogV2.confirm({
        window:  { title: game.i18n.localize("VGBND.SpellPromptTitle") },
        content: `<p>${game.i18n.localize("VGBND.SpellPromptBody")}</p>`,
      });
      if (proceed) {
        const dlg = new VgbndSpellDialog(actor, spellCount);
        dlg.render(true);
        await dlg.closed;
      }
    }
  }
}
