# DP-41 Blender studio

`build_scene.py` builds `DP-41_studio.blend` from `cad/dp41_hi.glb` (Rev F STEP, high-detail tessellation, mm).

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P build_scene.py -- --preview
```

`--preview` also writes three 960×540, 64-sample stills to `previews/` for a look check. Full sequences are not rendered.

## What the script sets up

- **Geometry:** tessellation seams welded, smooth shading by angle, edge breaks via Bevel modifiers (0.008–0.05 mm per part; the skeleton frame, seconds disc and printed parts stay sharp). Applied indices get separate lume inserts.
- **Materials (CMF Rev A):** green PVD case with a mirror top and satin flanks (F02/F03), mirror bezel and crown (F02), circular caseback, concentric-satin index and inner ring (F04), Côtes de Genève dial with vertical brushing (F01), same-batch plaque, polished hands with a satin minute ring, linear-satin key-bridge (F03), bead-blast seconds disc, ivory lume with a green night-glow switch (F09, emission strength), pad-printed ticks (F10), AR sapphire, factory movement (F11).
- **Studio:** light-grey seamless sweep, key softbox, rear top fill, two strip lights for long highlights, a kicker.
- **Cameras:** `CAM_hero` (three-quarter), `CAM_explode`, `CAM_virtues` (near-frontal product shot).
- **Animation:** frames 1–120 explode the watch (same stack as the website, spread 1.22) while lifting it above the floor.
- **Render:** Cycles on OptiX (RTX 5070 Ti), 512 adaptive samples, denoised, AgX, 1920×1080 PNG to `renders/explode/`.

## Still needed for Seiko-level stills

- Strap and bracelet geometry: needs the strap drawing (thickness, taper, keeper, buckle).
- A detailed Miyota 82S5 model; the movement is currently photo-textured faces on the envelope.
- Art direction: 2–3 reference shots for lighting and backdrop.
- Hero framing with the strap, and turntable and camera moves for the scroll sequences.
