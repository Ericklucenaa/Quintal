# Gera os avatares do Quintal a partir dos personagens CC0 da Quaternius
# (Universal Base Characters). Para cada corpo (masculino e feminino):
#   * divide a pele em regiões (tronco, braços, pernas, pés) com as arestas separadas,
#     gravando a região num atributo de cor (o app esconde a pele coberta pela roupa);
#   * cria as roupas a partir dessas mesmas regiões (mesmo esqueleto, mesmos pesos),
#     infladas e suavizadas, mais saias e vestido feitos em cone com pesos transferidos;
#   * encaixa todos os cabelos, barba e sobrancelhas no mesmo esqueleto;
#   * exporta um .glb (texturas em WebP) para desktop/public/avatars.
# Uso: blender -b --python build_avatars.py
import bpy, bmesh, math, os
from mathutils import Vector

SRC = r"D:/Projetos/tools/downloads/quaternius/x/Universal Base Characters[Standard]/Universal Base Characters[Standard]/"
BODIES = SRC + "Base Characters/Godot - UE/"
HAIRS = SRC + "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/"
OUT = r"D:/Projetos/Concord/desktop/public/avatars/"
os.makedirs(OUT, exist_ok=True)

# Regiões da pele (o id vai no canal vermelho da cor do vértice: id / 16)
R = dict(HEAD=0, TORSO_UP=1, TORSO_MID=2, TORSO_LOW=3, HIP=4, UARM_A=5, UARM_B=6, LARM=7, HAND=8,
         THIGH_A=9, THIGH_B=10, CALF_A=11, CALF_B=12, FOOT=13)
TORSO = ['TORSO_UP', 'TORSO_MID', 'TORSO_LOW']
GARMENTS = {
    # nome: (regiões, folga em metros, suavização, grupo)
    'top_camiseta': (TORSO + ['UARM_A'], 0.011, 6, 'top'),
    'top_regata': (TORSO, 0.009, 6, 'top'),
    'top_cropped': (['TORSO_UP', 'TORSO_MID', 'UARM_A'], 0.009, 5, 'top'),
    'top_mangalonga': (TORSO + ['UARM_A', 'UARM_B', 'LARM'], 0.012, 6, 'top'),
    'top_moletom': (TORSO + ['UARM_A', 'UARM_B', 'LARM'], 0.024, 10, 'top'),
    'bottom_calca': (['HIP', 'THIGH_A', 'THIGH_B', 'CALF_A', 'CALF_B'], 0.012, 6, 'bottom'),
    'bottom_legging': (['HIP', 'THIGH_A', 'THIGH_B', 'CALF_A', 'CALF_B'], 0.006, 3, 'bottom'),
    'bottom_shorts': (['HIP', 'THIGH_A'], 0.013, 6, 'bottom'),
    'bottom_bermuda': (['HIP', 'THIGH_A', 'THIGH_B'], 0.014, 6, 'bottom'),
    'bottom_short_sob_saia': (['HIP'], 0.007, 3, 'bottom'),
    'shoes_tenis': (['FOOT'], 0.016, 4, 'shoes'),
    'shoes_bota': (['FOOT', 'CALF_B'], 0.016, 5, 'shoes'),
}
BONE_REGION = {
    'spine_03': 'TORSO_UP', 'clavicle_l': 'TORSO_UP', 'clavicle_r': 'TORSO_UP',
    'spine_02': 'TORSO_MID', 'spine_01': 'TORSO_LOW', 'pelvis': 'HIP',
    'lowerarm_l': 'LARM', 'lowerarm_r': 'LARM',
    'foot_l': 'FOOT', 'foot_r': 'FOOT', 'ball_l': 'FOOT', 'ball_r': 'FOOT',
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def region_for(bone_name, t, z=0.0, neck_split=99.0):
    if bone_name == 'neck_01':
        return 'TORSO_UP' if z < neck_split else 'HEAD'
    if bone_name == 'root':
        return 'HIP'
    if bone_name in BONE_REGION:
        return BONE_REGION[bone_name]
    if bone_name.startswith('upperarm'):
        return 'UARM_A' if t < 0.5 else 'UARM_B'
    if bone_name.startswith('thigh'):
        return 'THIGH_A' if t < 0.5 else 'THIGH_B'
    if bone_name.startswith('calf'):
        return 'CALF_A' if t < 0.5 else 'CALF_B'
    if bone_name.startswith(('hand', 'thumb', 'index', 'middle', 'ring', 'pinky')):
        return 'HAND'
    return 'HEAD'


def build(body_file, tag):
    reset()
    objs = import_gltf(BODIES + body_file)
    arm = next(o for o in objs if o.type == 'ARMATURE')
    body = max((o for o in objs if o.type == 'MESH' and o.vertex_groups), key=lambda o: len(o.data.vertices))
    for o in objs:
        if o.type == 'MESH' and not o.vertex_groups:
            bpy.data.objects.remove(o)  # esfera auxiliar
    body.name = 'Body'
    eyes = next((o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Eyes')), None)
    if eyes:
        eyes.name = 'Eyes'
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name.startswith('Eyebrows'):
            bpy.data.objects.remove(o)  # sobrancelhas entram como cabelo (trocáveis)

    bones = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones}
    group_names = {g.index: g.name for g in body.vertex_groups}
    me = body.data

    # normais atuais viram personalizadas (as costuras entre regiões ficam invisíveis)
    me.normals_split_custom_set_from_vertices([v.normal.copy() for v in me.vertices])

    def dominant(vs):
        acc = {}
        for v in vs:
            for g in v.groups:
                acc[g.group] = acc.get(g.group, 0) + g.weight
        if not acc:
            return 'HEAD'
        name = group_names[max(acc, key=acc.get)]
        return name

    # região de cada face (osso dominante + posição ao longo do osso)
    neck_split = bones['neck_01'][0].z + 0.035
    face_region = []
    for poly in me.polygons:
        vs = [me.vertices[i] for i in poly.vertices]
        bname = dominant(vs)
        c = body.matrix_world @ poly.center
        t = 0.0
        if bname in bones:
            h, tl = bones[bname]
            axis = tl - h
            if axis.length > 1e-6:
                t = max(0.0, min(1.0, (c - h).dot(axis) / axis.length_squared))
        face_region.append(R[region_for(bname, t, c.z, neck_split)])

    # filtro de maioria entre faces vizinhas: some com as ilhas (faces soltas na região errada)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    neigh = [[ln.index for e in f.edges for ln in e.link_faces if ln.index != f.index] for f in bm.faces]
    for _ in range(6):
        nxt = list(face_region)
        for i, ns in enumerate(neigh):
            if face_region[i] == R['HEAD'] and all(face_region[j] == R['HEAD'] for j in ns):
                continue
            counts = {}
            for j in ns:
                counts[face_region[j]] = counts.get(face_region[j], 0) + 1
            best = max(counts, key=counts.get) if counts else face_region[i]
            if counts.get(face_region[i], 0) < 2 and counts[best] >= 2:
                nxt[i] = best
        face_region = nxt
    layer = bm.faces.layers.int.new('region')
    for f, r in zip(bm.faces, face_region):
        f[layer] = r
    border = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0][layer] != e.link_faces[1][layer]]
    bmesh.ops.split_edges(bm, edges=border)
    bm.to_mesh(me)
    bm.free()

    # região por vértice (agora cada vértice pertence a uma região só)
    reg_vert = [0] * len(me.vertices)
    fl = me.attributes['region'].data
    for poly in me.polygons:
        for vi in poly.vertices:
            reg_vert[vi] = fl[poly.index].value
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, r in enumerate(reg_vert):
        col.data[i].color = (r / 16.0, 0.0, 0.0, 1.0)
    me.color_attributes.active_color = col
    me.color_attributes.active_color_index = 0
    me.color_attributes.render_color_index = 0
    me.attributes.remove(me.attributes['region'])

    cloth = bpy.data.materials.new('Cloth')
    cloth.use_nodes = True
    cloth.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.85

    def garment_from_regions(name, regions, offset, smooth_steps):
        ids = {R[x] for x in regions}
        g = body.copy()
        g.data = body.data.copy()
        g.name = name
        bpy.context.scene.collection.objects.link(g)
        gme = g.data
        bm = bmesh.new()
        bm.from_mesh(gme)
        colay = bm.verts.layers.float_color.get('Col')
        kill = [v for v in bm.verts if round(v[colay][0] * 16) not in ids]
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        # junta de novo as arestas que foram separadas (a roupa é uma peça contínua)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.normal_update()
        for v in bm.verts:
            v.co += v.normal * offset
        boundary = {v for e in bm.edges if e.is_boundary for v in e.verts}
        inner = [v for v in bm.verts if v not in boundary]
        orig = {v: (v.co.copy(), v.normal.copy()) for v in bm.verts}
        for _ in range(smooth_steps):
            bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        # a suavização encolhe a peça: garante a folga mínima sobre o corpo
        for v, (co, n) in orig.items():
            d = (v.co - (co - n * offset)).dot(n)
            if d < offset * 0.85:
                v.co += n * (offset * 0.85 - d)
        # barras sem serrilhado: suaviza a borda ao longo dela mesma
        nb = {v: [e.other_vert(v) for e in v.link_edges if e.is_boundary] for v in boundary}
        for _ in range(6):
            new = {}
            for v, ns in nb.items():
                if len(ns) == 2:
                    new[v] = v.co * 0.5 + (ns[0].co + ns[1].co) * 0.25
            for v, co in new.items():
                v.co = co
        # barra levemente para dentro (acabamento)
        bm.normal_update()
        bm.to_mesh(gme)
        bm.free()
        # normais suaves recalculadas para a peça (as do corpo ficaram para trás)
        gme.normals_split_custom_set_from_vertices([v.normal.copy() for v in gme.vertices])
        for a in list(gme.color_attributes):
            gme.color_attributes.remove(a)
        gme.materials.clear()
        gme.materials.append(cloth)
        for p in gme.polygons:
            p.use_smooth = True
        return g

    sole = bpy.data.materials.new('Sole')
    for name, (regions, offset, sm, _) in GARMENTS.items():
        g = garment_from_regions(name, regions, offset, sm)
        if name.startswith('shoes_'):
            gm = g.data
            gm.materials.append(sole)
            floor = min((g.matrix_world @ v.co).z for v in gm.vertices)
            for poly in gm.polygons:
                if (g.matrix_world @ poly.center).z < floor + 0.035:
                    poly.material_index = 1

    # saias e vestido: cone em volta do quadril, pesos copiados do corpo
    hip_z = bones['pelvis'][0].z
    knee_z = bones['calf_l'][0].z
    ankle_z = bones['foot_l'][0].z
    pts = [body.matrix_world @ v.co for v in me.vertices]

    def radius_at(z, band=0.03):
        sl = [p for p in pts if abs(p.z - z) < band and abs(p.x) < 0.36]
        if not sl:
            return 0.18, 0.0, 0.12
        rx = max(abs(p.x) for p in sl)
        cy = (min(p.y for p in sl) + max(p.y for p in sl)) / 2
        ry = (max(p.y for p in sl) - min(p.y for p in sl)) / 2
        # a elipse inscrita na caixa deixa os cantos de fora: aumenta até conter todos os pontos
        k = max(((p.x / rx) ** 2 + ((p.y - cy) / max(ry, 1e-3)) ** 2) for p in sl)
        f = math.sqrt(max(1.0, k))
        return rx * f, cy, ry * f

    def skirt(name, top_z, bottom_z, flare, extra=None):
        segs, rings = 32, 12
        rx0, cy0, ry0 = radius_at(top_z)
        bm = bmesh.new()
        grid = []
        prx, pry = rx0, ry0
        for j in range(rings):
            k = j / (rings - 1)
            z = top_z + (bottom_z - top_z) * k
            bx, _, by = radius_at(z, 0.04)
            prx = max(prx, bx + 0.035)
            pry = max(pry, by + 0.03)
            rx = max(prx, rx0 + 0.012 + flare * k)
            ry = max(pry, ry0 + 0.012 + flare * k * 0.9)
            ring = []
            for i in range(segs):
                a = 2 * math.pi * i / segs
                ring.append(bm.verts.new((math.sin(a) * rx, cy0 + math.cos(a) * ry, z)))
            grid.append(ring)
        for j in range(rings - 1):
            for i in range(segs):
                bm.faces.new((grid[j][i], grid[j][(i + 1) % segs], grid[j + 1][(i + 1) % segs], grid[j + 1][i]))
        mesh = bpy.data.meshes.new(name)
        bm.normal_update()
        bm.to_mesh(mesh)
        bm.free()
        ob = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(ob)
        for p in mesh.polygons:
            p.use_smooth = True
        mesh.materials.append(cloth)
        # pesos: do vértice do corpo mais próximo, suavizados (a saia acompanha as pernas)
        for g in body.vertex_groups:
            ob.vertex_groups.new(name=g.name)
        dt = ob.modifiers.new('dt', 'DATA_TRANSFER')
        dt.object = body
        dt.use_vert_data = True
        dt.data_types_verts = {'VGROUP_WEIGHTS'}
        dt.vert_mapping = 'POLYINTERP_NEAREST'
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.datalayout_transfer(modifier='dt')
        bpy.ops.object.modifier_apply(modifier='dt')
        # metade de cima da saia presa no quadril; perto da barra, mistura pelve e coxas
        pel = ob.vertex_groups['pelvis']
        for v in mesh.vertices:
            k = (top_z - v.co.z) / max(1e-6, top_z - bottom_z)
            pel.add([v.index], max(0.0, 1.0 - k * 1.4), 'ADD')
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
        ob.parent = arm
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
        if extra is not None:
            # junta com a parte de cima (vestido)
            bpy.ops.object.select_all(action='DESELECT')
            extra.select_set(True)
            ob.select_set(True)
            bpy.context.view_layer.objects.active = extra
            bpy.ops.object.join()
            extra.name = name
            return extra
        return ob

    waist_z = bones['spine_01'][0].z + 0.03
    skirt('skirt_saia', waist_z, hip_z - (hip_z - knee_z) * 0.62, 0.08)
    skirt('skirt_saialonga', waist_z, ankle_z + 0.12, 0.18)
    top = garment_from_regions('dress_tmp', TORSO, 0.01, 6)
    skirt('dress_vestido', bones['spine_01'][0].z + 0.02, knee_z - 0.05, 0.13, extra=top)

    # cabelos, barba e sobrancelhas: todos no mesmo esqueleto, ajustados à cabeça deste corpo
    head_here = bones['Head'][0]
    hair_mat = None
    for f in sorted(os.listdir(HAIRS)):
        if not f.endswith('.gltf'):
            continue
        new = import_gltf(HAIRS + f)
        harm = next(o for o in new if o.type == 'ARMATURE')
        hmesh = next(o for o in new if o.type == 'MESH' and o.vertex_groups)
        delta = head_here - (harm.matrix_world @ harm.data.bones['Head'].head_local)
        bpy.ops.object.select_all(action='DESELECT')
        hmesh.parent = None
        hmesh.matrix_world.translation += delta
        hmesh.select_set(True)
        bpy.context.view_layer.objects.active = hmesh
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        for m in hmesh.modifiers:
            hmesh.modifiers.remove(m)
        hmesh.parent = arm
        mod = hmesh.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
        hmesh.name = 'hair_' + f[:-5].replace('Hair_', '').replace('Eyebrows_', 'brows_').lower()
        for o in new:
            if o is not hmesh:
                bpy.data.objects.remove(o)
        if hair_mat is None:
            hair_mat = hmesh.data.materials[0]
            hair_mat.name = 'Hair'
        hmesh.data.materials.clear()
        hmesh.data.materials.append(hair_mat)

    # roupas presas ao esqueleto (as copiadas do corpo já têm o modificador)
    for o in bpy.data.objects:
        if o.type == 'MESH' and o is not body and o.parent != arm:
            o.parent = arm

    # texturas que não vieram no pacote (ex.: normal do cabelo) saem do material
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in list(mat.node_tree.nodes):
            if node.type == 'TEX_IMAGE' and (node.image is None or node.image.size[0] == 0):
                mat.node_tree.nodes.remove(node)

    out = OUT + f'avatar_{tag}.glb'
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', export_image_format='WEBP', export_image_quality=82,
        export_yup=True, export_skins=True, export_animations=False, export_morph=False,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_normals=True,
        export_apply=False, export_texcoords=True, export_tangents=False
    )
    print('EXPORTED', out, os.path.getsize(out))
    for o in bpy.data.objects:
        if o.type == 'MESH':
            print('  mesh', o.name, len(o.data.vertices))


build('Superhero_Male_FullBody.gltf', 'm')
build('Superhero_Female_FullBody.gltf', 'f')
