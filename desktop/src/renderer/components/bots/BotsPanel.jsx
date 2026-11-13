import React, { useMemo, useState } from 'react';
import { Plus, Check, Trash2, Save, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { BOTS, botConfig, cleanWordList, guardConfigToSave } from '../../services/bots/catalog';
import { hasPermission, isAdmin, PERMISSIONS } from '../../services/permissions';
import { updateServerFields, logAudit } from '../../services/cloud/servers';
import { deleteField } from 'firebase/firestore';
import { logWarn } from '../../services/log';

const permLabel = (id) => PERMISSIONS.find((p) => p.id === id)?.label || id;

function PorteiroConfig({ server, config, onSave, disabled }) {
  const textChannels = server.channels.filter((c) => c.type === 'text');
  const [channelId, setChannelId] = useState(config.channelId || textChannels[0]?.id || '');
  const [message, setMessage] = useState(config.message || '');
  return (
    <div className="bot-config">
      <label className="form-label" htmlFor="porteiro-channel">Canal das boas-vindas</label>
      <select id="porteiro-channel" className="form-input" value={channelId} onChange={(e) => setChannelId(e.target.value)} disabled={disabled}>
        {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
      </select>
      <label className="form-label" htmlFor="porteiro-msg">Mensagem</label>
      <textarea id="porteiro-msg" className="form-input" rows={3} maxLength={400} value={message} onChange={(e) => setMessage(e.target.value)} disabled={disabled} />
      <span className="bot-config-hint">{'{usuario}'} vira a menção de quem chegou e {'{servidor}'} o nome do servidor.</span>
      <div className="bot-config-actions">
        <button className="btn btn-primary btn-sm" disabled={disabled} onClick={() => onSave({ channelId, message: message.trim().slice(0, 400) })}><Save size={14} /> Salvar</button>
      </div>
    </div>
  );
}

function GuardaConfig({ config, onSave, disabled }) {
  const [words, setWords] = useState((config.words || []).join(', '));
  const [blockLinks, setBlockLinks] = useState(Boolean(config.blockLinks));
  const [maxMentions, setMaxMentions] = useState(config.maxMentions || 8);
  const count = cleanWordList(words).length;
  return (
    <div className="bot-config">
      <label className="form-label" htmlFor="guarda-words">Palavras proibidas <span className="bot-config-count">{count}/100</span></label>
      <textarea id="guarda-words" className="form-input" rows={3} value={words} onChange={(e) => setWords(e.target.value)} placeholder="separe por vírgula" disabled={disabled} />
      <label className="checkbox-row">
        <input type="checkbox" checked={blockLinks} onChange={(e) => setBlockLinks(e.target.checked)} disabled={disabled} />
        Bloquear links (moderadores continuam podendo mandar)
      </label>
      <label className="form-label" htmlFor="guarda-mentions">Máximo de menções por mensagem</label>
      <input id="guarda-mentions" type="number" min={1} max={50} className="form-input narrow" value={maxMentions} onChange={(e) => setMaxMentions(e.target.value)} disabled={disabled} />
      <div className="bot-config-actions">
        <button className="btn btn-primary btn-sm" disabled={disabled} onClick={() => onSave(guardConfigToSave({ words, blockLinks, maxMentions }))}><Save size={14} /> Salvar</button>
      </div>
    </div>
  );
}

export default function BotsPanel({ server }) {
  const { user } = useAuth();
  const { showError, showSuccess, showConfirm } = useNotification();
  const canManage = hasPermission(server, user?.id, 'bots.manage');
  const [busy, setBusy] = useState('');
  const [openId, setOpenId] = useState(null);
  const installed = useMemo(() => server.bots || {}, [server.bots]);

  const write = async (botId, patch, auditAction, details) => {
    setBusy(botId);
    try {
      await updateServerFields(server.id, patch);
      if (auditAction) logAudit(server.id, user, auditAction, { targetName: details });
      return true;
    } catch (err) {
      logWarn('bots update', err);
      showError('Bots', err?.code === 'permission-denied' ? 'Você não tem permissão para mexer nos bots deste servidor.' : 'Não foi possível salvar. Tente de novo.');
      return false;
    } finally {
      setBusy('');
    }
  };

  const add = async (bot) => {
    const config = bot.id === 'guarda' ? guardConfigToSave(bot.defaults) : { ...bot.defaults };
    if (bot.id === 'porteiro') config.channelId = server.channels.find((c) => c.type === 'text')?.id || null;
    const ok = await write(bot.id, { [`bots.${bot.id}`]: { addedBy: user.id, addedByName: user.username, addedAt: Date.now(), config } }, 'bot_add', bot.name);
    if (ok) {
      showSuccess('Bot adicionado', `${bot.name} agora faz parte de ${server.name}.`);
      if (bot.id !== 'sorte') setOpenId(bot.id);
    }
  };

  const remove = async (bot) => {
    const confirmed = await showConfirm('Remover bot', `Tirar ${bot.name} do servidor? A configuração dele será apagada.`, { isDanger: true, confirmText: 'Remover' });
    if (confirmed) write(bot.id, { [`bots.${bot.id}`]: deleteField() }, 'bot_remove', bot.name);
  };

  const saveConfig = async (bot, config) => {
    const ok = await write(bot.id, { [`bots.${bot.id}.config`]: config }, 'bot_config', bot.name);
    if (ok) showSuccess('Configuração salva', `${bot.name} atualizado.`);
  };

  const sorted = useMemo(() => [...BOTS].sort((a, b) => Number(Boolean(installed[b.id])) - Number(Boolean(installed[a.id]))), [installed]);

  return (
    <div className="modal-body bots-panel">
      <p className="bots-intro">
        Bots do Quintal rodam dentro do próprio app: não precisam de servidor nem de token.
        {canManage ? ' Adicione os que fizerem sentido para o seu grupo.' : ' Só quem tem a permissão “Gerenciar bots” pode adicionar ou remover.'}
      </p>
      <ul className="bot-list">
        {sorted.map((bot) => {
          const on = Boolean(installed[bot.id]);
          const expanded = openId === bot.id;
          const configurable = on && (bot.id === 'porteiro' || bot.id === 'guarda');
          return (
            <li key={bot.id} className={`bot-row ${on ? 'on' : ''}`}>
              <div className="bot-row-main">
                <img src={bot.avatar} alt="" className="bot-avatar" />
                <div className="bot-row-text">
                  <div className="bot-row-title">
                    <strong>{bot.name}</strong>
                    <span className="bot-tag">BOT</span>
                    {on && <span className="bot-on"><Check size={12} /> no servidor</span>}
                  </div>
                  <span className="bot-tagline">{bot.tagline}</span>
                </div>
                <div className="bot-row-actions">
                  {on ? (
                    <>
                      {configurable && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(expanded ? null : bot.id)} aria-expanded={expanded}>
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Configurar
                        </button>
                      )}
                      {canManage && (
                        <button className="btn btn-ghost-danger btn-sm" onClick={() => remove(bot)} disabled={busy === bot.id} title={`Remover ${bot.name}`}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  ) : canManage ? (
                    <button className="btn btn-primary btn-sm" onClick={() => add(bot)} disabled={busy === bot.id}><Plus size={14} /> Adicionar</button>
                  ) : (
                    <span className="bot-locked"><Lock size={12} /> sem permissão</span>
                  )}
                </div>
              </div>
              <p className="bot-description">{bot.description}</p>
              {bot.commands.length > 0 && (
                <div className="bot-commands">
                  {bot.commands.map((c) => (
                    <span key={c.name} className="bot-command" title={c.help}>
                      /{c.name}{c.permission && <em> · {permLabel(c.permission)}</em>}
                    </span>
                  ))}
                </div>
              )}
              {expanded && bot.id === 'porteiro' && <PorteiroConfig server={server} config={botConfig(server, 'porteiro')} onSave={(c) => saveConfig(bot, c)} disabled={!canManage || busy === bot.id} />}
              {expanded && bot.id === 'guarda' && <GuardaConfig config={botConfig(server, 'guarda')} onSave={(c) => saveConfig(bot, c)} disabled={!canManage || busy === bot.id} />}
            </li>
          );
        })}
      </ul>
      {!isAdmin(server, user?.id) && canManage && (
        <p className="bots-foot">Você pode gerenciar bots por causa do seu cargo. Quem define as permissões são os admins.</p>
      )}
    </div>
  );
}
