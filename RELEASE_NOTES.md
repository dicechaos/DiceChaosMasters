## Dice Chaos Masters — Public Beta (`v1.0.0-beta.4`)

Welcome to the latest **Public Beta** release of **Dice Chaos Masters** by **[Dice Chaos](https://dicechaos.com)**!

**Dice Chaos Masters** is a free, open-source (**GPL-3.0**), offline-first parametric 3D polyhedral dice master, matched insert blank, and MSLA resin support studio built to pair seamlessly alongside **[Dice Chaos Maps](https://github.com/dicechaos/DiceChaosMaps)**, **[Dice Chaos Connections](https://github.com/dicechaos/DiceChaosConnections)**, and **[Dice Chaos Display](https://github.com/dicechaos/DiceChaosDisplay)** in the **Dice Chaos Tabletop Suite**.

---

### Downloads
- **Windows (x64):**
  - **[dice-chaos-masters-1.0.0-beta.4-setup.exe](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.4/dice-chaos-masters-1.0.0-beta.4-setup.exe)** *(One-click installer — Recommended)*
  - **[dice-chaos-masters-1.0.0-beta.4-win-x64-portable.zip](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.4/dice-chaos-masters-1.0.0-beta.4-win-x64-portable.zip)** *(Portable zip — extract anywhere and run `DiceChaosMasters.exe`)*
- **macOS (Apple Silicon & Intel):**
  - **[dice-chaos-masters-1.0.0-beta.4-arm64.dmg](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.4/dice-chaos-masters-1.0.0-beta.4-arm64.dmg)** *(Apple Silicon disk image installer)*
  - **[dice-chaos-masters-1.0.0-beta.4-x64.dmg](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.4/dice-chaos-masters-1.0.0-beta.4-x64.dmg)** *(Intel disk image installer)*
  - **[dice-chaos-masters-1.0.0-beta.4-mac-arm64.zip](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.4/dice-chaos-masters-1.0.0-beta.4-mac-arm64.zip)** / **[dice-chaos-masters-1.0.0-beta.4-mac-x64.zip](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.4/dice-chaos-masters-1.0.0-beta.4-mac-x64.zip)**
- **Linux (x64):**
  - **[dice-chaos-masters-1.0.0-beta.4.AppImage](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.4/dice-chaos-masters-1.0.0-beta.4.AppImage)** *(Portable AppImage)*
  - **[dice-chaos-masters_1.0.0-beta.4_amd64.deb](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.4/dice-chaos-masters_1.0.0-beta.4_amd64.deb)** *(Debian / Ubuntu `.deb` package)*
- **SHA-256 Checksums:** Per-platform checksum manifests (`SHA256SUMS-Windows.txt`, `SHA256SUMS-macOS.txt`, `SHA256SUMS-Linux.txt`) generated directly from the release binaries are attached to this release.

> **OS Gatekeeper / SmartScreen Note:** Because Public Beta builds are not yet signed with commercial code-signing certificates:
> - **Windows:** If *"Windows protected your PC"* appears on first launch, click **More info** -> **Run anyway**.
> - **macOS:** Right-click (or Control-click) the app -> **Open** on first launch.

---

### What's New in `v1.0.0-beta.4` (UI Engineering Polish Pass)
- **Single-Row `50 px` Studio Header & Project Menu:** Eliminated header wrapping from `1024px` upward with **`Export Set`** anchored top-right, concise `Single / Tray / X-Ray / Supports` viewport tabs, inline-editable project title, and a `⋯` Project overflow popover (`Save Project As…`, `Auto-Save to Disk` checkbox, `Reset Workspace`, `Maker Tour`, and `dicechaos.com`).
- **Numerically Sorted Face Strip & Responsive 3D Viewport HUD:** Sorted face pills in natural ascending order (`1–20`; `10–90, 00` for `D00 %`) with amber edited-face dots, horizontal mouse-wheel scrolling, and edge fade affordances. Container queries automatically compact resin presets to `26×26 px` swatches on narrower screens so `Faces` and `Focus` never clip at `1024×768`.
- **Full Set Tray Framing & 3D Hover Feedback:** Widened default `Full Set Tray` camera framing so all 9+ polyhedrals sit cleanly inside the viewport with breathing room, streamlined the multi-select caliper HUD onto a single row, and added pointer hover cues over clickable 3D faces and tray dice.
- **Widened Polyhedral Rail (`192–218 px`):** Single-line `Polyhedral Set` header, scannable 2-row die cards (`Name + tabular mm` top, full subtitle + `Primary`/`Custom` tags bottom), and higher-contrast `22×22 px` Duplicate/Remove actions in both Midnight Dark and Daylight Light themes.
- **Branded Sliders, Selects, Animated Tabs & Collapsible Templates:** Introduced custom filled `<StudioSlider>` controls with paired `tabular-nums` spinbuttons across all 13 sliders, progressive branded `<select>` pickers (`appearance: base-select`), a smoothly sliding cyan Inspector tab underline, a collapsible `<details>` accordion for `Quick Game Set Templates`, uniform 2-line `Global Set Scale` tiles, clean `Blanks` formula typography, smooth `@starting-style` modal/popover transitions, sticky vertical scroll shadows, and updated Maker Tour copy.

### Core Studio Capabilities
- **Multi-Instance Dice Sets & Quick Game Set Templates:** Duplicate or pair dice in one set (`2× D6`, `2× D20` Logo + Numbers) or apply built-in game set templates (*Classic RPG 7*, *Twin D20 Advantage 8*, *Coin + Twin D6/D20 10-Die Set*, *Catalan Rhombic 7*, *Crystal Barrel 7*, *DCC Weird Chain 10*, *Full 12-Shape Continuum*) with collision-free `.stl`/`.3mf` export filenames.
- **Complete 12-Shape Polyhedral Library (`D2` – `D20`):** Classic Platonic solids alongside 6 `D2` Coin silhouettes, `D3` barrels/prisms, 6 `D4` styles, odd-sided `D5`/`D7`/`D9` (*Trapezohedron 2×*, *Crystal Barrel 2×*, *Zocchi Prism 1×*), Catalan *Rhombic D12*, and faceted crystal/gem variants with calibrated upright face orientation and equatorial prism alignment.
- **Multi-Die Group Editing, Context Menus & Safe Delete Confirmation:** Select subsets via `All`, `RPG`, `Multi`, or `Ctrl/Shift+Click` across the rail and 3D tray; right-click (or `Shift+F10`) dice, faces, and `Faces: All` for instant batch edits, backed by confirmation gating before removing dice and 50-step Undo/Redo.
- **True `0.00 mm` Hard-Edge Precision & Watertight `manifold-3d` CAD Kernel:** Crease-split crisp facet viewport normals render exact `0.00 mm (Hard Edge)` edges accurately while exporting welded watertight `.stl` and `.3mf` meshes.
- **Matched Insert Blanks (`Insert X-Ray`), Supports & Cancellable Batch Export:** Automatic per-die inner blanks (`Blank = Master − 2 × (EngraveDepth + Clearance)`) with shell-breach verification, point-down fin & edge bumper MSLA supports anchored at `Z = 0`, and cancellable batch exports generating `Masters/`, `Blanks/`, and `Caliper_Specs.md` (with native folder export in Desktop and `.zip` download in web/preview).
- **Desktop Electron Architecture (`com.dicechaos.masters`):** Offline-first cross-platform builds with bundled TrueType fonts, automatic OS `.ttf`/`.otf` discovery, atomic `.dcproj` Save/Auto-Save, quit protection, drag-and-drop import, and Midnight-Sapphire Dark / Daylight Light themes.

---

### Beta Feedback, Companion Tools & Handmade Dice
Testing **Dice Chaos Masters** with your printer & resin setup? Let us know how it prints!
- **Report bugs / request features:** [GitHub Issues](https://github.com/dicechaos/DiceChaosMasters/issues)
- **Companion battlemap & world atlas cartography studio:** [Dice Chaos Maps](https://github.com/dicechaos/DiceChaosMaps)
- **Companion campaign mind-map studio:** [Dice Chaos Connections](https://github.com/dicechaos/DiceChaosConnections)
- **Companion 4K/8K TV battlemap studio:** [Dice Chaos Display](https://github.com/dicechaos/DiceChaosDisplay)
- **Handmade dice & tabletop tools:** [dicechaos.com](https://dicechaos.com)
