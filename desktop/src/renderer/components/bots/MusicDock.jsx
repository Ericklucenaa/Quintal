import React, { useEffect, useState } from 'react';
import {
  Pause, Play, SkipForward, Square, ListMusic, ChevronDown, ChevronUp, X, Volume2, VolumeX, Trash2, ArrowUp, ArrowDown, Plus, Loader2, Headphones
} from 'lucide-react';
import { useMusic, PLAYER_URL } from '../../context/MusicContext';
import { useVoice } from '../../context/VoiceContext';
import { useAuth } from '../../context/AuthContext';
import { botById } from '../../services/bots/catalog';
import { expectedPosition, formatDuration } from '../../services/bots/music';

const VITROLA = botById('vitrola');

function useTick(active) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

function AddLinkForm({ onAdd, disabled }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'ok'|'error', text }
  const submit = async (e) => {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await onAdd(url.trim());
      setUrl('');
      setStatus({ kind: 'ok', text: res.added === 1 ? `“${res.first?.title}” entrou na fila.` : `${res.added} músicas entraram na fila.` });
    } catch (err) {
      setStatus({ kind: 'error', text: err.message || 'Não foi possível adicionar.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="music-add" onSubmit={submit}>
      <div className="music-add-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={disabled ? 'Sem permissão para pedir músicas' : 'Link do YouTube ou do Spotify'}
          disabled={disabled || busy}
          aria-label="Link da música ou playlist"
          spellCheck={false}
        />
        <button type="submit" className="music-btn primary" disabled={disabled || busy || !url.trim()} title="Colocar na fila">
          {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
        </button>
      </div>
      {status && <div className={`music-status ${status.kind}`} role="status">{status.text}</div>}
    </form>
  );
}

function QueueList({ queue, myId, canControl, actions, onError }) {
  if (!queue.length) return <div className="music-empty-queue">A fila está vazia. Cole um link abaixo ou use <code>/tocar</code> no chat.</div>;
  const run = (fn) => Promise.resolve(fn()).catch((err) => onError(err.message || 'Não foi possível mudar a fila.'));
  return (
    <ol className="music-queue">
      {queue.map((item, i) => (
        <li key={item.id}>
          <span className="music-queue-pos">{i + 1}</span>
          {item.thumb ? <img src={item.thumb} alt="" /> : <span className="music-thumb-blank" />}
          <span className="music-queue-text">
            <strong title={item.title}>{item.title}</strong>
            <small>{item.artist ? `${item.artist} · ` : ''}pedida por {item.addedByName}</small>
          </span>
          <span className="music-queue-dur">{formatDuration(item.durationMs)}</span>
          <span className="music-queue-actions">
            {canControl && i > 0 && <button onClick={() => run(() => actions.moveUp(item))} title="Subir na fila" aria-label="Subir"><ArrowUp size={13} /></button>}
            {canControl && i < queue.length - 1 && <button onClick={() => run(() => actions.moveDown(item))} title="Descer na fila" aria-label="Descer"><ArrowDown size={13} /></button>}
            {(canControl || item.addedBy === myId) && <button onClick={() => run(() => actions.remove(item))} title="Tirar da fila" aria-label="Tirar da fila"><Trash2 size={13} /></button>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function MusicDock() {
  const music = useMusic();
  const { user } = useAuth();
  const { activeVoiceChannel } = useVoice();
  const [showQueue, setShowQueue] = useState(false);
  const [notice, setNotice] = useState('');
  const [seekDraft, setSeekDraft] = useState(null); // posição enquanto arrasta (s)
  const current = music?.current;
  useTick(Boolean(current && !current.paused));

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!music?.enabled) return null;
  const { queue, bridge, perms, actions, mutedHere } = music;
  const playingHere = Boolean(current && !mutedHere);
  const visible = music.open || playingHere;

  const sameTrack = bridge && current && bridge.ref === current.ref;
  const duration = current?.durationMs || (sameTrack ? bridge.durationMs : 0);
  const position = Math.min(duration || Infinity, expectedPosition(current));
  const preview = current?.kind === 'spotify' && sameTrack && bridge.durationMs > 0 && bridge.durationMs <= 30_500 && (current.durationMs || 0) > 31_000;
  const blocked = sameTrack && bridge.errorRef === current.ref;
  const run = (fn) => Promise.resolve(fn()).catch((err) => setNotice(err.message || 'Não foi possível.'));

  const close = () => {
    if (playingHere) music.toggleMutedHere();
    music.setOpen(false);
  };

  return (
    <aside className={`music-dock ${visible ? '' : 'is-hidden'} ${current?.kind || 'idle'}`} aria-label="Vitrola" aria-hidden={!visible}>
      <header className="music-head">
        <img src={VITROLA.avatar} alt="" className="music-bot-avatar" />
        <div className="music-head-text">
          <strong>Vitrola</strong>
          <span>{activeVoiceChannel?.name}</span>
        </div>
        <button className="music-icon" onClick={() => setShowQueue((v) => !v)} aria-pressed={showQueue} title="Fila">
          <ListMusic size={16} /> <span className="music-count">{queue.length}</span>
        </button>
        <button className="music-icon" onClick={close} title={playingHere ? 'Parar de ouvir aqui e fechar' : 'Fechar'} aria-label="Fechar a Vitrola">
          <X size={16} />
        </button>
      </header>

      <div className={`music-player ${current && !mutedHere ? 'on' : ''}`}>
        <iframe
          ref={music.frameRef}
          src={PLAYER_URL}
          title="Player da Vitrola"
          allow="autoplay; encrypted-media; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        {!current && (
          <div className="music-player-empty">
            <Headphones size={22} />
            <span>{queue.length ? 'Tem música na fila esperando.' : 'Nada tocando agora.'}</span>
            {queue.length > 0 && perms.queue && <button className="music-btn primary" onClick={() => run(actions.start)}><Play size={14} /> Tocar a fila</button>}
          </div>
        )}
        {current && mutedHere && (
          <div className="music-player-empty">
            <VolumeX size={22} />
            <span>Você desligou a Vitrola neste aparelho.</span>
            <button className="music-btn" onClick={music.toggleMutedHere}>Voltar a ouvir</button>
          </div>
        )}
      </div>

      {current && (
        <div className="music-now">
          <div className="music-now-text">
            <strong title={current.title}>{current.title}</strong>
            <small>{current.artist ? `${current.artist} · ` : ''}pedida por {current.addedByName}</small>
          </div>
          <div className="music-progress">
            <span>{formatDuration(position)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.round(duration / 1000))}
              value={seekDraft ?? Math.round(position / 1000)}
              disabled={!perms.control || !duration}
              onChange={(e) => setSeekDraft(Number(e.target.value))}
              onPointerUp={() => {
                if (seekDraft === null) return;
                run(() => actions.seek(seekDraft * 1000));
                setSeekDraft(null);
              }}
              onKeyUp={() => {
                if (seekDraft === null) return;
                run(() => actions.seek(seekDraft * 1000));
                setSeekDraft(null);
              }}
              aria-label="Posição da música"
            />
            <span>{formatDuration(duration)}</span>
          </div>
          {preview && <div className="music-hint">Você está ouvindo a prévia de 30 s. Entre no Spotify pelo player para ouvir a faixa inteira.</div>}
          {blocked && <div className="music-hint warn">Este vídeo não pode tocar fora do YouTube. A Vitrola vai pular para a próxima.</div>}
        </div>
      )}

      <div className="music-controls">
        {current && perms.control && (current.paused
          ? <button className="music-btn" onClick={() => run(actions.resume)} title="Continuar para todos"><Play size={15} /></button>
          : <button className="music-btn" onClick={() => run(actions.pause)} title="Pausar para todos"><Pause size={15} /></button>)}
        {current && music.canSkipCurrent && <button className="music-btn" onClick={() => run(actions.skip)} title="Pular"><SkipForward size={15} /></button>}
        {current && perms.control && <button className="music-btn" onClick={() => run(actions.stop)} title="Parar a Vitrola"><Square size={14} /></button>}
        <div className="music-volume">
          <button className="music-icon" onClick={music.toggleMutedHere} title={mutedHere ? 'Ouvir aqui' : 'Não ouvir aqui'} aria-pressed={mutedHere}>
            {mutedHere ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={music.volume}
            onChange={(e) => music.setVolume(Number(e.target.value))}
            aria-label="Volume só para você"
            title={current?.kind === 'spotify' ? 'O player do Spotify não aceita volume externo: use o volume do sistema' : 'Volume só para você'}
            disabled={current?.kind === 'spotify'}
          />
        </div>
        <button className="music-icon" onClick={() => setShowQueue((v) => !v)} title={showQueue ? 'Esconder fila' : 'Mostrar fila'}>
          {showQueue ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {showQueue && (
        <div className="music-queue-wrap">
          <div className="music-queue-head">
            <span>Próximas ({queue.length})</span>
            {perms.control && queue.length > 0 && <button className="link-button" onClick={() => run(actions.clear)}>Limpar fila</button>}
          </div>
          <QueueList queue={queue} myId={user?.id} canControl={perms.control} actions={actions} onError={setNotice} />
        </div>
      )}

      <AddLinkForm onAdd={actions.addLink} disabled={!perms.queue} />
      {notice && <div className="music-status error" role="alert">{notice}</div>}
    </aside>
  );
}
