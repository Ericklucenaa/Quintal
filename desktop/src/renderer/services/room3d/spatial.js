// Áudio espacial: parâmetros do PannerNode (Web Audio) usados na sala 3D.
// Modelo "inverse": volume pleno até REF_DISTANCE e queda suave depois,
// sem nunca zerar (quem está do outro lado do terraço ainda é ouvido, baixo).

export const SPATIAL = {
  panningModel: 'HRTF',
  distanceModel: 'inverse',
  refDistance: 1.8,
  rolloffFactor: 1.6,
  maxDistance: 40
};

/** Ganho que o PannerNode aplica a uma distância (mesma fórmula da especificação Web Audio). */
export function spatialGain(distance, p = SPATIAL) {
  const d = Math.max(Math.min(distance, p.maxDistance), p.refDistance);
  return p.refDistance / (p.refDistance + p.rolloffFactor * (d - p.refDistance));
}

/** Configura um PannerNode já criado. */
export function configurePanner(panner) {
  panner.panningModel = SPATIAL.panningModel;
  panner.distanceModel = SPATIAL.distanceModel;
  panner.refDistance = SPATIAL.refDistance;
  panner.rolloffFactor = SPATIAL.rolloffFactor;
  panner.maxDistance = SPATIAL.maxDistance;
  return panner;
}

/** Atualiza a posição de uma fonte (altura da cabeça, 1,5 m). */
export function setPannerPosition(panner, x, z, ctxTime) {
  if (panner.positionX) {
    panner.positionX.setTargetAtTime(x, ctxTime, 0.05);
    panner.positionY.setTargetAtTime(1.5, ctxTime, 0.05);
    panner.positionZ.setTargetAtTime(z, ctxTime, 0.05);
  } else {
    panner.setPosition(x, 1.5, z);
  }
}

/** Atualiza o ouvinte: posição da cabeça e para onde olha (yaw). */
export function setListener(listener, x, z, yaw, ctxTime) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  if (listener.positionX) {
    listener.positionX.setTargetAtTime(x, ctxTime, 0.05);
    listener.positionY.setTargetAtTime(1.5, ctxTime, 0.05);
    listener.positionZ.setTargetAtTime(z, ctxTime, 0.05);
    listener.forwardX.setTargetAtTime(fx, ctxTime, 0.05);
    listener.forwardY.setTargetAtTime(0, ctxTime, 0.05);
    listener.forwardZ.setTargetAtTime(fz, ctxTime, 0.05);
    listener.upX.setTargetAtTime(0, ctxTime, 0.05);
    listener.upY.setTargetAtTime(1, ctxTime, 0.05);
    listener.upZ.setTargetAtTime(0, ctxTime, 0.05);
  } else {
    listener.setPosition(x, 1.5, z);
    listener.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}
