import { VgbndFirebase }        from "./firebase.mjs";
import { VgbndMapper }          from "./mapper.mjs";
import { VgbndUnresolvedDialog } from "./unresolved-dialog.mjs";

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
    // console.log("vgbnd-importer | raw Firestore document:", JSON.parse(JSON.stringify(fs)));
    const items = [];

    // Ancestry & class resolved by name from compendiums
    if (fs.ancestry) items.push({ name: VgbndBrowserDialog.#titleCase(fs.ancestry), type: "ancestry" });
    if (fs.class)    items.push({ name: VgbndBrowserDialog.#titleCase(fs.class),    type: "class"    });

    // Perks (includes ancestry + class source perks)
    for (const p of (fs.selected_perks ?? [])) {
      if (p.name) items.push({ name: p.name, type: "perk" });
    }

    // Known spells + ancestry bonus spell
    for (const spellName of (fs.known_spells ?? [])) {
      if (spellName) items.push({ name: spellName, type: "spell" });
    }
    if (fs.ancestry_bonus_spell) items.push({ name: fs.ancestry_bonus_spell, type: "spell" });

    // Inventory → equipment (mapper resolves from weapon/armor/gear packs)
    for (const inv of (fs.inventory ?? [])) {
      if (!inv.name) continue;
      items.push({
        name:   inv.name,
        type:   "equipment",
        system: {
          quantity: inv.quantity ?? 1,
          ...(inv.is_equipped && { equipped: true }),
        },
      });
    }

    // Portrait — upload to Foundry's file system so it's a proper URL, not a db blob
    const charName = VgbndBrowserDialog.#sanitizeFilename(fs.name);
    const img = await VgbndBrowserDialog.#uploadPortrait(charName, fs.character_image_base64)
              ?? "icons/svg/mystery-man.svg";

    // Stats: assignedStats + levelStats bonuses (e.g. stat points gained on level-up)
    const statsObj = {};
    const src      = fs.assignedStats ?? {};
    const lvlStats = fs.levelStats    ?? {};
    for (const stat of ["might", "dexterity", "awareness", "reason", "presence", "luck"]) {
      const base  = src[stat]      ?? null;
      const bonus = lvlStats[stat] ?? 0;
      if (base != null) statsObj[stat] = { value: base + bonus };
    }

    // Skills: trained_skills + ancestry_bonus_skill
    const skillsObj = {};
    for (const sk of (fs.trained_skills ?? [])) {
      const name = (typeof sk === "string" ? sk : (sk?.name ?? sk?.skill ?? null))?.toLowerCase();
      if (name) skillsObj[name] = { trained: true };
    }
    if (fs.ancestry_bonus_skill) skillsObj[fs.ancestry_bonus_skill.toLowerCase()] = { trained: true };

    // Currency — current_wealth uses {g,s,c} short keys or {gold,silver,copper} long keys
    const currency = {};
    const cw = fs.current_wealth;
    if (cw != null && typeof cw === "object") {
      const g = cw.gold   ?? cw.g;
      const s = cw.silver ?? cw.s;
      const c = cw.copper ?? cw.c;
      if (g != null) currency.gold   = g;
      if (s != null) currency.silver = s;
      if (c != null) currency.copper = c;
    } else {
      if (fs.gold   != null) currency.gold   = fs.gold;
      if (fs.silver != null) currency.silver = fs.silver;
      if (fs.copper != null) currency.copper = fs.copper;
    }

    const system = {
      attributes: {
        level: { value: fs.level ?? 1 },
        ...(fs.xp != null && { xp: fs.xp }),
      },
      details:    { builderDismissed: true },
      ...(Object.keys(statsObj).length  && { stats:    statsObj }),
      ...(Object.keys(skillsObj).length && { skills:   skillsObj }),
      ...(Object.keys(currency).length  && { currency: currency }),
      ...(fs.current_hp   != null && { health:      { value: fs.current_hp } }),
      ...(fs.current_mana != null && { mana:        { current: fs.current_mana } }),
      ...(fs.current_luck != null && { currentLuck: fs.current_luck }),
    };

    let subjectTexture = null;
    if (game.settings.get("vgbnd-importer", "dynamic-token-rings")) {
      const subjectScale = game.settings.get("vgbnd-importer", "dtr-subject-scale");
      subjectTexture = await VgbndBrowserDialog.#createSubjectTexture(charName, fs.character_image_base64, subjectScale);
    }

    return { name: fs.name ?? "Unknown", type: "character", img, items, system, subjectTexture };
  }

  static async #uploadPortrait(charName, base64) {
    if (!base64?.startsWith("data:")) return null;
    try {
      const folder = "assets/vagabond/portraits";
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
      const file = new File([arr], `${charName}.${ext}`, { type: mime });
      const res  = await FP.upload("data", folder, file, {}, { notify: false });
      return res?.path ?? null;
    } catch (err) {
      console.warn("vgbnd-importer | Portrait upload failed:", err.message);
      return null;
    }
  }

  // Produces a 512×512 WebP with the portrait circle-cropped so that after DTR
  // applies subject.scale the portrait edge aligns exactly with the ring boundary.
  static async #createSubjectTexture(charName, base64, scale = 1) {
    if (!base64?.startsWith("data:")) return null;
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload  = () => resolve(el);
        el.onerror = reject;
        el.src = base64;
      });

      const size   = 512;
      const cx     = size / 2;
      // Ring starts at ⅔ of the token radius. DTR will scale the texture by `scale`,
      // so we pre-compensate: make the crop circle larger so scale × cropRadius = ⅔ × cx.
      const radius = Math.min(cx, cx * (2 / 3) / scale);

      const canvas = document.createElement("canvas");
      canvas.width  = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");

      ctx.beginPath();
      ctx.arc(cx, cx, radius, 0, Math.PI * 2);
      ctx.clip();

      // Cover: scale portrait to fill the circle, centred
      const d         = radius * 2;
      const drawScale = Math.max(d / img.width, d / img.height);
      const sw        = img.width  * drawScale;
      const sh        = img.height * drawScale;
      ctx.drawImage(img, cx - sw / 2, cx - sh / 2, sw, sh);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.9));
      const file = new File([blob], `${charName}_subject.webp`, { type: "image/webp" });

      const folder = "assets/vagabond/portraits";
      const FP  = foundry.applications.apps.FilePicker.implementation;
      const res = await FP.upload("data", folder, file, {}, { notify: false });
      return res?.path ?? null;
    } catch (err) {
      console.warn("vgbnd-importer | Subject texture creation failed:", err.message);
      return null;
    }
  }

  static #titleCase(str) {
    return str?.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) ?? str;
  }

  static #sanitizeFilename(name) {
    return (name ?? "unknown").trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "_") || "unknown";
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

    if (unresolved.length) {
      const dlg = new VgbndUnresolvedDialog(actor, unresolved);
      dlg.render(true);
      await dlg.closed;
    }
  }
}
