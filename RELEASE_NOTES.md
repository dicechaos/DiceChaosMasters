## Dice Chaos Masters — Public Beta (`v1.0.0-beta.1`)

Welcome to the first **Public Beta** release of **Dice Chaos Masters** by **[Dice Chaos](https://dicechaos.com)**!

**Dice Chaos Masters** is a free, offline-first parametric 3D polyhedral dice master, matched insert blank, and MSLA resin support studio built to pair seamlessly alongside **[Dice Chaos Connections](https://github.com/dicechaos/DiceChaosConnections)** and **[Dice Chaos Display](https://github.com/dicechaos/DiceChaosDisplay)** in the **Dice Chaos Tabletop Suite**.

---

### Downloads
- **Windows (x64):**
  - **[dice-chaos-masters-1.0.0-beta.1-setup.exe](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.1/dice-chaos-masters-1.0.0-beta.1-setup.exe)** *(One-click installer — Recommended)*
  - **[dice-chaos-masters-1.0.0-beta.1-win-x64-portable.zip](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.1/dice-chaos-masters-1.0.0-beta.1-win-x64-portable.zip)** *(Portable zip — extract anywhere and run `DiceChaosMasters.exe`)*
- **macOS (Apple Silicon & Intel):**
  - **[dice-chaos-masters-1.0.0-beta.1-arm64.dmg](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.1/dice-chaos-masters-1.0.0-beta.1-arm64.dmg)** *(Apple Silicon disk image installer)*
  - **[dice-chaos-masters-1.0.0-beta.1-x64.dmg](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.1/dice-chaos-masters-1.0.0-beta.1-x64.dmg)** *(Intel disk image installer)*
  - **[dice-chaos-masters-1.0.0-beta.1-mac-arm64.zip](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.1/dice-chaos-masters-1.0.0-beta.1-mac-arm64.zip)** / **[dice-chaos-masters-1.0.0-beta.1-mac-x64.zip](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.1/dice-chaos-masters-1.0.0-beta.1-mac-x64.zip)**
- **Linux (x64):**
  - **[dice-chaos-masters-1.0.0-beta.1.AppImage](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.1/dice-chaos-masters-1.0.0-beta.1.AppImage)** *(Portable AppImage)*
  - **[dice-chaos-masters_1.0.0-beta.1_amd64.deb](https://github.com/dicechaos/DiceChaosMasters/releases/download/v1.0.0-beta.1/dice-chaos-masters_1.0.0-beta.1_amd64.deb)** *(Debian / Ubuntu `.deb` package)*
- **SHA-256 Checksums:** Per-platform checksum manifests (`SHA256SUMS-Windows.txt`, `SHA256SUMS-macOS.txt`, `SHA256SUMS-Linux.txt`) generated directly from the release binaries are attached to this release.

> **OS Gatekeeper / SmartScreen Note:** Because Public Beta builds are not yet signed with commercial code-signing certificates:
> - **Windows:** If *"Windows protected your PC"* appears on first launch, click **More info** -> **Run anyway**.
> - **macOS:** Right-click (or Control-click) the app -> **Open** on first launch.

---

### What's Inside `v1.0.0-beta.1`
- **Desktop Electron Studio Architecture (`com.dicechaos.masters`):** Offline-first cross-platform Electron builds with bundled TrueType display fonts, automatic OS `.ttf`/`.otf` font discovery, atomic `.dcproj` Save / Save As / Auto-Save, unsaved-changes quit protection, and window drag-and-drop (`.dcproj`, `.ttf`, `.otf`, `.svg`).
- **Complete Polyhedral Set & Variants (`D2` – `D20`):** Craft `D2` Coins, `D3` (*Truncated Barrel* & *Rounded Prism*), `D4` (6 variants: *Crystal Shard*, *Arch / Barrel*, *Pendulum Drop*, *Truncated Tet*, *Classic Vertex*, *Classic Base*), `D6`, `D8`, `D10` (`0–9` / `1–10`), `D00` (`horizontal` / `vertical`), `D12`, and `D20` (*Balanced* / *Spindown*).
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
