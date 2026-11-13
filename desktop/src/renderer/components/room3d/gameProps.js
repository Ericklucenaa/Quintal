// Peças, bolas e bonecos das mesas de jogo na cena 3D. Espelham o estado das mesas
// (GameHub) para quem está assistindo; quem joga usa o painel 2D.
import * as THREE from 'three';
import { GAME_TABLES } from '../../services/room3d/layout';
import { pieces as chessPieces } from '../../services/room3d/games/chess';
import { BALL_COLORS, BALL_R, TABLE as POOL } from '../../services/room3d/games/pool';
import { FB, PP, RODS, rodMen } from '../../services/room3d/games/realtime';

const BOARD = 0.64; // lado do tabuleiro na mesa (m)
const CELL = BOARD / 8;

function lathe(points, material) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 20), material);
  m.castShadow = true;
  return m;
}

// Silhuetas simples (em metros, peça de ~5 cm)
const PROFILES = {
  p: [[0, 0], [0.018, 0], [0.017, 0.006], [0.009, 0.012], [0.007, 0.026], [0.011, 0.03], [0.01, 0.038], [0, 0.042]],
  r: [[0, 0], [0.02, 0], [0.019, 0.007], [0.013, 0.012], [0.013, 0.036], [0.017, 0.038], [0.017, 0.048], [0, 0.048]],
  n: [[0, 0], [0.02, 0], [0.019, 0.007], [0.012, 0.012], [0.01, 0.03], [0, 0.03]],
  b: [[0, 0], [0.019, 0], [0.018, 0.007], [0.009, 0.014], [0.009, 0.034], [0.012, 0.042], [0.006, 0.054], [0, 0.058]],
  q: [[0, 0], [0.021, 0], [0.02, 0.008], [0.01, 0.016], [0.009, 0.044], [0.015, 0.05], [0.012, 0.062], [0, 0.064]],
  k: [[0, 0], [0.021, 0], [0.02, 0.008], [0.011, 0.016], [0.01, 0.048], [0.015, 0.054], [0.012, 0.066], [0, 0.068]]
};

export class GameProps {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.white = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.4 });
    this.black = new THREE.MeshStandardMaterial({ color: '#2a211c', roughness: 0.35 });
    this.cache = new Map(); // id da mesa -> { key, group }
    this.pool = null;
    this.realtime = new Map();
    this.buildStatic();
  }

  buildStatic() {
    // bolas da sinuca (16 esferas reaproveitadas)
    const pt = GAME_TABLES.find((t) => t.kind === 'pool');
    if (pt) {
      const g = new THREE.Group();
      g.position.set(pt.x, 0.79 + BALL_R, pt.z);
      const scale = (pt.w - 0.36) / POOL.L;
      this.poolScale = scale;
      this.pool = BALL_COLORS.map((c, id) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * scale, 16, 12), new THREE.MeshStandardMaterial({ color: c, roughness: 0.25 }));
        m.castShadow = true;
        if (id > 8) {
          const band = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * scale * 1.01, 16, 12, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.36), new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.25 }));
          m.material.color.set('#f4f1e8');
          band.material.color.set(c);
          m.add(band);
        }
        g.add(m);
        return m;
      });
      this.group.add(g);
    }
    // totó: varetas, bonecos e bola
    const ft = GAME_TABLES.find((t) => t.kind === 'foosball');
    if (ft) {
      const g = new THREE.Group();
      const s = (ft.w - 0.1) / FB.L;
      g.position.set(ft.x, ft.h - 0.26, ft.z);
      g.scale.setScalar(s);
      const rodMat = new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.8, roughness: 0.3 });
      const teamMat = [new THREE.MeshStandardMaterial({ color: '#c8402f', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#2a5fb0', roughness: 0.5 })];
      const rods = RODS.map((rod) => {
        const holder = new THREE.Group();
        holder.position.x = rod[0];
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, FB.W + 0.3, 8), rodMat);
        bar.rotation.x = Math.PI / 2;
        bar.position.y = 0.07;
        holder.add(bar);
        const spin = new THREE.Group();
        spin.position.y = 0.07;
        holder.add(spin);
        const men = Array.from({ length: rod[2] }, () => {
          const man = new THREE.Group();
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.03), teamMat[rod[1]]);
          body.position.y = -0.03;
          man.add(body);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), teamMat[rod[1]]);
          head.position.y = 0.012;
          man.add(head);
          spin.add(man);
          return man;
        });
        g.add(holder);
        return { rod, spin, men };
      });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(FB.ball, 12, 10), new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.4 }));
      ball.position.y = FB.ball;
      g.add(ball);
      this.group.add(g);
      this.realtime.set(ft.id, { kind: 'foosball', rods, ball });
    }
    // ping-pong: bola e raquetes
    const pp = GAME_TABLES.find((t) => t.kind === 'pingpong');
    if (pp) {
      const g = new THREE.Group();
      g.position.set(pp.x, pp.h, pp.z);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), new THREE.MeshStandardMaterial({ color: '#f7f3ea', roughness: 0.3 }));
      ball.castShadow = true;
      g.add(ball);
      const paddles = ['#c8402f', '#1b1a20'].map((c, i) => {
        const p = new THREE.Group();
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 20), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
        face.rotation.z = Math.PI / 2;
        p.add(face);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.025), new THREE.MeshStandardMaterial({ color: '#8a6236' }));
        handle.position.y = -0.1;
        p.add(handle);
        p.position.set((i ? 1 : -1) * PP.paddleX, 0.16, 0);
        p.visible = false;
        g.add(p);
        return p;
      });
      ball.visible = false;
      this.group.add(g);
      this.realtime.set(pp.id, { kind: 'pingpong', ball, paddles });
    }
  }

  boardPieces(table, state) {
    const key = state.data ? `${state.v}:${table.kind === 'chess' ? state.data.fen : state.data.board}` : 'empty';
    const cached = this.cache.get(table.id);
    if (cached?.key === key) return;
    if (cached) {
      this.group.remove(cached.group);
      cached.group.traverse((o) => o.geometry?.dispose());
    }
    const g = new THREE.Group();
    g.position.set(table.x, table.h + 0.02, table.z);
    // brancas do lado do lugar 1 (oeste, x menor): fileira 1 → x negativo
    const place = (file, rankFromWhite) => [(-BOARD / 2 + CELL / 2) + rankFromWhite * CELL, (-BOARD / 2 + CELL / 2) + file * CELL];
    if (table.kind === 'chess') {
      const list = state.data ? chessPieces(state.data.fen) : chessPieces('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      list.forEach((p) => {
        const file = p.square.charCodeAt(0) - 97;
        const rank = Number(p.square[1]) - 1;
        const m = lathe(PROFILES[p.type], p.color === 'w' ? this.white : this.black);
        const [x, z] = place(file, rank);
        m.position.set(x, 0, z);
        if (p.type === 'n') {
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.024, 0.026), p.color === 'w' ? this.white : this.black);
          head.position.set(0, 0.036, 0.004);
          head.rotation.x = -0.4;
          m.add(head);
        }
        g.add(m);
      });
    } else {
      const b = state.data?.board;
      if (b) {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const ch = b[r * 8 + c];
          if (ch === '.') continue;
          const white = ch === 'w' || ch === 'W';
          const disc = new THREE.Mesh(new THREE.CylinderGeometry(CELL * 0.38, CELL * 0.38, 0.012, 18), white ? this.white : this.black);
          disc.castShadow = true;
          const [x, z] = place(c, 7 - r);
          disc.position.set(x, 0.006, z);
          g.add(disc);
          if (ch === 'W' || ch === 'B') {
            const top = disc.clone();
            top.position.y = 0.019;
            g.add(top);
          }
        }
      }
    }
    this.group.add(g);
    this.cache.set(table.id, { key, group: g });
  }

  /** Atualiza tudo a partir do hub (chamado a cada quadro). */
  update(hub) {
    GAME_TABLES.forEach((table) => {
      const state = hub.get(table.id);
      if (table.kind === 'chess' || table.kind === 'checkers') {
        this.boardPieces(table, state);
      } else if (table.kind === 'pool' && this.pool) {
        const balls = hub.poolBalls(table.id);
        balls.forEach((b) => {
          const m = this.pool[b.id];
          m.visible = !b.in;
          m.position.set(b.x * this.poolScale, 0, b.z * this.poolScale);
        });
      } else {
        const rt = this.realtime.get(table.id);
        const frame = hub.frame(table.id);
        const playing = state.status === 'playing';
        if (rt?.kind === 'pingpong') {
          rt.ball.visible = Boolean(frame) && playing;
          rt.paddles.forEach((p, i) => { p.visible = Boolean(state.players[i]); });
          if (frame) {
            rt.ball.position.set(frame.ball.x, frame.ball.h, frame.ball.z);
            rt.paddles[0].position.z = frame.paddles[0];
            rt.paddles[1].position.z = frame.paddles[1];
          }
        } else if (rt?.kind === 'foosball') {
          const controls = frame?.controls || [0, 0];
          const kicks = frame?.kicks || [false, false];
          rt.rods.forEach(({ rod, spin, men }) => {
            const zs = rodMen(rod, controls[rod[1]]);
            men.forEach((m, i) => { m.position.z = zs[i]; });
            spin.rotation.z = kicks[rod[1]] ? (rod[1] === 0 ? -1.1 : 1.1) : 0;
          });
          rt.ball.visible = playing;
          if (frame) rt.ball.position.set(frame.ball.x, FB.ball, frame.ball.z);
        }
      }
    });
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
    });
    [this.white, this.black].forEach((m) => m.dispose());
    this.group.parent?.remove(this.group);
  }
}
