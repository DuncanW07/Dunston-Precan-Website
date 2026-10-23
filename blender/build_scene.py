"""Dunston Precan DP-41 studio scene.

Builds a Cycles studio from the Rev F CAD export (cad/dp41_hi.glb):
  * merges tessellation seams and rounds edges (CAD has razor edges; drawings call for
    0.02-0.05 mm edge breaks), with per-part widths
  * CMF Rev A materials: F01 vertical dial brush, F02 mirror polish, F03 linear satin,
    F04 concentric satin, F09 flush lume (ivory day / green night), F10 pad print,
    F11 factory movement finish. Colors follow the Discipline product photos.
  * Seiko-style studio: seamless light-grey sweep, large softboxes and thin strip lights
    that draw long highlights along polished steel
  * cameras: CAM_hero, CAM_explode, CAM_virtues; explode animation on frames 1-120
  * Cycles + OptiX, AgX, 1920x1080, output paths set but nothing rendered

Run:  blender -b -P build_scene.py -- [--preview]
--preview renders three small low-sample stills to previews/ for a look check.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
CAD = os.path.join(HERE, "cad", "dp41_hi.glb")
OUT_BLEND = os.path.join(HERE, "DP-41_studio.blend")
PREVIEW = "--preview" in sys.argv
MM = 0.001  # scene is in meters; CAD is in mm

# --------------------------------------------------------------------------- palette
# Colors from the Discipline photos; finishes and lume/strap/thread values from the CMF.
P = dict(
    coating=(0.023, 0.10, 0.052),   # green PVD over 316L
    dial_a=(0.023, 0.145, 0.068),   # British Racing Green, lighter stripe
    dial_b=(0.015, 0.098, 0.046),   # darker stripe
    steel=(0.42, 0.44, 0.46),       # M01 #C4C8CC, toned for a bright studio
    steel_bright=(0.75, 0.77, 0.79),
    lume=(0.86, 0.76, 0.53),        # A01 #EFE2C0 (linear)
    lume_glow=(0.55, 0.95, 0.65),
    paint=(0.008, 0.009, 0.010),
    base=(0.006, 0.012, 0.008),
)

def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

# --------------------------------------------------------------------------- reset & import
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.length_unit = "MILLIMETERS"

bpy.ops.import_scene.gltf(filepath=CAD)
parts = {o.name.split(".")[0]: o for o in bpy.context.scene.objects if o.type == "MESH"}
print("imported parts:", len(parts))

# --------------------------------------------------------------------------- applied index lume inserts
# Same construction as the site: shrink each index toward its own center on the sloped ring
# and lift a hair, so the lume sits flush inside a polished frame.
def lume_inserts(src):
    me = src.data.copy()
    bm = bmesh.new(); bm.from_mesh(me)
    step = math.pi / 6; slope = (1.96 - 1.16) / (15.9 - 12.87)
    key = lambda v: round(math.atan2(v.co.y, v.co.x) / step)
    sums = {}
    for v in bm.verts:
        k = key(v); s = sums.setdefault(k, [0, 0, 0]); s[0] += v.co.x; s[1] += v.co.y; s[2] += 1
    for v in bm.verts:
        k = key(v); s = sums[k]; a = k * step
        cx, cy = s[0] / s[2], s[1] / s[2]
        ur = (math.cos(a), math.sin(a)); ut = (-ur[1], ur[0])
        dx, dy = v.co.x - cx, v.co.y - cy
        dr = dx * ur[0] + dy * ur[1]; dt = dx * ut[0] + dy * ut[1]
        dr2, dt2 = dr * 0.8, dt * 0.56
        v.co.x = cx + ur[0] * dr2 + ut[0] * dt2
        v.co.y = cy + ur[1] * dr2 + ut[1] * dt2
        v.co.z += (dr2 - dr) * slope + 0.012
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("13b_index_lume", me)
    bpy.context.collection.objects.link(ob)
    ob.matrix_world = src.matrix_world.copy()
    return ob

parts["13b_index_lume"] = lume_inserts(parts["13_hour_markers_and_tabs"])

# --------------------------------------------------------------------------- seams + edge breaks
BEVEL = {  # mm; None = leave sharp (thin printed or paint parts)
    "01_case_middle": 0.05, "02_bezel": 0.02, "03_crystal": 0.08, "05_inner_ring_rehaut": 0.02,
    "06_caseback": 0.04, "07_caseback_window": 0.05, "09_crown_and_tube": 0.03,
    "10_dial_L1_base": 0.02, "11_dial_L2_centre_field": 0.015, "12_dial_L3_index_ring": 0.02,
    "13_hour_markers_and_tabs": 0.02, "13b_index_lume": None, "14_minute_ticks": None,
    "15_plaque": 0.03, "16_wordmark_applique": 0.008, "17_skeleton_frame_and_AUTOMATIC_bridge": None,  # fretwork too fine to bevel cleanly
    "18_hour_hand": 0.008, "19_minute_hand": 0.008, "20_seconds_disc": None,
    "21_seconds_disc_paint_fill": None, "04_crystal_gasket": 0.03, "08_movement_ring": 0.03,
    "99_movement_82S5_envelope_REFERENCE": 0.05,
}
for name, ob in parts.items():
    bpy.context.view_layer.objects.active = ob
    me = ob.data
    if me.has_custom_normals:
        bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True)
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0006)  # weld tessellation seams (mm)
    bm.to_mesh(me); bm.free()
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(32))
    w = BEVEL.get(name, 0.02)
    if w:
        m = ob.modifiers.new("edge break", "BEVEL")
        m.width = w; m.segments = 3; m.limit_method = "ANGLE"; m.angle_limit = math.radians(32)
        m.harden_normals = True; m.use_clamp_overlap = True; m.miter_outer = "MITER_ARC"

# --------------------------------------------------------------------------- materials
def mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled"); b.location = (300, 0)
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    return m, nt, b

def metal(name, color, rough, aniso=0.0, tangent=None, coat=0.0):
    m, nt, b = mat(name)
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Metallic"].default_value = 1
    b.inputs["Roughness"].default_value = rough
    if aniso:
        b.inputs["Anisotropic"].default_value = aniso
        t = nt.nodes.new("ShaderNodeTangent"); t.location = (0, -300)
        if tangent == "radial":
            t.direction_type = "RADIAL"; t.axis = "Z"  # concentric brushing around the dial axis
            nt.links.new(t.outputs["Tangent"], b.inputs["Tangent"])
        elif tangent is not None:
            c = nt.nodes.new("ShaderNodeCombineXYZ"); c.location = (0, -300)
            c.inputs[0].default_value, c.inputs[1].default_value, c.inputs[2].default_value = tangent
            nt.links.new(c.outputs[0], b.inputs["Tangent"]); nt.nodes.remove(t)
    if coat:
        b.inputs["Coat Weight"].default_value = coat; b.inputs["Coat Roughness"].default_value = 0.03
    return m, nt, b

def grain_bump(nt, b, scale_xyz, strength):
    """Fine brushing scratches: noise stretched along the lay, driving a bump."""
    tc = nt.nodes.new("ShaderNodeTexCoord"); tc.location = (-800, -500)
    mp = nt.nodes.new("ShaderNodeMapping"); mp.location = (-600, -500)
    mp.inputs["Scale"].default_value = scale_xyz
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.location = (-400, -500)
    nz.inputs["Scale"].default_value = 1.0; nz.inputs["Detail"].default_value = 8
    bp = nt.nodes.new("ShaderNodeBump"); bp.location = (-150, -500)
    bp.inputs["Strength"].default_value = strength; bp.inputs["Distance"].default_value = 0.004
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    nt.links.new(nz.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])

def zoned(m, nt, b, flat_rough, side_rough):
    """F02 polished top faces vs F03 satin flanks, picked from the surface normal."""
    g = nt.nodes.new("ShaderNodeNewGeometry"); g.location = (-600, 200)
    sp = nt.nodes.new("ShaderNodeSeparateXYZ"); sp.location = (-420, 200)
    mr = nt.nodes.new("ShaderNodeMapRange"); mr.location = (-220, 200)
    mr.inputs["From Min"].default_value = 0.45; mr.inputs["From Max"].default_value = 0.8
    mr.inputs["To Min"].default_value = side_rough; mr.inputs["To Max"].default_value = flat_rough
    vt = nt.nodes.new("ShaderNodeVectorTransform"); vt.location = (-520, 300)
    vt.vector_type = "NORMAL"; vt.convert_from = "WORLD"; vt.convert_to = "OBJECT"
    nt.links.new(g.outputs["Normal"], vt.inputs["Vector"])
    nt.links.new(vt.outputs["Vector"], sp.inputs["Vector"])
    nt.links.new(sp.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], b.inputs["Roughness"])

M = {}
# case middle: green PVD, mirror top and lugs, horizontally brushed flanks
m, nt, b = metal("case PVD green", P["coating"], 0.05, aniso=0.7, tangent="radial", coat=0.5)
zoned(m, nt, b, 0.04, 0.26); M["case"] = m
M["polished_pvd"], _, _ = metal("bezel+crown PVD green F02", P["coating"], 0.035, coat=0.6)
m, nt, b = metal("caseback PVD circular", P["coating"], 0.22, aniso=0.8, tangent="radial"); M["caseback"] = m
m, nt, b = metal("index ring F04 M01", P["steel"], 0.3, aniso=0.85, tangent="radial")
grain_bump(nt, b, (9, 9, 9), 0.15); M["ring"] = m
m, nt, b = metal("frame bridge F03 M01", P["steel"], 0.28, aniso=0.75, tangent=(1, 0, 0))
grain_bump(nt, b, (0.4, 60, 0.4), 0.2); M["frame"] = m
M["polished_steel"], _, _ = metal("polished steel F02", P["steel_bright"], 0.03)
m, nt, b = metal("minute hand ring F04 + polished bevels", P["steel_bright"], 0.18, aniso=0.8, tangent="radial")
zoned(m, nt, b, 0.18, 0.03); M["minute"] = m
M["bead"], _, _ = metal("seconds disc bead blast", (0.62, 0.63, 0.64), 0.45)

# dial: Côtes de Genève stripes (2.50 mm pitch) with F01 vertical brushing, 12 to 6
m, nt, b = mat("dial F01 British Racing Green")
tc = nt.nodes.new("ShaderNodeTexCoord"); tc.location = (-900, 0)
sx = nt.nodes.new("ShaderNodeSeparateXYZ"); sx.location = (-700, 0)
mth = nt.nodes.new("ShaderNodeMath"); mth.location = (-500, 0); mth.operation = "PINGPONG"
mth.inputs[1].default_value = 2.5  # one stripe = 2.5 mm, alternating (object space is mm)
rmp = nt.nodes.new("ShaderNodeMapRange"); rmp.location = (-320, 0)
rmp.inputs["From Min"].default_value = 0.0; rmp.inputs["From Max"].default_value = 2.5
mix = nt.nodes.new("ShaderNodeMix"); mix.location = (-120, 0); mix.data_type = "RGBA"
mix.inputs["A"].default_value = (*P["dial_b"], 1); mix.inputs["B"].default_value = (*P["dial_a"], 1)
nt.links.new(tc.outputs["Object"], sx.inputs["Vector"]); nt.links.new(sx.outputs["X"], mth.inputs[0])
nt.links.new(mth.outputs[0], rmp.inputs["Value"]); nt.links.new(rmp.outputs["Result"], mix.inputs["Factor"])
nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
b.inputs["Metallic"].default_value = 0.35; b.inputs["Roughness"].default_value = 0.3
b.inputs["Anisotropic"].default_value = 0.75
c = nt.nodes.new("ShaderNodeCombineXYZ"); c.inputs[1].default_value = 1; nt.links.new(c.outputs[0], b.inputs["Tangent"])
b.inputs["Coat Weight"].default_value = 0.3; b.inputs["Coat Roughness"].default_value = 0.08
grain_bump(nt, b, (60, 0.4, 0.4), 0.25); M["dial"] = m
m, nt, b = mat("plaque F01 same batch"); b.inputs["Base Color"].default_value = (*P["dial_a"], 1)
b.inputs["Metallic"].default_value = 0.35; b.inputs["Roughness"].default_value = 0.28; b.inputs["Anisotropic"].default_value = 0.7
c = nt.nodes.new("ShaderNodeCombineXYZ"); c.inputs[1].default_value = 1; nt.links.new(c.outputs[0], b.inputs["Tangent"])
grain_bump(nt, b, (60, 0.4, 0.4), 0.25); M["plaque"] = m

m, nt, b = mat("lume F09 A01")  # ivory by day; emission strength is the night switch
b.inputs["Base Color"].default_value = (*P["lume"], 1); b.inputs["Roughness"].default_value = 0.55
b.inputs["Emission Color"].default_value = (*P["lume_glow"], 1); b.inputs["Emission Strength"].default_value = 0.0
M["lume"] = m
m, nt, b = mat("ticks F10 pad print"); b.inputs["Base Color"].default_value = (*P["lume"], 1); b.inputs["Roughness"].default_value = 0.6; M["ticks"] = m
m, nt, b = mat("paint fill"); b.inputs["Base Color"].default_value = (*P["paint"], 1); b.inputs["Roughness"].default_value = 0.5; M["paint"] = m
m, nt, b = mat("dial base"); b.inputs["Base Color"].default_value = (*P["base"], 1); b.inputs["Roughness"].default_value = 0.6; M["base"] = m
m, nt, b = mat("sapphire AR")  # AR coated: low reflectance, clear
b.inputs["Base Color"].default_value = (1, 1, 1, 1); b.inputs["Roughness"].default_value = 0.0
b.inputs["Transmission Weight"].default_value = 1.0; b.inputs["IOR"].default_value = 1.77
b.inputs["Specular IOR Level"].default_value = 0.05; M["glass"] = m
m, nt, b = mat("gasket rubber"); b.inputs["Base Color"].default_value = (0.01, 0.01, 0.01, 1); b.inputs["Roughness"].default_value = 0.7; M["rubber"] = m
m, nt, b = mat("movement ring POM"); b.inputs["Base Color"].default_value = (0.04, 0.045, 0.05, 1); b.inputs["Roughness"].default_value = 0.55; M["pom"] = m

# movement: F11 factory finish, photographed plates projected on the faces
m, nt, b = mat("movement 82S5 F11")
tc = nt.nodes.new("ShaderNodeTexCoord"); tc.location = (-1100, 0)
mp = nt.nodes.new("ShaderNodeMapping"); mp.location = (-900, 0)
mp.inputs["Location"].default_value = (0.5, 0.5, 0); mp.inputs["Scale"].default_value = (1 / 26, 1 / 26, 1)  # 26 mm movement
front = nt.nodes.new("ShaderNodeTexImage"); front.location = (-650, 150)
front.image = bpy.data.images.load(os.path.join(HERE, "cad", "movement-front.png"))
back = nt.nodes.new("ShaderNodeTexImage"); back.location = (-650, -150)
back.image = bpy.data.images.load(os.path.join(HERE, "cad", "movement-back.png"))
g = nt.nodes.new("ShaderNodeNewGeometry"); g.location = (-650, -400)
sp = nt.nodes.new("ShaderNodeSeparateXYZ"); sp.location = (-450, -400)
gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = 0; gt.location = (-300, -400)
mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.location = (-150, 0)
for n in (front, back): nt.links.new(mp.outputs["Vector"], n.inputs["Vector"])
nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
nt.links.new(g.outputs["Normal"], sp.inputs["Vector"]); nt.links.new(sp.outputs["Z"], gt.inputs[0])
nt.links.new(gt.outputs[0], mx.inputs["Factor"])
nt.links.new(back.outputs["Color"], mx.inputs["A"]); nt.links.new(front.outputs["Color"], mx.inputs["B"])
nt.links.new(mx.outputs["Result"], b.inputs["Base Color"])
b.inputs["Metallic"].default_value = 0.7; b.inputs["Roughness"].default_value = 0.3; M["movement"] = m

ASSIGN = {
    "01_case_middle": "case", "02_bezel": "polished_pvd", "09_crown_and_tube": "polished_pvd",
    "06_caseback": "caseback", "03_crystal": "glass", "07_caseback_window": "glass",
    "04_crystal_gasket": "rubber", "05_inner_ring_rehaut": "ring", "08_movement_ring": "pom",
    "10_dial_L1_base": "base", "11_dial_L2_centre_field": "dial", "12_dial_L3_index_ring": "ring",
    "13_hour_markers_and_tabs": "polished_steel", "13b_index_lume": "lume", "14_minute_ticks": "ticks",
    "15_plaque": "plaque", "16_wordmark_applique": "polished_steel",
    "17_skeleton_frame_and_AUTOMATIC_bridge": "frame", "18_hour_hand": "polished_steel",
    "19_minute_hand": "minute", "20_seconds_disc": "bead", "21_seconds_disc_paint_fill": "paint",
    "99_movement_82S5_envelope_REFERENCE": "movement",
}
for name, ob in parts.items():
    ob.data.materials.clear(); ob.data.materials.append(M[ASSIGN.get(name, "polished_steel")])

# --------------------------------------------------------------------------- watch rig (meters)
rig = bpy.data.objects.new("DP41", None); bpy.context.collection.objects.link(rig)
for ob in parts.values():
    ob.parent = rig
rig.scale = (MM, MM, MM)

# explode animation, frames 1-120 (same stack as the site: dz in mm x1.22, centered)
EXPLODE = [
    (["03_crystal", "04_crystal_gasket"], 60), (["02_bezel"], 50), (["05_inner_ring_rehaut"], 43),
    (["12_dial_L3_index_ring", "13_hour_markers_and_tabs", "13b_index_lume", "14_minute_ticks"], 36),
    (["19_minute_hand"], 29), (["18_hour_hand"], 24), (["16_wordmark_applique", "15_plaque"], 18),
    (["17_skeleton_frame_and_AUTOMATIC_bridge"], 12), (["20_seconds_disc", "21_seconds_disc_paint_fill"], 7),
    (["11_dial_L2_centre_field"], 2), (["10_dial_L1_base"], -2),
    (["99_movement_82S5_envelope_REFERENCE", "08_movement_ring"], -12), (["01_case_middle"], -26),
    (["09_crown_and_tube"], -26), (["06_caseback", "07_caseback_window"], -40),
]
SPREAD, CENTER = 1.22, 12
# lift the whole watch as it opens so the lowest part (caseback) stays above the studio floor
rig.location = (0, 0, 0); rig.keyframe_insert("location", frame=1)
rig.location = (0, 0, 0.064); rig.keyframe_insert("location", frame=120)
for names, dz in EXPLODE:
    for n in names:
        ob = parts[n]
        ob.location = (0, 0, 0); ob.keyframe_insert("location", frame=1)
        ob.location = ((16 if n.startswith("09_") else 0), 0, dz * SPREAD - CENTER)
        ob.keyframe_insert("location", frame=120)
        for fc in (ob.animation_data.action.fcurves if hasattr(ob.animation_data.action, "fcurves") else []):
            for k in fc.keyframe_points: k.interpolation = "BEZIER"; k.easing = "EASE_IN_OUT"

# --------------------------------------------------------------------------- studio
world = bpy.data.worlds.new("studio"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]; bg.inputs["Color"].default_value = (0.62, 0.63, 0.64, 1); bg.inputs["Strength"].default_value = 0.08

# seamless sweep backdrop (Seiko-style light grey)
bpy.ops.mesh.primitive_plane_add(size=1); sweep = bpy.context.active_object; sweep.name = "sweep"
bm = bmesh.new(); bm.from_mesh(sweep.data)
bmesh.ops.delete(bm, geom=bm.verts[:], context="VERTS")
prof = [(0, -0.6, -0.03)] + [(0, 0.25 + 0.2 * math.sin(a), -0.03 + 0.2 - 0.2 * math.cos(a)) for a in [i * math.pi / 2 / 12 for i in range(13)]] + [(0, 0.45, 0.6)]
rows = []
for x in (-0.8, 0.8):
    rows.append([bm.verts.new((x, y, z)) for _, y, z in prof])
for i in range(len(prof) - 1):
    bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
bm.to_mesh(sweep.data); bm.free()
for p in sweep.data.polygons: p.use_smooth = True
m, nt, b = mat("backdrop"); b.inputs["Base Color"].default_value = (0.42, 0.42, 0.43, 1); b.inputs["Roughness"].default_value = 0.85
sweep.data.materials.append(m)
sweep.location.z = -0.0075  # watch rests just above the floor

def area(name, size, loc, power, color=(1, 1, 1), shape="RECTANGLE"):
    d = bpy.data.lights.new(name, "AREA"); d.shape = shape
    d.size, d.size_y = size; d.energy = power; d.color = color
    o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o
area("key softbox", (0.30, 0.18), (-0.22, -0.18, 0.28), 3.2, (1.0, 0.97, 0.93))
area("top fill", (0.5, 0.3), (0.0, 0.32, 0.38), 1.4)  # behind the watch, out of the crystal's mirror angle
area("strip left", (0.03, 0.45), (-0.26, 0.05, 0.10), 1.6, (0.96, 0.98, 1.0))
area("strip right", (0.03, 0.45), (0.26, 0.02, 0.12), 1.8, (0.96, 0.98, 1.0))
area("kicker", (0.12, 0.12), (0.12, 0.30, 0.18), 0.8)

# --------------------------------------------------------------------------- cameras
def camera(name, loc, target, lens, fstop):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.clip_start = 0.002; cd.clip_end = 10
    cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
    co = bpy.data.objects.new(name, cd); bpy.context.collection.objects.link(co)
    co.location = loc
    co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cd.dof.focus_distance = (Vector(target) - Vector(loc)).length
    return co
cam_hero = camera("CAM_hero", (0.09, -0.17, 0.17), (0.0, 0.002, 0.0), 100, 8)
cam_ex = camera("CAM_explode", (0.27, -0.55, 0.26), (0.0, 0.0, 0.06), 85, 11)
cam_vir = camera("CAM_virtues", (0.0, -0.075, 0.32), (0.0, 0.0, 0.0), 120, 11)  # a few degrees off axis, as product shots are
scene.camera = cam_hero

# --------------------------------------------------------------------------- render settings
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for dev_type in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = dev_type; prefs.get_devices()
        if any(d.type == dev_type for d in prefs.devices):
            for d in prefs.devices: d.use = d.type == dev_type
            scene.cycles.device = "GPU"; print("render device:", dev_type); break
    except Exception as e:
        print("device", dev_type, "unavailable:", e)
scene.cycles.samples = 512
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 16; scene.cycles.glossy_bounces = 8; scene.cycles.transmission_bounces = 12
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.view_settings.view_transform = "AgX"
try: scene.view_settings.look = "AgX - Medium High Contrast"
except Exception: pass
scene.frame_start, scene.frame_end = 1, 120
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = os.path.join(HERE, "renders", "explode", "frame_")

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print("saved", OUT_BLEND)

# --------------------------------------------------------------------------- quick look (optional)
if PREVIEW:
    os.makedirs(os.path.join(HERE, "previews"), exist_ok=True)
    scene.cycles.samples = 64
    scene.render.resolution_x, scene.render.resolution_y = 960, 540
    for cam, frame, fn in ((cam_hero, 1, "hero"), (cam_ex, 120, "explode"), (cam_vir, 1, "virtues")):
        scene.camera = cam; scene.frame_set(frame)
        scene.render.filepath = os.path.join(HERE, "previews", fn + ".png")
        bpy.ops.render.render(write_still=True)
        print("preview", fn)
