import React, { useEffect, useMemo, useState } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import {
  CONFIGURABLE_ROLES, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_LABELS, isAdmin, normalizeRolePermissions, permissionsForRole
} from '../../services/permissions';
import { updateServerFields, logAudit } from '../../services/cloud/servers';
import { logWarn } from '../../services/log';

const toSets = (server) => Object.fromEntries(CONFIGURABLE_ROLES.map((r) => [r, new Set(permissionsForRole(server, r))]));

export default function PermissionsPanel({ server }) {
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const admin = isAdmin(server, user?.id);
  const [draft, setDraft] = useState(() => toSets(server));
  const [saving, setSaving] = useState(false);
  const serverKey = JSON.stringify(server.rolePermissions || null);

  useEffect(() => {
    setDraft(toSets(server));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, serverKey]);

  const groups = useMemo(() => {
    const map = new Map();
    PERMISSIONS.forEach((p) => {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group).push(p);
    });
    return Array.from(map.entries());
  }, []);

  const dirty = CONFIGURABLE_ROLES.some((r) => {
    const saved = new Set(permissionsForRole(server, r));
    return saved.size !== draft[r].size || [...saved].some((p) => !draft[r].has(p));
  });

  const toggle = (role, perm) => {
    if (!admin) return;
    setDraft((d) => {
      const next = new Set(d[role]);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return { ...d, [role]: next };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const map = normalizeRolePermissions(Object.fromEntries(CONFIGURABLE_ROLES.map((r) => [r, [...draft[r]]])));
      await updateServerFields(server.id, { rolePermissions: map });
      logAudit(server.id, user, 'permissions_update', { details: CONFIGURABLE_ROLES.map((r) => `${ROLE_LABELS[r]}: ${map[r].length}`).join(' · ') });
      showSuccess('Permissões salvas', 'As mudanças já valem para todos.');
    } catch (err) {
      logWarn('save permissions', err);
      showError('Permissões', 'Não foi possível salvar. Só admins podem mudar as permissões.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-body perms-panel">
      <p className="bots-intro">
        Dono e admins podem tudo. Aqui você escolhe o que moderadores e membros podem fazer com bots, a Vitrola e a sala 3D.
        {!admin && ' Só admins podem mudar esta tabela.'}
      </p>
      <table className="perms-table">
        <thead>
          <tr>
            <th scope="col">Permissão</th>
            <th scope="col">Admin</th>
            {CONFIGURABLE_ROLES.map((r) => <th scope="col" key={r}>{ROLE_LABELS[r]}</th>)}
          </tr>
        </thead>
        {groups.map(([group, perms]) => (
          <tbody key={group}>
            <tr className="perms-group"><th colSpan={2 + CONFIGURABLE_ROLES.length} scope="rowgroup">{group}</th></tr>
            {perms.map((p) => (
              <tr key={p.id}>
                <th scope="row">
                  <span className="perm-name">{p.label}</span>
                  <span className="perm-desc">{p.description}</span>
                </th>
                <td><span className="perm-always" title="Admins sempre podem">sempre</span></td>
                {CONFIGURABLE_ROLES.map((r) => (
                  <td key={r}>
                    <input
                      type="checkbox"
                      checked={draft[r].has(p.id)}
                      onChange={() => toggle(r, p.id)}
                      disabled={!admin || saving}
                      aria-label={`${p.label} para ${ROLE_LABELS[r]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {admin && (
        <div className="perms-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setDraft(Object.fromEntries(CONFIGURABLE_ROLES.map((r) => [r, new Set(DEFAULT_ROLE_PERMISSIONS[r])])))}
            disabled={saving}
          >
            <RotateCcw size={14} /> Padrão do Quintal
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || saving}>
            <Save size={14} /> {saving ? 'Salvando…' : 'Salvar permissões'}
          </button>
        </div>
      )}
    </div>
  );
}
