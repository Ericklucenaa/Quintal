// Client-side mirror of the checks in firestore.rules. The rules are the real
// enforcement; these only decide what the UI offers.

export const ROLE_ORDER = ['member', 'moderator', 'admin', 'owner'];

export const ROLE_LABELS = {
  owner: 'Dono',
  admin: 'Admin',
  moderator: 'Moderador',
  member: 'Membro'
};

export function roleOf(server, userId) {
  if (!server || !userId) return null;
  if (server.ownerId === userId) return 'owner';
  return server.roles?.[userId] || (server.memberIds?.includes(userId) ? 'member' : null);
}

export function isAdmin(server, userId) {
  const role = roleOf(server, userId);
  return role === 'owner' || role === 'admin';
}

export function isModerator(server, userId) {
  return isAdmin(server, userId) || roleOf(server, userId) === 'moderator';
}

export function channelAllowedRoles(server, channelId) {
  return server?.channelRoles?.[channelId] || null;
}

export function isChannelReadOnly(server, channelId) {
  return Boolean(server?.readOnlyChannels?.[channelId]);
}

export function canViewChannel(server, userId, channelId) {
  const role = roleOf(server, userId);
  if (!role) return false;
  const allowed = channelAllowedRoles(server, channelId);
  if (!allowed) return true;
  return isAdmin(server, userId) || allowed.includes(role);
}

export function canPostInChannel(server, userId, channelId) {
  if (!canViewChannel(server, userId, channelId)) return false;
  return !isChannelReadOnly(server, channelId) || isModerator(server, userId);
}

/** Can `actorId` act (kick, change role) on `targetId`? Only on lower-ranked members. */
export function outranks(server, actorId, targetId) {
  const actor = ROLE_ORDER.indexOf(roleOf(server, actorId));
  const target = ROLE_ORDER.indexOf(roleOf(server, targetId));
  return actor > target;
}

// ---------------------------------------------------------------------------
// Permissões por cargo (bots, música e sala 3D). Dono e admins têm todas.
// O mesmo catálogo e os mesmos padrões estão em firestore.rules (hasPerm).
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  { id: 'bots.manage', group: 'Bots', label: 'Gerenciar bots', description: 'Adicionar, remover e configurar os bots do servidor.' },
  { id: 'bots.use', group: 'Bots', label: 'Usar comandos de bots', description: 'Usar comandos como /dado, /moeda e /tocar no chat.' },
  { id: 'music.control', group: 'Vitrola', label: 'Controlar a Vitrola', description: 'Pausar, pular, reordenar e limpar a fila de qualquer pessoa.' },
  { id: 'room.theme', group: 'Sala 3D', label: 'Mudar o tema da sala', description: 'Trocar o tema da sala 3D para todos.' },
  { id: 'room.collective', group: 'Sala 3D', label: 'Puxar ações coletivas', description: 'Começar dança, brinde, ola, trenzinho e foto em grupo.' }
];
export const PERMISSION_IDS = PERMISSIONS.map((p) => p.id);
export const CONFIGURABLE_ROLES = ['moderator', 'member'];

export const DEFAULT_ROLE_PERMISSIONS = {
  moderator: ['bots.use', 'music.control', 'room.theme', 'room.collective'],
  member: ['bots.use', 'room.theme', 'room.collective']
};

/** Permissões efetivas de um cargo no servidor. */
export function permissionsForRole(server, role) {
  if (role === 'owner' || role === 'admin') return [...PERMISSION_IDS];
  const custom = server?.rolePermissions;
  const list = custom ? custom[role] : DEFAULT_ROLE_PERMISSIONS[role];
  return Array.isArray(list) ? list.filter((p) => PERMISSION_IDS.includes(p)) : [];
}

export function hasPermission(server, userId, permission) {
  const role = roleOf(server, userId);
  if (!role) return false;
  return permissionsForRole(server, role).includes(permission);
}

/** Mapa completo (os dois cargos configuráveis) pronto para salvar no servidor. */
export function normalizeRolePermissions(map) {
  const out = {};
  CONFIGURABLE_ROLES.forEach((role) => {
    const list = Array.isArray(map?.[role]) ? map[role] : DEFAULT_ROLE_PERMISSIONS[role];
    out[role] = PERMISSION_IDS.filter((p) => list.includes(p));
  });
  return out;
}
