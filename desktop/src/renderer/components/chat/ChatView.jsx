import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, Upload, Reply, Pencil, Pin, PinOff, Copy, Trash2, EyeOff, RotateCw, X, AlertCircle, Hash
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { useUnread } from '../../context/UnreadContext';
import { useOverlayUI } from '../../context/OverlayUIContext';
import { useMessages, useTyping } from '../../hooks/useMessages';
import { useMusic } from '../../context/MusicContext';
import { availableCommands, findCommand, helpText, parseCommand, runSorte } from '../../services/bots/commands';
import { botById, guardVerdict } from '../../services/bots/catalog';
import { formatDuration } from '../../services/bots/music';
import { hasPermission, PERMISSIONS } from '../../services/permissions';
import {
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  setPinned,
  votePoll,
  scopeKey as keyOf
} from '../../services/cloud/messages';
import {
  uploadAttachment,
  compressImage,
  deleteAttachment,
  INLINE_IMAGE_LIMIT_CHARS
} from '../../services/cloud/attachments';
import MarkdownText, { extractMentions } from './MarkdownText';
import MessageItem from './MessageItem';
import MessageComposer from './MessageComposer';
import ImageLightboxModal from '../ImageLightboxModal';
import { PollModal } from './Polls';
import { logWarn } from '../../services/log';
import { useUserMenu } from '../useUserMenu';

const GROUP_WINDOW_MS = 5 * 60_000;

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' });
}

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const type = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * The conversation view shared by server channels and DMs.
 */
const ChatView = forwardRef(function ChatView(
  {
    scope,
    attachmentScope,
    members = [],
    canModerate = false,
    canPin = false,
    allowEveryone = false,
    disabledReason = null,
    placeholder,
    emptyState,
    blockedIds = [],
    onJoinInvite,
    server = null
  },
  ref
) {
  const { user } = useAuth();
  const { showError, showConfirm, showSuccess, showToast } = useNotification();
  const { markRead, readState } = useUnread();
  const { openMenu, openProfile } = useOverlayUI();
  const openUserMenu = useUserMenu();
  const key = keyOf(scope);
  const { messages, hasMore, loadMore, loading, error } = useMessages(scope);
  const { typingNames, notifyTyping, stopTyping } = useTyping(scope, user);
  const [failed, setFailed] = useState([]); // messages the server rejected
  const [ephemeral, setEphemeral] = useState([]); // respostas de bot que só eu vejo
  const music = useMusic();
  const [pollOpen, setPollOpen] = useState(false);
  // "Novas mensagens" divider: where I had read up to when I opened the conversation.
  const [dividerAt, setDividerAt] = useState(undefined);
  const [manualUnread, setManualUnread] = useState(false);

  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const listRef = useRef(null);
  const composerRef = useRef(null);
  const prependRef = useRef(null);
  const atBottomRef = useRef(true);
  const lastCountRef = useRef(0);

  const botCommands = useMemo(() => (scope.type === 'channel' && server
    ? availableCommands(server, user.id).map(({ bot, cmd }) => ({ ...cmd, botName: bot?.name, botAvatar: bot?.avatar }))
    : []), [scope.type, server, user.id]);

  const memberNames = useMemo(() => new Set(members.map((m) => m.username?.toLowerCase()).filter(Boolean)), [members]);
  const membersByName = useMemo(() => new Map(members.map((m) => [m.username?.toLowerCase(), m])), [members]);

  useEffect(() => {
    setReplyTo(null);
    setEditingId(null);
    setFailed([]);
    setEphemeral([]);
    setDividerAt(undefined);
    setManualUnread(false);
    lastCountRef.current = 0;
    atBottomRef.current = true;
    setAtBottom(true);
  }, [key]);

  useEffect(() => {
    if (dividerAt === undefined && !loading) setDividerAt(readState[key] || null);
  }, [dividerAt, loading, readState, key]);

  // --- Scrolling -------------------------------------------------------------

  const scrollToBottom = (smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prependRef.current) {
      // Older page loaded above: keep the viewport where it was.
      el.scrollTop = el.scrollHeight - prependRef.current.height + prependRef.current.top;
      prependRef.current = null;
    } else if (messages.length !== lastCountRef.current) {
      const newest = messages[messages.length - 1];
      if (atBottomRef.current || lastCountRef.current === 0 || newest?.authorId === user.id) scrollToBottom(lastCountRef.current !== 0);
    }
    lastCountRef.current = messages.length;
  }, [messages, user.id]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = bottom;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (el.scrollTop < 150 && hasMore && !prependRef.current) {
      prependRef.current = { height: el.scrollHeight, top: el.scrollTop };
      loadMore();
    }
  };

  // Mark as read when the newest message is on screen and the window is focused.
  const newestAt = messages[messages.length - 1]?.createdAt;
  useEffect(() => {
    if (!newestAt || !atBottom || manualUnread) return undefined;
    const apply = () => document.hasFocus() && markRead(key, newestAt);
    apply();
    window.addEventListener('focus', apply);
    return () => window.removeEventListener('focus', apply);
  }, [newestAt, atBottom, key, markRead, manualUnread]);

  const jumpTo = useCallback((messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) {
      showError('Mensagem antiga', 'Role para cima para carregar o histórico até essa mensagem.');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(messageId);
    setTimeout(() => setHighlightId((id) => (id === messageId ? null : id)), 2000);
  }, [showError]);

  useImperativeHandle(ref, () => ({ jumpTo, focusComposer: () => composerRef.current?.focus() }));

  // --- Actions ---------------------------------------------------------------

  const prepareFiles = async (files) => {
    let imageUrl = null;
    const attachments = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(Math.round((i / files.length) * 100));
      if (file.type.startsWith('image/') && file.type !== 'image/gif') {
        const dataUrl = await compressImage(file).catch(() => null);
        if (dataUrl && !imageUrl && files.length === 1 && dataUrl.length <= INLINE_IMAGE_LIMIT_CHARS) {
          imageUrl = dataUrl;
          continue;
        }
        if (dataUrl) {
          const blob = dataUrlToBlob(dataUrl);
          const named = new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
          attachments.push(await uploadAttachment(named, user.id, attachmentScope));
          continue;
        }
      }
      attachments.push(await uploadAttachment(file, user.id, attachmentScope, (p) => {
        setUploadProgress(Math.round(((i + p / 100) / files.length) * 100));
      }));
    }
    return { imageUrl, attachments };
  };

  // The message appears immediately (pending); if the server rejects it, it
  // moves to a "not sent" list with retry/discard instead of being lost.
  const dispatch = (payload) => {
    const { committed } = sendMessage(scope, user, payload);
    committed.catch((err) => {
      logWarn('send message', err);
      setFailed((prev) => [...prev, { localId: `f-${Date.now()}-${Math.random()}`, payload, error: err?.code || err?.message }]);
    });
  };

  const showEphemeral = (botId, text) => {
    setEphemeral((prev) => [...prev.slice(-4), { id: `e-${Date.now()}-${Math.random()}`, botId, text }]);
    atBottomRef.current = true;
  };

  /**
   * Comandos "/" dos bots. Devolve true quando o texto era um comando tratado aqui;
   * erros sobem como exceção (o compositor mantém o texto e mostra o motivo).
   */
  const runBotCommand = async (raw) => {
    const parsed = parseCommand(raw);
    if (!parsed || scope.type !== 'channel' || !server) return false;
    const found = findCommand(server, parsed.name);
    if (!found) return false;
    const { bot, cmd } = found;
    if (!cmd.open && !hasPermission(server, user.id, 'bots.use')) throw new Error('Seu cargo não pode usar comandos de bots neste servidor.');
    if (cmd.permission && !hasPermission(server, user.id, cmd.permission)) {
      const label = PERMISSIONS.find((p) => p.id === cmd.permission)?.label || cmd.permission;
      throw new Error(`Para usar /${cmd.name} você precisa da permissão “${label}”.`);
    }
    const asBot = (botId, content) => dispatch({ content, bot: botId, botCommand: `/${parsed.name}${parsed.args ? ` ${parsed.args}` : ''}`.slice(0, 120) });

    if (!bot) {
      showEphemeral(null, helpText(server, user.id));
      return true;
    }
    if (bot.id === 'sorte') {
      const res = runSorte(parsed.name, parsed.args, { username: user.username, members });
      if (res.error) throw new Error(res.error);
      asBot('sorte', res.text);
      return true;
    }
    if (bot.id === 'vitrola') {
      const inThisServer = music?.enabled && music.serverId === server.id;
      if (parsed.name === 'fila') {
        if (!inThisServer) throw new Error('Entre num canal de voz deste servidor para ver a fila da Vitrola.');
        const now = music.current ? `Tocando: **${music.current.title}**${music.current.artist ? ` — ${music.current.artist}` : ''} (pedida por @${music.current.addedByName})` : 'Nada tocando agora.';
        const next = music.queue.slice(0, 10).map((q, i) => `${i + 1}. ${q.title} · ${formatDuration(q.durationMs)} · @${q.addedByName}`).join('\n');
        const more = music.queue.length > 10 ? `\n…e mais ${music.queue.length - 10}.` : '';
        showEphemeral('vitrola', `${now}\n\n${next ? `**Próximas**\n${next}${more}` : 'A fila está vazia.'}`);
        return true;
      }
      if (!inThisServer) throw new Error('Entre num canal de voz deste servidor para usar a Vitrola.');
      switch (parsed.name) {
        case 'tocar': {
          if (!parsed.args) throw new Error('Passe um link: /tocar https://youtu.be/…');
          const res = await music.actions.addLink(parsed.args);
          asBot('vitrola', res.added === 1
            ? `Na fila: **${res.first.title}**${res.first.artist ? ` — ${res.first.artist}` : ''}`
            : `Na fila: **${res.added} músicas**, começando por “${res.first.title}”`);
          return true;
        }
        case 'pular': {
          const title = music.current?.title;
          if (!title) throw new Error('Não tem nada tocando.');
          await music.actions.skip();
          asBot('vitrola', `Pulou **${title}**.`);
          return true;
        }
        case 'pausar':
          if (!music.current) throw new Error('Não tem nada tocando.');
          await music.actions.pause();
          asBot('vitrola', `Pausada: **${music.current.title}**.`);
          return true;
        case 'continuar':
          if (!music.current) throw new Error('Não tem nada tocando.');
          await music.actions.resume();
          asBot('vitrola', `Voltou a tocar **${music.current.title}**.`);
          return true;
        case 'limpar':
          await music.actions.clear();
          asBot('vitrola', 'A fila foi esvaziada.');
          return true;
        default:
          return false;
      }
    }
    return false;
  };

  const handleSend = async (text, files) => {
    stopTyping();
    if (!files.length && await runBotCommand(text)) {
      atBottomRef.current = true;
      return;
    }
    setDividerAt(null);
    setManualUnread(false);
    try {
      const { imageUrl, attachments } = files.length ? await prepareFiles(files) : { imageUrl: null, attachments: [] };
      const { ids, everyone } = scope.type === 'channel' ? extractMentions(text, membersByName) : { ids: [], everyone: false };
      const blocked = scope.type === 'channel' && server ? guardVerdict(server, { content: text, mentions: ids }, canModerate) : null;
      if (blocked) throw new Error(blocked);
      dispatch({
        content: text,
        imageUrl,
        attachments,
        replyTo: replyTo
          ? { id: replyTo.id, authorId: replyTo.authorId, authorName: replyTo.authorName, content: (replyTo.content || '').slice(0, 140) }
          : null,
        mentions: ids,
        mentionEveryone: everyone && allowEveryone
      });
      setReplyTo(null);
      atBottomRef.current = true;
    } finally {
      setUploadProgress(null);
    }
  };

  const retryFailed = (item) => {
    setFailed((prev) => prev.filter((f) => f.localId !== item.localId));
    dispatch(item.payload);
  };

  const createPoll = async (poll) => {
    dispatch({ content: '', poll });
    atBottomRef.current = true;
  };

  const handleVote = useCallback((message, optionIds) => {
    votePoll(scope, message.id, user.id, optionIds).catch((err) => {
      logWarn('vote', err);
      showError('Voto não registrado', 'Tente novamente.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, user.id, showError]);

  const markUnreadFrom = useCallback((message) => {
    const idx = messages.findIndex((m) => m.id === message.id);
    const before = idx > 0 ? messages[idx - 1].createdAt : '0';
    setManualUnread(true);
    setDividerAt(before);
    markRead(key, before, { force: true });
  }, [messages, key, markRead]);

  const handleSaveEdit = useCallback(async (message, text) => {
    try {
      const { ids, everyone } = scope.type === 'channel' ? extractMentions(text, membersByName) : { ids: [], everyone: false };
      await editMessage(scope, message.id, text, scope.type === 'channel' ? { mentions: ids, mentionEveryone: everyone && allowEveryone } : {});
      setEditingId(null);
    } catch (err) {
      logWarn('edit message', err);
      showError('Não foi possível editar', 'Tente novamente.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, membersByName, allowEveryone, showError]);

  const handleDelete = useCallback(async (message) => {
    const ok = await showConfirm('Excluir mensagem', 'Tem certeza que deseja excluir esta mensagem?', { isDanger: true, confirmText: 'Excluir' });
    if (!ok) return;
    try {
      await deleteMessage(scope, message.id);
      if (message.authorId === user.id) message.attachments.forEach((a) => deleteAttachment(a));
    } catch (err) {
      logWarn('delete message', err);
      showError('Não foi possível excluir', 'Você não tem permissão para excluir esta mensagem.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, user.id, showConfirm, showError]);

  const handleReact = useCallback((message, emoji) => {
    toggleReaction(scope, message, emoji, user.id).catch((err) => logWarn('react', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, user.id]);

  const handlePin = useCallback(async (message) => {
    try {
      await setPinned(scope, message.id, !message.pinned, user.id);
      showToast(message.pinned ? 'Mensagem desafixada.' : 'Mensagem fixada no canal.', 'success');
    } catch (err) {
      logWarn('pin', err);
      showError('Sem permissão', 'Apenas moderadores podem fixar mensagens.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, user.id, showError, showToast]);

  const handleEditLast = () => {
    const mine = [...messages].reverse().find((m) => m.authorId === user.id && !m.pending);
    if (mine) setEditingId(mine.id);
  };

  const openAuthorMenu = useCallback(
    (event, message) => openUserMenu(event, { id: message.authorId, username: message.authorName, avatar: message.authorAvatar }),
    [openUserMenu]
  );

  const openMessageMenu = useCallback((event, message) => {
    const mine = message.authorId === user.id;
    openMenu(event, [
      { emojis: ['👍', '❤️', '😂', '😮', '😢', '🔥'], onPick: (emoji) => handleReact(message, emoji) },
      { label: 'Responder', icon: Reply, onClick: () => setReplyTo(message) },
      mine && { label: 'Editar', icon: Pencil, onClick: () => setEditingId(message.id) },
      canPin && { label: message.pinned ? 'Desafixar' : 'Fixar mensagem', icon: message.pinned ? PinOff : Pin, onClick: () => handlePin(message) },
      { label: 'Copiar texto', icon: Copy, onClick: () => navigator.clipboard.writeText(message.content || '') },
      { label: 'Marcar como não lida', icon: EyeOff, onClick: () => markUnreadFrom(message) },
      { label: 'Copiar ID da mensagem', icon: Hash, onClick: () => navigator.clipboard.writeText(message.id) },
      (mine || canModerate) && { separator: true },
      (mine || canModerate) && { label: 'Excluir mensagem', icon: Trash2, danger: true, onClick: () => handleDelete(message) }
    ]);
  }, [user.id, openMenu, canPin, canModerate, handleReact, handlePin, handleDelete, markUnreadFrom]);

  const joinInvite = useCallback(async (code) => {
    try {
      const res = await onJoinInvite(code);
      showSuccess('Servidor acessado!', res?.message || '');
    } catch (err) {
      showError('Não foi possível entrar', err.message);
    }
  }, [onJoinInvite, showSuccess, showError]);

  // --- Drag & drop -------------------------------------------------------------

  const dragProps = disabledReason ? {} : {
    onDragOver: (e) => {
      if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
        e.preventDefault();
        setIsDragging(true);
      }
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer?.files?.length) composerRef.current?.addFiles(e.dataTransfer.files);
    }
  };

  // --- Render ----------------------------------------------------------------

  const rendered = [];
  const firstUnread = dividerAt
    ? messages.find((m) => m.createdAt > dividerAt && m.authorId !== user.id)
    : null;
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (firstUnread && m.id === firstUnread.id) {
      rendered.push(<div key="new-divider" className="new-divider"><span>Novas mensagens</span></div>);
    }
    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    if (newDay) rendered.push(<div key={`day-${m.id}`} className="day-separator"><span>{dayLabel(m.createdAt)}</span></div>);
    const grouped = !newDay && prev && prev.authorId === m.authorId && (prev.bot || null) === (m.bot || null) && !m.replyTo
      && new Date(m.createdAt) - new Date(prev.createdAt) < GROUP_WINDOW_MS;
    rendered.push(
      <MessageItem
        key={m.id}
        message={m}
        grouped={grouped}
        me={user}
        memberNames={memberNames}
        canDelete={canModerate}
        canPin={canPin}
        isEditing={editingId === m.id}
        isHighlighted={highlightId === m.id}
        isBlockedAuthor={blockedIds.includes(m.authorId)}
        mentionsMe={(m.mentions || []).includes(user.id) || (m.mentionEveryone && m.authorId !== user.id)}
        onReply={setReplyTo}
        onStartEdit={(msg) => setEditingId(msg.id)}
        onCancelEdit={() => setEditingId(null)}
        onSaveEdit={handleSaveEdit}
        onDelete={handleDelete}
        onReact={handleReact}
        onPin={handlePin}
        onOpenImage={setLightbox}
        onJumpTo={jumpTo}
        onJoinInvite={joinInvite}
        onContextMenu={openMessageMenu}
        onUserContextMenu={openAuthorMenu}
        onOpenProfile={openProfile}
        onVote={handleVote}
      />
    );
  });

  const typingText = typingNames.length === 0
    ? ''
    : typingNames.length > 3
      ? 'Várias pessoas estão digitando…'
      : `${typingNames.join(', ')} ${typingNames.length === 1 ? 'está digitando…' : 'estão digitando…'}`;

  return (
    <div className="chat-view" {...dragProps}>
      {isDragging && (
        <div className="drop-overlay">
          <Upload size={44} />
          <h3>Solte os arquivos para enviar</h3>
          <span>Imagens, vídeos e documentos de até 8 MB</span>
        </div>
      )}

      <div className="chat-messages" ref={listRef} onScroll={onScroll}>
        {hasMore && <div className="history-loader">Carregando mensagens anteriores…</div>}
        {!hasMore && !loading && emptyState}
        {error && <div className="history-loader error">Não foi possível carregar as mensagens.</div>}
        {loading && messages.length === 0 && (
          <div className="message-skeletons" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="message-skeleton">
                <span className="sk-avatar" />
                <div><span className="sk-line short" /><span className={`sk-line ${i % 2 ? 'long' : ''}`} /></div>
              </div>
            ))}
          </div>
        )}
        {rendered}
        {failed.map((f) => (
          <div key={f.localId} className="message-failed">
            <AlertCircle size={16} />
            <span className="message-failed-text">{f.payload.poll ? `Enquete: ${f.payload.poll.question}` : f.payload.content || 'Anexo'}</span>
            <span className="message-failed-label">Não enviada</span>
            <button className="btn btn-secondary btn-sm" onClick={() => retryFailed(f)}><RotateCw size={13} /> Reenviar</button>
            <button className="icon-btn" aria-label="Descartar" onClick={() => setFailed((prev) => prev.filter((x) => x.localId !== f.localId))}><X size={14} /></button>
          </div>
        ))}
        {ephemeral.map((e) => {
          const bot = e.botId ? botById(e.botId) : null;
          return (
            <div key={e.id} className="message-ephemeral" role="status">
              {bot ? <img src={bot.avatar} alt="" className="message-avatar bot" /> : <span className="message-ephemeral-icon"><Hash size={16} /></span>}
              <div className="message-content-wrapper">
                <div className="message-meta">
                  <span className="message-author static">{bot ? bot.name : 'Comandos'}</span>
                  {bot && <span className="bot-tag">BOT</span>}
                  <span className="message-ephemeral-note">só você vê isto</span>
                  <button className="link-button" onClick={() => setEphemeral((prev) => prev.filter((x) => x.id !== e.id))}>dispensar</button>
                </div>
                <div className="message-text"><MarkdownText text={e.text} memberNames={memberNames} myName={user.username} /></div>
              </div>
            </div>
          );
        })}
      </div>

      {!atBottom && (
        <button className="jump-bottom" onClick={() => scrollToBottom(true)}>
          <ArrowDown size={14} /> Ir para as mensagens recentes
        </button>
      )}

      <div className="typing-indicator typing-row">{typingText}</div>

      <MessageComposer
        ref={composerRef}
        scopeKey={key}
        placeholder={placeholder}
        disabledReason={disabledReason}
        members={members.filter((m) => m.id !== user.id)}
        allowEveryone={allowEveryone}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
        onTyping={notifyTyping}
        onEditLast={handleEditLast}
        onError={(msg) => showError('Envio de mensagem', msg)}
        onCreatePoll={disabledReason ? undefined : () => setPollOpen(true)}
        uploadProgress={uploadProgress}
        commands={botCommands}
      />

      {pollOpen && <PollModal onClose={() => setPollOpen(false)} onCreate={createPoll} />}

      {lightbox && <ImageLightboxModal isOpen imageUrl={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
});

export default ChatView;
