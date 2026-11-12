import React, { useState } from 'react';
import { X, Shuffle } from 'lucide-react';
import {
  OPTIONS, PRESETS, SKIN_TONES, HAIR_COLORS, EYE_COLORS, CLOTH_COLORS, applyPreset, validateLook
} from '../../services/room3d/looks';

const TABS = [
  { id: 'estilos', label: 'Estilos' },
  { id: 'corpo', label: 'Corpo' },
  { id: 'cabelo', label: 'Cabelo e rosto' },
  { id: 'roupas', label: 'Roupas' },
  { id: 'acessorios', label: 'Acessórios' }
];

function Chips({ options, value, onPick, label }) {
  return (
    <div className="cz-field">
      <div className="cz-label">{label}</div>
      <div className="cz-chips" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onPick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({ colors, value, onPick, label }) {
  return (
    <div className="cz-field">
      <div className="cz-label">{label}</div>
      <div className="cz-swatches" role="radiogroup" aria-label={label}>
        {colors.map((c, i) => (
          <button
            key={c}
            role="radio"
            aria-checked={value === i}
            aria-label={`${label} ${i + 1}`}
            className={value === i ? 'on' : ''}
            style={{ background: c }}
            onClick={() => onPick(i)}
          />
        ))}
      </div>
    </div>
  );
}

const rand = (n) => Math.floor(Math.random() * n);
const randomOf = (key) => OPTIONS[key][rand(OPTIONS[key].length)].id;

/** Painel de personalização do avatar. As mudanças valem na hora e vão para todos na sala. */
export default function CustomizePanel({ look, onChange, onClose }) {
  const [tab, setTab] = useState('estilos');
  const set = (patch) => onChange(validateLook({ ...look, ...patch }));

  const randomize = () => set({
    build: randomOf('build'), height: 0.92 + rand(17) / 100, skin: rand(SKIN_TONES.length),
    hair: randomOf('hair'), hairColor: rand(HAIR_COLORS.length), eyes: rand(EYE_COLORS.length),
    beard: Math.random() < 0.75 ? 'nenhuma' : randomOf('beard'),
    top: randomOf('top'), topColor: rand(CLOTH_COLORS.length), bottom: randomOf('bottom'), bottomColor: rand(CLOTH_COLORS.length),
    shoes: randomOf('shoes'), shoesColor: rand(CLOTH_COLORS.length),
    hat: Math.random() < 0.6 ? 'nenhum' : randomOf('hat'), hatColor: rand(CLOTH_COLORS.length),
    glasses: Math.random() < 0.7 ? 'nenhum' : randomOf('glasses'),
    extra: Math.random() < 0.6 ? 'nenhum' : randomOf('extra'), extraColor: rand(CLOTH_COLORS.length)
  });

  return (
    <aside className="cz-panel" aria-label="Personalizar personagem">
      <header className="cz-head">
        <div>
          <h2>Seu personagem</h2>
          <p>Todos na sala veem as mudanças na hora.</p>
        </div>
        <button className="cz-icon" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
      </header>

      <nav className="cz-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="cz-body">
        {tab === 'estilos' && (
          <>
            <p className="cz-note">Estilos prontos mantêm seu tom de pele, altura e corpo. Depois dá para ajustar cada peça.</p>
            <div className="cz-presets">
              {PRESETS.map((p) => (
                <button key={p.id} onClick={() => onChange(applyPreset(look, p.id))}>{p.label}</button>
              ))}
            </div>
            <button className="cz-random" onClick={randomize}><Shuffle size={14} /> Aparência aleatória</button>
          </>
        )}

        {tab === 'corpo' && (
          <>
            <Chips label="Corpo" options={OPTIONS.build} value={look.build} onPick={(v) => set({ build: v })} />
            <div className="cz-field">
              <div className="cz-label">Altura <span>{Math.round(look.height * 172)} cm</span></div>
              <input
                type="range"
                min="0.9"
                max="1.1"
                step="0.01"
                value={look.height}
                onChange={(e) => set({ height: Number(e.target.value) })}
                aria-label="Altura"
              />
            </div>
            <Swatches label="Tom de pele" colors={SKIN_TONES} value={look.skin} onPick={(v) => set({ skin: v })} />
          </>
        )}

        {tab === 'cabelo' && (
          <>
            <Chips label="Cabelo" options={OPTIONS.hair} value={look.hair} onPick={(v) => set({ hair: v })} />
            <Swatches label="Cor do cabelo" colors={HAIR_COLORS} value={look.hairColor} onPick={(v) => set({ hairColor: v })} />
            <Chips label="Barba" options={OPTIONS.beard} value={look.beard} onPick={(v) => set({ beard: v })} />
            <Swatches label="Cor dos olhos" colors={EYE_COLORS} value={look.eyes} onPick={(v) => set({ eyes: v })} />
          </>
        )}

        {tab === 'roupas' && (
          <>
            <Chips label="Parte de cima" options={OPTIONS.top} value={look.top} onPick={(v) => set({ top: v })} />
            <Swatches label="Cor de cima" colors={CLOTH_COLORS} value={look.topColor} onPick={(v) => set({ topColor: v })} />
            <Chips label="Parte de baixo" options={OPTIONS.bottom} value={look.bottom} onPick={(v) => set({ bottom: v })} />
            <Swatches label="Cor de baixo" colors={CLOTH_COLORS} value={look.bottomColor} onPick={(v) => set({ bottomColor: v })} />
            <Chips label="Calçado" options={OPTIONS.shoes} value={look.shoes} onPick={(v) => set({ shoes: v })} />
            {look.shoes !== 'descalco' && (
              <Swatches label="Cor do calçado" colors={CLOTH_COLORS} value={look.shoesColor} onPick={(v) => set({ shoesColor: v })} />
            )}
          </>
        )}

        {tab === 'acessorios' && (
          <>
            <Chips label="Na cabeça" options={OPTIONS.hat} value={look.hat} onPick={(v) => set({ hat: v })} />
            {['bone', 'gorro', 'chapeu', 'cowboy', 'mago', 'bandana', 'gato'].includes(look.hat) && (
              <Swatches label="Cor do chapéu" colors={CLOTH_COLORS} value={look.hatColor} onPick={(v) => set({ hatColor: v })} />
            )}
            <Chips label="No rosto" options={OPTIONS.glasses} value={look.glasses} onPick={(v) => set({ glasses: v })} />
            <Chips label="Extra" options={OPTIONS.extra} value={look.extra} onPick={(v) => set({ extra: v })} />
            {['capa', 'mochila', 'fones', 'cachecol'].includes(look.extra) || look.glasses === 'mascara' ? (
              <Swatches label="Cor do extra" colors={CLOTH_COLORS} value={look.extraColor} onPick={(v) => set({ extraColor: v })} />
            ) : null}
          </>
        )}
      </div>

      <footer className="cz-foot">
        <button className="cz-done" onClick={onClose}>Pronto</button>
      </footer>
    </aside>
  );
}
