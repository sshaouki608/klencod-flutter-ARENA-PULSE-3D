/* ARENA PULSE 3D - self-contained WebGL 3D engine + game logic (no external libs, works offline) */
(function () {
'use strict';
var canvas = document.getElementById('c');
function post(o) { try { Flutter.postMessage(JSON.stringify(o)); } catch (e) { /* not in webview */ } }
var gl = null;
try { gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
if (!gl) { post({ type: 'error', msg: 'WebGL is not supported on this device' }); return; }

var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
var rnd = Math.random;

/* ---------- matrices (column-major) ---------- */
var M = {
  id: function () { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  mul: function (a, b) {
    var o = new Float32Array(16);
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
    return o;
  },
  T: function (x, y, z) { var m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
  rotX: function (a) { var m = M.id(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
  rotY: function (a) { var m = M.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
  rotZ: function (a) { var m = M.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
  persp: function (fovy, asp, n, f) {
    var t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
    return m;
  },
  lookAt: function (e, t) {
    var zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2], l = Math.hypot(zx, zy, zz);
    zx /= l; zy /= l; zz /= l;
    var xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xz) || 1; xx /= l; xz /= l;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,  xy, yy, zy, 0,  xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1
    ]);
  }
};

/* ---------- shaders ---------- */
var VS = 'attribute vec3 aP;attribute vec3 aN;uniform mat4 uVP;uniform mat4 uM;uniform vec3 uS;' +
  'varying vec3 vN;varying vec3 vW;' +
  'void main(){vec4 w=uM*vec4(aP*uS,1.0);vW=w.xyz;vN=mat3(uM)*aN;gl_Position=uVP*w;}';
var FS = 'precision mediump float;varying vec3 vN;varying vec3 vW;' +
  'uniform vec3 uC;uniform float uE;uniform float uA;uniform vec3 uEye;uniform vec3 uFog;' +
  'void main(){vec3 n=normalize(vN);vec3 L=normalize(vec3(0.4,0.9,0.3));' +
  'float d=max(dot(n,L),0.0);float h=0.5+0.5*n.y;' +
  'vec3 col=uC*(0.25+0.55*d+0.2*h)+uC*uE;' +
  'float f=clamp((length(vW-uEye)-26.0)/46.0,0.0,1.0);' +
  'gl_FragColor=vec4(mix(col,uFog,f),uA);}';
function shader(type, src) {
  var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { post({ type: 'error', msg: 'Shader: ' + gl.getShaderInfoLog(s) }); return null; }
  return s;
}
var prog = gl.createProgram();
gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { post({ type: 'error', msg: 'Program link failed' }); return; }
gl.useProgram(prog);
var aP = gl.getAttribLocation(prog, 'aP'), aN = gl.getAttribLocation(prog, 'aN');
var U = {};
['uVP', 'uM', 'uS', 'uC', 'uE', 'uA', 'uEye', 'uFog'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aN);
gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
var FOG = [0.03, 0.02, 0.08];
gl.uniform3f(U.uFog, FOG[0], FOG[1], FOG[2]);

/* ---------- meshes ---------- */
function mk(p, n, ix) {
  var pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(p), gl.STATIC_DRAW);
  var nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(n), gl.STATIC_DRAW);
  var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ix), gl.STATIC_DRAW);
  return { pb: pb, nb: nb, ib: ib, n: ix.length };
}
function makeCube() {
  var F = [[0,0,1, 1,0,0, 0,1,0], [0,0,-1, -1,0,0, 0,1,0], [1,0,0, 0,0,-1, 0,1,0],
           [-1,0,0, 0,0,1, 0,1,0], [0,1,0, 1,0,0, 0,0,-1], [0,-1,0, 1,0,0, 0,0,1]];
  var cs = [[-1,-1], [1,-1], [1,1], [-1,1]], p = [], n = [], ix = [];
  F.forEach(function (f, fi) {
    cs.forEach(function (c) {
      p.push((f[0] + c[0] * f[3] + c[1] * f[6]) * 0.5, (f[1] + c[0] * f[4] + c[1] * f[7]) * 0.5, (f[2] + c[0] * f[5] + c[1] * f[8]) * 0.5);
      n.push(f[0], f[1], f[2]);
    });
    var b = fi * 4; ix.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return mk(p, n, ix);
}
function makeSphere(la, lo) {
  var p = [], n = [], ix = [], i, j;
  for (i = 0; i <= la; i++) {
    var th = i * Math.PI / la, st = Math.sin(th), ct = Math.cos(th);
    for (j = 0; j <= lo; j++) {
      var ph = j * 2 * Math.PI / lo, x = Math.cos(ph) * st, z = Math.sin(ph) * st;
      p.push(x * 0.5, ct * 0.5, z * 0.5); n.push(x, ct, z);
    }
  }
  for (i = 0; i < la; i++) for (j = 0; j < lo; j++) {
    var a = i * (lo + 1) + j, b = a + lo + 1;
    ix.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return mk(p, n, ix);
}
var CUBE = makeCube(), SPH = makeSphere(10, 14);
var boundMesh = null;
function draw(mesh, m, s, c, e, a) {
  if (boundMesh !== mesh) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pb); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nb); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
    boundMesh = mesh;
  }
  gl.uniformMatrix4fv(U.uM, false, m);
  gl.uniform3f(U.uS, s[0], s[1], s[2]);
  gl.uniform3f(U.uC, c[0], c[1], c[2]);
  gl.uniform1f(U.uE, e || 0);
  gl.uniform1f(U.uA, a === undefined ? 1 : a);
  gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
}
function box(P, x, y, z, sx, sy, sz, col, em) { draw(CUBE, M.mul(P, M.T(x, y, z)), [sx, sy, sz], col, em, 1); }

/* ---------- audio (WebAudio, synthesized - no files) ---------- */
var ac = null, master = null;
var cfg = { volume: 0.7, sens: 0.5, quality: 1 };
function audio() {
  if (!ac) {
    try { var C = window.AudioContext || window.webkitAudioContext; ac = new C(); master = ac.createGain(); master.connect(ac.destination); }
    catch (e) { return null; }
  }
  if (ac.state === 'suspended') { try { ac.resume(); } catch (e) { /* ignore */ } }
  master.gain.value = cfg.volume;
  return ac;
}
function tone(f1, f2, d, type, v) {
  if (cfg.volume <= 0.01) return;
  var a = audio(); if (!a) return;
  try {
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.03);
  } catch (e) { /* ignore */ }
}
var SFX = {
  throwK: function () { tone(700, 280, 0.09, 'square', 0.12); },
  hit: function () { tone(220, 50, 0.18, 'sawtooth', 0.22); },
  block: function () { tone(900, 1500, 0.12, 'sine', 0.2); },
  dash: function () { tone(250, 900, 0.18, 'triangle', 0.2); },
  shield: function () { tone(500, 1100, 0.3, 'sine', 0.2); },
  pulse: function () { tone(120, 520, 0.35, 'sawtooth', 0.18); },
  slow: function () { tone(900, 120, 0.5, 'sine', 0.2); },
  win: function () { tone(440, 880, 0.2, 'triangle', 0.25); setTimeout(function () { tone(660, 1320, 0.3, 'triangle', 0.25); }, 180); },
  lose: function () { tone(300, 60, 0.6, 'sawtooth', 0.25); }
};

/* ---------- world ---------- */
var H = 20; // arena half size
var OBS = [
  { x: -9, z: -5, w: 1.2, d: 1.2, h: 4 }, { x: 9, z: -5, w: 1.2, d: 1.2, h: 4 },
  { x: -9, z: 5, w: 1.2, d: 1.2, h: 4 },  { x: 9, z: 5, w: 1.2, d: 1.2, h: 4 },
  { x: 0, z: 0, w: 2.5, d: 2.5, h: 1.0 },
  { x: -14, z: 0, w: 0.6, d: 3, h: 2.5 }, { x: 14, z: 0, w: 0.6, d: 3, h: 2.5 }
];
var DIFF = [
  { hp: 80,  spd: 4.5, ra: 1.8,  err: 0.22, dmg: 6,  dodge: 0.35, D: 11,  ab: 0 },
  { hp: 100, spd: 6.0, ra: 1.2,  err: 0.12, dmg: 8,  dodge: 0.65, D: 9,   ab: 1 },
  { hp: 120, spd: 7.2, ra: 0.85, err: 0.05, dmg: 10, dodge: 0.9,  D: 7.5, ab: 2 }
];
var KNIFE_SPEED = 22, PULSE_SPEED = 15, ABIL_CD = 10;

function mkEnt(x, z, hp) {
  return { x: x, z: z, ang: 0, hp: hp, max: hp, walk: 0, moveAmt: 0, vx: 0, vz: 0, throwCd: 0.6, throwAnim: 0,
           flash: 0, shield: 0, dashT: 0, dx: 0, dz: 1, slowT: 0, dead: 0, strafe: 1, strafeT: 1, acd: 6 };
}
var P, E, knives = [], pulses = [], parts = [];
var G = { over: false, paused: true, started: false, diff: 1, t: 0, shake: 0, overT: 0, posted: false, stT: 0 };
var inp = { x: 0, y: 0 }, sel = 0, pcd = 5, ca = Math.PI;
var DF = DIFF[1];

function ang2(ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); }
function angDiff(a, b) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function ts(e) { return e.slowT > 0 ? 0.4 : 1; }

function resetGame(diff) {
  DF = DIFF[clamp(diff | 0, 0, 2)]; G.diff = diff;
  P = mkEnt(0, 14, 100); E = mkEnt(0, -14, DF.hp);
  knives = []; pulses = []; parts = [];
  pcd = 5; G.over = false; G.paused = false; G.started = true; G.t = 0; G.overT = 0; G.posted = false; G.shake = 0; G.stT = 0;
  ca = ang2(P.x, P.z, E.x, E.z); P.ang = ca; E.ang = ca + Math.PI;
  inp.x = 0; inp.y = 0;
}
resetGame(1); G.paused = true; G.started = false;

/* ---------- particles ---------- */
function burst(x, y, z, n, col, spd, life, size) {
  var cap = [60, 120, 220][cfg.quality];
  for (var i = 0; i < n && parts.length < cap; i++) {
    var a = rnd() * 6.283, u = rnd() * 2 - 1, r = Math.sqrt(1 - u * u), s = spd * (0.4 + rnd() * 0.8);
    parts.push({ x: x, y: y, z: z, vx: Math.cos(a) * r * s, vy: u * s + 1.5, vz: Math.sin(a) * r * s, life: life * (0.6 + rnd() * 0.6), c: col, s: size });
  }
}
var C_CYAN = [0, 0.9, 1], C_VIO = [0.7, 0.3, 1], C_RED = [1, 0.3, 0.4], C_WHITE = [1, 1, 1];

/* ---------- collision ---------- */
function resolve(e) {
  var R = 0.6;
  e.x = clamp(e.x, -H + 1, H - 1); e.z = clamp(e.z, -H + 1, H - 1);
  for (var i = 0; i < OBS.length; i++) {
    var o = OBS[i], cx = clamp(e.x, o.x - o.w, o.x + o.w), cz = clamp(e.z, o.z - o.d, o.z + o.d);
    var dx = e.x - cx, dz = e.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < R * R) {
      if (d2 > 1e-6) { var d = Math.sqrt(d2), k = (R - d) / d; e.x += dx * k; e.z += dz * k; }
      else {
        var px = o.w - Math.abs(e.x - o.x), pz = o.d - Math.abs(e.z - o.z);
        if (px < pz) e.x += (e.x >= o.x ? 1 : -1) * (px + R); else e.z += (e.z >= o.z ? 1 : -1) * (pz + R);
      }
    }
  }
}
function separate() {
  var dx = E.x - P.x, dz = E.z - P.z, d = Math.hypot(dx, dz);
  if (d < 1.4 && d > 1e-4) { var k = (1.4 - d) / 2 / d; P.x -= dx * k; P.z -= dz * k; E.x += dx * k; E.z += dz * k; resolve(P); resolve(E); }
}
function moveEnt(e, dt) { e.x += e.vx * dt; e.z += e.vz * dt; resolve(e); }
function los(a, b) {
  for (var i = 1; i < 10; i++) {
    var t = i / 10, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    for (var j = 0; j < OBS.length; j++) { var o = OBS[j]; if (o.h > 1.5 && Math.abs(x - o.x) < o.w && Math.abs(z - o.z) < o.d) return false; }
  }
  return true;
}
function hitsTall(x, y, z) {
  for (var j = 0; j < OBS.length; j++) { var o = OBS[j]; if (y < o.h && Math.abs(x - o.x) < o.w + 0.1 && Math.abs(z - o.z) < o.d + 0.1) return true; }
  return false;
}

/* ---------- combat ---------- */
function fire(e, t, err, lead) {
  var dist = Math.hypot(t.x - e.x, t.z - e.z);
  var ax = t.x + t.vx * lead * dist / KNIFE_SPEED, az = t.z + t.vz * lead * dist / KNIFE_SPEED;
  var a = ang2(e.x, e.z, ax, az) + (rnd() - 0.5) * 2 * err, sx = Math.sin(a), sz = Math.cos(a);
  knives.push({ x: e.x + sx * 0.9, y: 1.5, z: e.z + sz * 0.9, vx: sx * KNIFE_SPEED, vz: sz * KNIFE_SPEED, own: e, ang: a, spin: 0, life: 2.2, dead: false });
  e.throwAnim = 1; SFX.throwK();
}
function damage(target, dmg, x, z, big) {
  if (target.dashT > 0) return false;           // dash = brief invulnerability
  if (target.shield > 0) { burst(x, 1.5, z, 10, C_CYAN, 5, 0.4, 0.14); SFX.block(); return true; }
  target.hp = Math.max(0, target.hp - dmg); target.flash = 0.15;
  burst(x, 1.4, z, big ? 22 : 12, target === P ? C_RED : C_WHITE, 6, 0.5, 0.14); SFX.hit();
  if (target === P) G.shake = Math.max(G.shake, 0.35);
  if (target.hp <= 0 && !G.over) {
    G.over = true; target.dead = 0.001; inp.x = 0; inp.y = 0;
    var win = target === E; if (win) SFX.win(); else SFX.lose();
  }
  return true;
}
function useAbility(e, o, kind, mx, mz) {
  if (kind === 0) {
    var l = Math.hypot(mx, mz);
    if (l < 0.1) { mx = e.x - o.x; mz = e.z - o.z; l = Math.hypot(mx, mz) || 1; }
    e.dx = mx / l; e.dz = mz / l; e.dashT = 0.22; SFX.dash(); burst(e.x, 1, e.z, 14, e === P ? C_CYAN : C_VIO, 4, 0.4, 0.12);
  } else if (kind === 1) { e.shield = 3; SFX.shield(); }
  else if (kind === 2) {
    var a = ang2(e.x, e.z, o.x, o.z);
    pulses.push({ x: e.x + Math.sin(a) * 1.2, y: 1.5, z: e.z + Math.cos(a) * 1.2, vx: Math.sin(a) * PULSE_SPEED, vz: Math.cos(a) * PULSE_SPEED, own: e, life: 3, dead: false });
    e.throwAnim = 1; SFX.pulse();
  } else if (kind === 3) { o.slowT = 4; SFX.slow(); burst(o.x, 1.5, o.z, 18, [0.4, 0.6, 1], 4, 0.6, 0.14); }
}

/* ---------- update ---------- */
function updatePlayer(dt) {
  P.throwCd -= dt;
  var fx = Math.sin(ca), fz = Math.cos(ca), rx = -fz, rz = fx;
  var mx = fx * inp.y + rx * inp.x, mz = fz * inp.y + rz * inp.x;
  if (P.dashT > 0) { P.vx = P.dx * 26; P.vz = P.dz * 26; } else { P.vx = mx * 7.2; P.vz = mz * 7.2; }
  moveEnt(P, dt);
  var sp = Math.hypot(P.vx, P.vz);
  P.moveAmt += (clamp(sp / 7, 0, 1) - P.moveAmt) * Math.min(1, dt * 10);
  P.walk += dt * sp * 1.6;
  P.ang = ang2(P.x, P.z, E.x, E.z);
}
function updateEnemy(dt) {
  E.throwCd -= dt; E.acd -= dt; E.strafeT -= dt;
  var dx = P.x - E.x, dz = P.z - E.z, dist = Math.hypot(dx, dz) || 1, nx = dx / dist, nz = dz / dist, px = -nz, pz = nx;
  if (E.strafeT <= 0) { E.strafe = rnd() < 0.5 ? -1 : 1; E.strafeT = 1 + rnd() * 1.6; }
  var rad = clamp((dist - DF.D) * 0.4, -1, 1);
  var mx = nx * rad + px * E.strafe * 0.8, mz = nz * rad + pz * E.strafe * 0.8, thr = false, ddx = 0, ddz = 0;
  for (var i = 0; i < knives.length; i++) {
    var k = knives[i]; if (k.own !== P || k.dead) continue;
    var kl = Math.hypot(k.vx, k.vz), kx = k.vx / kl, kz = k.vz / kl, rx = E.x - k.x, rz = E.z - k.z;
    var along = rx * kx + rz * kz;
    if (along > 0 && along < 9) {
      var qx = rx - kx * along, qz = rz - kz * along, pd = Math.hypot(qx, qz);
      if (pd < 1.4) {
        if (k.react === undefined) k.react = rnd() < DF.dodge;
        if (k.react) { thr = true; if (pd > 0.05) { ddx = qx / pd; ddz = qz / pd; } else { ddx = px; ddz = pz; } mx += ddx * 2.4; mz += ddz * 2.4; }
      }
    }
  }
  if (Math.abs(E.x) > H - 3) mx -= Math.sign(E.x) * 0.8;
  if (Math.abs(E.z) > H - 3) mz -= Math.sign(E.z) * 0.8;
  var ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  if (E.dashT > 0) { E.vx = E.dx * 26; E.vz = E.dz * 26; } else { var sp = DF.spd * (thr ? 1.35 : 1); E.vx = mx * sp; E.vz = mz * sp; }
  moveEnt(E, dt);
  var v = Math.hypot(E.vx, E.vz);
  E.moveAmt += (clamp(v / 7, 0, 1) - E.moveAmt) * Math.min(1, dt * 10);
  E.walk += dt * v * 1.6;
  E.ang = ang2(E.x, E.z, P.x, P.z);
  var see = los(E, P);
  if (E.throwCd <= 0 && dist < 28 && see) { fire(E, P, DF.err, DF.ab >= 2 ? 0.5 : 0); E.throwCd = DF.ra + rnd() * 0.4; }
  if (DF.ab > 0 && E.acd <= 0) {
    if (thr) {
      if (DF.ab === 2 && rnd() < 0.5) useAbility(E, P, 1, 0, 0); else useAbility(E, P, 0, ddx, ddz);
      E.acd = DF.ab === 2 ? 7 : 11;
    } else if (DF.ab === 2 && see && dist < 20 && rnd() < dt * 0.8) { useAbility(E, P, 2, 0, 0); E.acd = 8; }
  }
}
function updateKnives(dt) {
  for (var i = 0; i < knives.length; i++) {
    var k = knives[i], s = k.own === E ? ts(E) : 1, d = dt * s;
    k.x += k.vx * d; k.z += k.vz * d; k.spin += d * 22; k.life -= d;
    if (k.life <= 0 || Math.abs(k.x) > H + 1 || Math.abs(k.z) > H + 1) { k.dead = true; continue; }
    if (hitsTall(k.x, k.y, k.z)) { k.dead = true; burst(k.x, k.y, k.z, 6, C_VIO, 3, 0.3, 0.1); continue; }
    var t = k.own === P ? E : P;
    if (!G.over && Math.hypot(t.x - k.x, t.z - k.z) < 0.75) {
      var dmg = k.own === P ? 10 : DF.dmg;
      if (t.dashT > 0) continue;
      k.dead = true; damage(t, dmg, k.x, k.z, false);
    }
  }
  knives = knives.filter(function (k) { return !k.dead; });
}
function updatePulses(dt) {
  for (var i = 0; i < pulses.length; i++) {
    var p = pulses[i], s = p.own === E ? ts(E) : 1, d = dt * s;
    p.x += p.vx * d; p.z += p.vz * d; p.life -= d;
    burst(p.x, p.y, p.z, 1, C_VIO, 1, 0.3, 0.1);
    if (p.life <= 0 || Math.abs(p.x) > H + 1 || Math.abs(p.z) > H + 1 || hitsTall(p.x, p.y, p.z)) { p.dead = true; burst(p.x, p.y, p.z, 10, C_VIO, 4, 0.4, 0.14); continue; }
    var t = p.own === P ? E : P;
    if (!G.over && Math.hypot(t.x - p.x, t.z - p.z) < 1.0) {
      if (t.dashT > 0) continue;
      p.dead = true; damage(t, 22, p.x, p.z, true);
    }
  }
  pulses = pulses.filter(function (p) { return !p.dead; });
}
function updateParts(dt) {
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i]; p.life -= dt; p.vy -= 14 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
  }
  parts = parts.filter(function (p) { return p.life > 0; });
}
function timers(e, dt) {
  e.flash = Math.max(0, e.flash - dt); e.shield = Math.max(0, e.shield - dt); e.dashT = Math.max(0, e.dashT - dt);
  e.slowT = Math.max(0, e.slowT - dt); e.throwAnim = Math.max(0, e.throwAnim - dt * 4);
  if (e.dead > 0) e.dead += dt;
}
function update(dt) {
  G.t += dt; G.shake = Math.max(0, G.shake - dt * 1.5);
  pcd = Math.max(0, pcd - dt);
  timers(P, dt); timers(E, dt);
  if (!G.over) { updatePlayer(dt); updateEnemy(dt * ts(E)); separate(); }
  else {
    G.overT += dt;
    if (G.overT > 1.4 && !G.posted) { G.posted = true; post({ type: 'over', win: E.hp <= 0 }); }
  }
  updateKnives(dt); updatePulses(dt); updateParts(dt);
  var target = ang2(P.x, P.z, E.x, E.z), k = 3 + cfg.sens * 10;
  ca += angDiff(ca, target) * (1 - Math.exp(-k * dt));
  G.stT += dt;
  if (G.stT >= 0.1) {
    G.stT = 0;
    post({ type: 'state', hp: P.hp / P.max * 100, ehp: E.hp / E.max * 100, cd: pcd });
  }
}

/* ---------- rendering ---------- */
function drawChar(c, col, glow) {
  var P0 = M.mul(M.T(c.x, 0, c.z), M.rotY(c.ang));
  if (c.dead > 0) P0 = M.mul(P0, M.rotX(-Math.min(c.dead * 2, 1) * 1.45));
  var body = c.flash > 0 ? [1, 1, 1] : (c.slowT > 0 ? [0.3, 0.45, 0.9] : col);
  var sw = Math.sin(c.walk) * c.moveAmt * 0.8;
  function limb(x, y, ang, L, w, cl) {
    var m = M.mul(M.mul(P0, M.T(x, y, 0)), M.mul(M.rotX(ang), M.T(0, -L / 2, 0)));
    draw(CUBE, m, [w, L, w], cl, 0.08, 1);
  }
  limb(-0.18, 0.85, sw, 0.85, 0.26, body);
  limb(0.18, 0.85, -sw, 0.85, 0.26, body);
  box(P0, 0, 1.25, 0, 0.62, 0.8, 0.34, body, 0.1);
  box(P0, 0, 1.05, 0, 0.64, 0.1, 0.36, glow, 1.0);
  limb(-0.42, 1.6, -sw, 0.7, 0.2, body);
  limb(0.42, 1.6, -2.2 * c.throwAnim + sw * (1 - c.throwAnim), 0.7, 0.2, body);
  draw(SPH, M.mul(P0, M.T(0, 1.92, 0)), [0.42, 0.42, 0.42], body, 0.1, 1);
  box(P0, 0, 1.95, 0.18, 0.32, 0.09, 0.1, glow, 1.4);
}
function render() {
  gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.depthMask(true);
  var fx = Math.sin(ca), fz = Math.cos(ca), rx = -fz, rz = fx, sh = G.shake * 0.25;
  var eye = [P.x - fx * 7.5 + rx * 1.0 + (rnd() - 0.5) * sh, 4.6 + (rnd() - 0.5) * sh, P.z - fz * 7.5 + rz * 1.0];
  var tgt = [P.x + fx * 6 + rx * 1.0, 1.3, P.z + fz * 6 + rz * 1.0];
  var asp = canvas.width / Math.max(1, canvas.height);
  var VP = M.mul(M.persp(1.05, asp, 0.3, 140), M.lookAt(eye, tgt));
  gl.uniformMatrix4fv(U.uVP, false, VP);
  gl.uniform3f(U.uEye, eye[0], eye[1], eye[2]);
  var I = M.id(), t = G.t, i;
  // floor + border
  box(I, 0, -0.5, 0, 2 * H + 2, 1, 2 * H + 2, [0.06, 0.05, 0.12], 0);
  var gs = [8, 5, 4][cfg.quality];
  for (i = -H; i <= H; i += gs) {
    box(I, i, 0.01, 0, 0.06, 0.02, 2 * H, [0, 0.55, 0.75], 0.8);
    box(I, 0, 0.01, i, 2 * H, 0.02, 0.06, [0, 0.55, 0.75], 0.8);
  }
  box(I, 0, 0.5, -H - 0.25, 2 * H + 1, 1, 0.5, [0.1, 0.07, 0.2], 0.05);
  box(I, 0, 0.5, H + 0.25, 2 * H + 1, 1, 0.5, [0.1, 0.07, 0.2], 0.05);
  box(I, -H - 0.25, 0.5, 0, 0.5, 1, 2 * H + 1, [0.1, 0.07, 0.2], 0.05);
  box(I, H + 0.25, 0.5, 0, 0.5, 1, 2 * H + 1, [0.1, 0.07, 0.2], 0.05);
  box(I, 0, 1.02, -H - 0.25, 2 * H + 1, 0.06, 0.55, C_VIO, 1);
  box(I, 0, 1.02, H + 0.25, 2 * H + 1, 0.06, 0.55, C_CYAN, 1);
  box(I, -H - 0.25, 1.02, 0, 0.55, 0.06, 2 * H + 1, C_VIO, 1);
  box(I, H + 0.25, 1.02, 0, 0.55, 0.06, 2 * H + 1, C_CYAN, 1);
  // spawn pads
  box(I, 0, 0.05, 14, 5, 0.1, 5, [0.05, 0.3, 0.4], 0.6);
  box(I, 0, 0.05, -14, 5, 0.1, 5, [0.3, 0.12, 0.45], 0.6);
  // obstacles
  for (i = 0; i < OBS.length; i++) {
    var o = OBS[i];
    box(I, o.x, o.h / 2, o.z, 2 * o.w, o.h, 2 * o.d, [0.12, 0.1, 0.24], 0.05);
    box(I, o.x, o.h + 0.04, o.z, 2 * o.w + 0.08, 0.08, 2 * o.d + 0.08, C_CYAN, 1.2);
  }
  // skyline + floating crystals
  var n = cfg.quality === 0 ? 8 : 16;
  for (i = 0; i < n; i++) {
    var a = i * 6.2832 / n, hh = 6 + ((i * 37) % 11), rr = 36;
    box(I, Math.cos(a) * rr, hh / 2, Math.sin(a) * rr, 4, hh, 4, [0.07, 0.06, 0.15], 0.05);
    box(I, Math.cos(a) * rr, hh + 0.05, Math.sin(a) * rr, 4.1, 0.15, 4.1, i % 2 ? C_VIO : C_CYAN, 1.2);
  }
  if (cfg.quality > 0) for (i = 0; i < 8; i++) {
    var b = i * 0.7854 + t * 0.1, m2 = M.mul(M.mul(M.T(Math.cos(b) * 28, 8 + Math.sin(t + i), Math.sin(b) * 28), M.rotY(t + i)), M.rotX(0.6));
    draw(CUBE, m2, [1.4, 1.4, 1.4], C_VIO, 1.0, 1);
  }
  // characters
  drawChar(P, [0.1, 0.5, 0.7], C_CYAN);
  drawChar(E, [0.45, 0.18, 0.75], [1, 0.35, 0.7]);
  // knives
  for (i = 0; i < knives.length; i++) {
    var k = knives[i], km = M.mul(M.mul(M.T(k.x, k.y, k.z), M.rotY(k.ang)), M.rotZ(k.spin));
    draw(CUBE, km, [0.04, 0.17, 0.5], k.own === P ? [0.8, 1, 1] : [1, 0.8, 0.95], k.own === P ? 0.8 : 0.9, 1);
    draw(CUBE, M.mul(km, M.T(0, 0, -0.38)), [0.07, 0.07, 0.22], C_VIO, 0.6, 1);
  }
  // pulses
  for (i = 0; i < pulses.length; i++) {
    var p = pulses[i], pz = 0.8 + 0.12 * Math.sin(t * 20);
    draw(SPH, M.T(p.x, p.y, p.z), [pz, pz, pz], C_VIO, 1.4, 1);
    draw(SPH, M.T(p.x, p.y, p.z), [0.45, 0.45, 0.45], C_WHITE, 1.2, 1);
  }
  // particles
  for (i = 0; i < parts.length; i++) {
    var q = parts[i], sz = q.s * clamp(q.life * 3, 0.3, 1.5);
    draw(CUBE, M.T(q.x, q.y, q.z), [sz, sz, sz], q.c, 1.2, 1);
  }
  // transparent: shields
  gl.depthMask(false);
  [P, E].forEach(function (c) {
    if (c.shield > 0) {
      var al = 0.22 + 0.1 * Math.sin(t * 12), sc = 2.6 + 0.1 * Math.sin(t * 9);
      draw(SPH, M.T(c.x, 1.2, c.z), [sc, sc, sc], c === P ? C_CYAN : [1, 0.4, 0.8], 0.9, al);
    }
  });
  gl.depthMask(true);
}

/* ---------- loop / resize ---------- */
function resize() {
  var dpr = window.devicePixelRatio || 1, sc = [0.5, 0.75, 1][cfg.quality];
  var w = Math.floor((window.innerWidth || 800) * dpr * sc), h = Math.floor((window.innerHeight || 400) * dpr * sc);
  var maxW = [800, 1200, 1800][cfg.quality];
  if (w > maxW) { h = Math.floor(h * maxW / w); w = maxW; }
  canvas.width = Math.max(2, w); canvas.height = Math.max(2, h);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();
var last = 0;
function frame(ts_) {
  var dt = Math.min(0.05, (ts_ - last) / 1000 || 0.016); last = ts_;
  if (G.started && !G.paused) update(dt);
  boundMesh = null;
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- public API (called from Flutter) ---------- */
window.Game = {
  start: function (diff) { resetGame(diff); },
  input: function (x, y) { if (G.over) { inp.x = 0; inp.y = 0; return; } var l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } inp.x = x; inp.y = y; },
  throwKnife: function () {
    if (!G.started || G.paused || G.over || P.throwCd > 0) return;
    P.throwCd = 0.42; fire(P, E, 0, 0.6);
  },
  selectAbility: function (i) { sel = clamp(i | 0, 0, 3); },
  ability: function () {
    if (!G.started || G.paused || G.over || pcd > 0) return;
    var fx = Math.sin(ca), fz = Math.cos(ca), mx = fx * inp.y + (-fz) * inp.x, mz = fz * inp.y + fx * inp.x;
    useAbility(P, E, sel, mx, mz); pcd = ABIL_CD;
  },
  pause: function (b) { if (G.started) G.paused = !!b; },
  settings: function (o) {
    if (o.volume !== undefined) cfg.volume = clamp(+o.volume, 0, 1);
    if (o.sens !== undefined) cfg.sens = clamp(+o.sens, 0, 1);
    if (o.quality !== undefined) { cfg.quality = clamp(o.quality | 0, 0, 2); resize(); }
    if (master) master.gain.value = cfg.volume;
  }
};
post({ type: 'ready' });
})();
