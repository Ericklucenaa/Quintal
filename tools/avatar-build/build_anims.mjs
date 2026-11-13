// Junta as animações usadas no Quintal (Universal Animation Library 1 e 2, CC0) num
// único .glb, com os ossos nos nomes do esqueleto dos corpos (padrão Unreal).
// Uso: node build_anims.mjs
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';

const X = 'D:/Projetos/tools/downloads/quaternius/x/';
const OUT = 'D:/Projetos/Concord/desktop/public/avatars/animations.glb';

const KEEP1 = {
  Idle_Loop: 'idle', Idle_Talking_Loop: 'talk', Walk_Loop: 'walk', Jog_Fwd_Loop: 'run', Sprint_Loop: 'sprint',
  Jump_Start: 'jump_start', Jump_Loop: 'jump_air', Jump_Land: 'jump_land',
  Sitting_Idle_Loop: 'sit', Sitting_Talking_Loop: 'sit_talk', Dance_Loop: 'dance',
  PickUp_Table: 'pick', Hit_Chest: 'hit', Interact: 'interact', Crouch_Idle_Loop: 'crouch'
};
const KEEP2 = {
  OverhandThrow: 'throw', Consume: 'drink', Yes: 'yes', Idle_No_Loop: 'no', Idle_FoldArms_Loop: 'fold_arms',
  Walk_Carry_Loop: 'carry', Hit_Knockback: 'knockback', Idle_TalkingPhone_Loop: 'phone'
};

// DEF-upper_arm.L → upperarm_l (nomes do Rigify para os do esqueleto dos corpos)
function ueName(n) {
  let m = n.replace(/^DEF-/, '');
  let side = '';
  const sm = m.match(/^(.*)\.(L|R)$/);
  if (sm) {
    m = sm[1];
    side = sm[2] === 'L' ? '_l' : '_r';
  }
  const fixed = {
    head: 'Head', neck: 'neck_01', hand: 'hand', forearm: 'lowerarm', upper_arm: 'upperarm', shoulder: 'clavicle',
    toe: 'ball', foot: 'foot', shin: 'calf', thigh: 'thigh', hips: 'pelvis',
    'spine.001': 'spine_01', 'spine.002': 'spine_02', 'spine.003': 'spine_03'
  };
  if (fixed[m]) return fixed[m] + side;
  const f = m.match(/^(?:f_)?(index|middle|pinky|ring|thumb)\.0(\d)$/);
  if (f) return `${f[1]}_0${f[2]}${side}`;
  return m;
}

const io = new NodeIO();

async function trimmed(path, keep, rename) {
  const doc = await io.read(path);
  const root = doc.getRoot();
  root.listAnimations().forEach((a) => {
    if (!keep[a.getName()]) a.dispose();
    else a.setName(keep[a.getName()]);
  });
  // sem malhas (só o esqueleto e as animações) e sem mover a raiz pelo mapa
  root.listMeshes().forEach((m) => m.dispose());
  root.listSkins().forEach((s) => s.dispose());
  root.listNodes().forEach((n) => {
    if (rename) n.setName(ueName(n.getName()));
  });
  root.listAnimations().forEach((a) => a.listChannels().forEach((c) => {
    const n = c.getTargetNode();
    if (n && n.getName() === 'root' && c.getTargetPath() === 'translation') c.dispose();
  }));
  await doc.transform(resample(), prune(), dedup());
  return doc;
}

const a = await trimmed(X + 'ual1/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb', KEEP1, true);
const b = await trimmed(X + 'ual2/Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb', KEEP2, false);

// junta as animações do segundo arquivo no primeiro (mesmo esqueleto, mesmos nomes)
const nodesA = new Map(a.getRoot().listNodes().map((n) => [n.getName(), n]));
const bufA = a.getRoot().listBuffers()[0];
for (const anim of b.getRoot().listAnimations()) {
  const na = a.createAnimation(anim.getName());
  for (const ch of anim.listChannels()) {
    const target = nodesA.get(ch.getTargetNode()?.getName());
    if (!target) continue;
    const s = ch.getSampler();
    const input = a.createAccessor().setArray(s.getInput().getArray().slice()).setType('SCALAR').setBuffer(bufA);
    const output = a.createAccessor().setArray(s.getOutput().getArray().slice()).setType(s.getOutput().getType()).setBuffer(bufA);
    const sampler = a.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
    na.addSampler(sampler).addChannel(a.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
}
await a.transform(prune(), dedup());
await io.write(OUT, a);
const names = a.getRoot().listAnimations().map((x) => x.getName());
console.log('animations', names.length, names.join(' '));
