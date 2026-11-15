## Dice Chaos Masters — Public Beta (`v1.0.0-beta.3`)

Welcome to the latest **Public Beta** release of **Dice Chaos Masters** by **[Dice Chaos](https://dicechaos.com)**!

**Dice Chaos Masters** is a free, offline-first parametric 3D polyhedral dice master, matched insert blank, and MSLA resin support studio built to pair seamlessly alongside **[Dice Chaos Connections](https://github.com/dicechaos/DiceChaosConnections)** and **[Dice Chaos Display](https://github.com/dicechaos/DiceChaosDisplay)** in the **Dice Chaos Tabletop Suite**.

---

### Downloads
- **Windows (x64):**
  - **[dice-chaos-masters-1.0.0-beta.3-setup.exe](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.3/dice-chaos-masters-1.0.0-beta.3-setup.exe)** *(One-click installer — Recommended)*
  - **[dice-chaos-masters-1.0.0-beta.3-win-x64-portable.zip](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.3/dice-chaos-masters-1.0.0-beta.3-win-x64-portable.zip)** *(Portable zip — extract anywhere and run `DiceChaosMasters.exe`)*
- **macOS (Apple Silicon & Intel):**
  - **[dice-chaos-masters-1.0.0-beta.3-arm64.dmg](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.3/dice-chaos-masters-1.0.0-beta.3-arm64.dmg)** *(Apple Silicon disk image installer)*
  - **[dice-chaos-masters-1.0.0-beta.3-x64.dmg](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.3/dice-chaos-masters-1.0.0-beta.3-x64.dmg)** *(Intel disk image installer)*
  - **[dice-chaos-masters-1.0.0-beta.3-mac-arm64.zip](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.3/dice-chaos-masters-1.0.0-beta.3-mac-arm64.zip)** / **[dice-chaos-masters-1.0.0-beta.3-mac-x64.zip](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.3/dice-chaos-masters-1.0.0-beta.3-mac-x64.zip)**
- **Linux (x64):**
  - **[dice-chaos-masters-1.0.0-beta.3.AppImage](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.3/dice-chaos-masters-1.0.0-beta.3.AppImage)** *(Portable AppImage)*
  - **[dice-chaos-masters_1.0.0-beta.3_amd64.deb](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.3/dice-chaos-masters_1.0.0-beta.3_amd64.deb)** *(Debian / Ubuntu `.deb` package)*
- **SHA-256 Checksums:** Per-platform checksum manifests (`SHA256SUMS-Windows.txt`, `SHA256SUMS-macOS.txt`, `SHA256SUMS-Linux.txt`) generated directly from the release binaries are attached to this release.

> **OS Gatekeeper / SmartScreen Note:** Because Public Beta builds are not yet signed with a commercial code-signing certificates:
> - **Windows:** If *"Windows protected your PC"* appears on first launch, click **More info** -> **Run anyway**.
> - **macOS:** Right-click (or Control-click) the app -> **Open** on first launch.

---

### What's New in `v1.0.0-beta.3`
- **Multi-Instance Dice Sets & Quick Game Set Templates:** Add multiple instances of any die in one set (e.g., `2× D6` or `2× D20` Logo + Numbers pairs), duplicate/rename individual dice, and apply 1-click **Quick Game Set Templates** (*Classic RPG 7*, *Twin D20 Advantage 8*, *Coin + Twin D6/D20 10-Die Set*, *Catalan Rhombic 7*, *Crystal Barrel 7*, *DCC Weird Chain 10*, *Full 12-Shape Continuum*, and more) with collision-free STL/3MF export filenames.
- **Expanded 12-Shape Polyhedral Library & Silhouettes (`D2` – `D20`):** Added odd-sided `D5`, `D7`, and `D9` (*Trapezohedron 2×*, *Crystal Barrel 2×*, *Zocchi Prism 1×*), 6 `D2` Coin silhouettes (*Round*, *Oval*, *Rounded Square*, *Hexagon*, *Octagon*, *Shield Crest*), Catalan *Rhombic D12*, *Crystal Barrel* (`D6`, `D8`, `D10`, `D00`, `D12`), *Rhombic Diamond* & *Truncated Cube* (`D6`), and *Gem Shard* (`D8`).
- **Multi-Die Selection & Real-Time Group Editing:** Select subsets via `All`, `RPG 7`, `Multi` toggle, or `Ctrl/Cmd+Click` & `Shift+Click` in the left rail and 3D Full Set Tray; batch-edit relative scale (`%`) or uniform caliper size (`mm`), edge chamfer, blank clearance, and per-die Font / Engraving Depth / High-Face Emblem overrides, or export only the **Selected Group**.
- **Right-Click / Keyboard Context Menus & Safe Delete Confirmation:** Top-layer context menus (`Right-Click` / `Shift+F10`) for dice, individual faces, and the `Faces: All` bar (batch rotate `+90°`/`−90°`/`180°`, batch scale, center offsets, clear custom text/SVGs, High-Face Emblem mode, and full face override reset) with 3D canvas pan-drag protection and a confirmation dialog before removing dice.
- **Equatorial Prism Alignment & Full 12-Die Face Orientation Calibration:** Deterministic `Z = 0` equator number placement on `D4` *Crystal Shard* / *Arch* and crystal barrels, plus upright default face frames calibrated across `D20`, `D12`, `D8`, `D4` *Truncated*, `D5`/`D7`/`D9` prism caps, and vertical `D00 %`.
- **Cancellable Exports & Web/Preview `.ZIP` Packaging:** Added `Cancel Export` / `Esc` Web Worker abort and direct `JSZip` `.zip` download packaging (with an in-modal `Download .zip` link) for web/preview environments alongside native Electron folder exports.

### Core Studio Capabilities
- **2/3-Printed MSLA Master App Icon & Header Emblem:** Depicts the D20 master mid-print on its MSLA support raft with subtle resin layer striations, glowing UV cure horizon, and top `1/3` CAD blueprint wireframe.
- **Desktop Electron Studio Architecture (`com.dicechaos.masters`):** Offline-first cross-platform Electron builds with bundled TrueType display fonts, automatic OS `.ttf`/`.otf` font discovery, atomic `.dcproj` Save / Save As / Auto-Save, unsaved-changes quit protection, and window drag-and-drop (`.dcproj`, `.ttf`, `.otf`, `.svg`).
- **Complete 12-Shape Polyhedral Set (`D2` – `D20`):** Includes classic Platonic solids alongside `D2` coin silhouettes, `D3` barrels/prisms, 6 `D4` styles, odd-sided `D5`/`D7`/`D9`, `Rhombic D12`, and faceted crystal variants.
- **True `0.00 mm` Hard-Edge Precision & Watertight `manifold-3d` CAD Kernel:** Crease-split crisp facet viewport normals render exact `0.00 mm (Hard Edge)` edges accurately while exporting welded watertight `.stl` and `.3mf` meshes.
- **Matched Insert Blanks (`Insert X-Ray`) & Shell-Breach Guard:** Automatic per-die inner blanks (`BlankSize = MasterSize - 2 × (EngraveDepth + Clearance)`) with real-time boolean clearance verification before export.
- **Point-Down MSLA Resin Supports & Production Bundles:** Automated point-down fin & bumper support structures anchored at `Z = 0` plus batch exports generating `Masters/`, `Blanks/`, and `CALIPER_SPEC.md` with optional resin/silicone shrinkage compensation.
- **Midnight-Sapphire Dark & Daylight Light UI:** Responsive Suite header toolbar, 4 3D resin preview presets (**Master Grey**, **Arcane Sapphire**, **Cure Clear**, **Obsidian**), camera `Fit (F)` reset, unobstructed `Focus (\)` mode, 50-step coalesced Undo/Redo, 5-step interactive **Maker Tour**, and `?` / `F1` **Shortcuts & Dice Chaos Suite** guide.

---

### Beta Feedback, Companion Tools & Handmade Dice
Testing **Dice Chaos Masters** with your printer & resin setup? Let us know how it prints!
- **Report bugs / request features:** [GitHub Issues](https://github.com/dicechaos/DiceChaosMasters/issues)
- **Companion campaign mind-map studio:** [Dice Chaos Connections](https://github.com/dicechaos/DiceChaosConnections)
- **Companion 4K/8K TV battlemap studio:** [Dice Chaos Display](https://github.com/dicechaos/DiceChaosDisplay)
- **Handmade dice & tabletop tools:** [dicechaos.com](https://dicechaos.com)
