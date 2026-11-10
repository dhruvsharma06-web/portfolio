// GLSL sources for the space journey. Kept apart from the scene code so each effect reads on its own.

export const FULLSCREEN_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const NOISE = /* glsl */`
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float vnoise3(vec3 p) { vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3. - 2. * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z); }
float fbm(vec2 p) { float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= .5; } return s; }
float fbm3(vec3 p) { float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a * vnoise3(p); p *= 2.02; a *= .5; } return s; }
`;

/* Starfield sampled by direction, shared by the black hole background */
const STARS = /* glsl */`
vec3 starLayer(vec2 sp, float sc, float thr, float seed) {
  vec2 g = sp * sc; vec2 id = floor(g); vec2 f = fract(g);
  float h = hash12(id + seed);
  if (h < thr) return vec3(0.);
  vec2 c = vec2(hash12(id + seed + 1.7), hash12(id + seed + 9.1)) * .6 + .2;
  float d = length(f - c);
  float b = smoothstep(.09, 0., d) * (h - thr) / (1. - thr);
  vec3 tint = mix(vec3(.7, .82, 1.), vec3(1., .86, .7), hash12(id + 4.4));
  return tint * b;
}
vec3 starsDir(vec3 d) {
  vec2 sp = vec2(atan(d.z, d.x) / 6.2831, asin(clamp(d.y, -1., 1.)) / 3.1416);
  vec3 c = starLayer(sp, 220., .93, 0.) * 2.2 + starLayer(sp, 520., .9, 13.) * 1.1;
  float band = exp(-pow(d.y * 2.4 - .35 * d.x, 2.) * 5.);
  c += vec3(.16, .13, .22) * band * pow(fbm(sp * 14.), 2.) * .9;
  return c;
}
`;

/* Gargantua: ray-traced Schwarzschild lensing of a thin accretion disk (units where rs = 1). */
export const BLACKHOLE_FS = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes; uniform float uTime; uniform float uFade; uniform vec2 uLook; uniform float uSteps; uniform vec2 uShift; uniform float uZoom; uniform float uDist;
${NOISE}
${STARS}
void main() {
  vec2 uv = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
  uv -= uShift;
  float tilt = .085 + uLook.y * .03;
  vec3 ro = vec3(sin(uLook.x * .08) * 3., uDist * sin(tilt), -uDist * cos(tilt));
  vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0, 1, 0), fw)), up = cross(fw, rt);
  vec3 rd = normalize(fw * uZoom + rt * uv.x + up * uv.y);
  rd = normalize(rd + up * -.02);

  vec3 pos = ro, vel = rd;
  vec3 h = cross(pos, vel); float h2 = dot(h, h);
  vec3 col = vec3(0.); float alpha = 0.; float minR = 99.;
  for (int i = 0; i < 260; i++) {
    if (float(i) > uSteps) break;
    float r2 = dot(pos, pos), r = sqrt(r2); minR = min(minR, r);
    if (r < 1.) { alpha = 1.; break; }
    float dt = clamp(.085 * r, .03, .9);
    vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
    vec3 npos = pos + vel * dt; vel += acc * dt;
    if (pos.y * npos.y < 0.) {
      vec3 hit = mix(pos, npos, pos.y / (pos.y - npos.y));
      float rr = length(hit.xz);
      if (rr > 2.6 && rr < 14.) {
        // differential rotation: inner gas laps the outer gas
        float spin = uTime * 1.4 / pow(rr, 1.5);
        float cs = cos(spin), sn = sin(spin);
        vec2 q = mat2(cs, -sn, sn, cs) * hit.xz;
        float clumps = fbm(q * 1.1 + 7.);
        float fine = .5 + .5 * sin(rr * 34. + clumps * 9.);
        float streak = clumps * .75 + fine * .25 + fbm(vec2(rr * 6., clumps * 3.)) * .25;
        float temp = clamp(1. - (rr - 2.6) / 11.4, 0., 1.);
        float dens = smoothstep(2.6, 2.85, rr) * smoothstep(14., 7.5, rr) * (.35 + .8 * streak);
        vec3 hot = mix(vec3(.85, .3, .06), vec3(1., .7, .34), pow(temp, .8));
        hot = mix(hot, vec3(1., .95, .84), pow(temp, 4.));
        vec3 vd = normalize(vec3(-hit.z, 0., hit.x));
        float dop = dot(vd, normalize(vel));
        float beam = pow(1. + .6 * dop, 3.);
        vec3 dc = hot * dens * (.75 + 2.4 * pow(temp, 3.)) * beam;
        float a = clamp(dens * .85, 0., 1.);
        col += (1. - alpha) * dc * a; alpha += (1. - alpha) * a;
        if (alpha > .985) break;
      }
    }
    pos = npos;
    if (r2 > uDist * uDist * 1.9) break;
  }
  // full bending near the hole, softened far out so distant stars stay points
  vec3 bg = starsDir(normalize(mix(rd, normalize(vel), mix(.3, 1., smoothstep(13., 4., minR)))));
  col += (1. - alpha) * bg;
  // thin photon ring hugging the shadow
  col += (1. - alpha) * vec3(1., .78, .52) * exp(-abs(minR - 1.52) * 40.) * .45;
  col = 1. - exp(-col * 1.05);
  col *= uFade;
  gl_FragColor = vec4(col, 1.);
}
`;

/* Warp tunnel / travelling starfield. uWarp 0 = still stars, 1 = full streaks */
export const WARP_FS = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes; uniform float uTime; uniform float uWarp; uniform float uAlpha; uniform vec3 uTint;
${NOISE}
void main() {
  vec2 uv = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
  float r = length(uv), a = atan(uv.y, uv.x);
  vec3 col = vec3(0.);
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float cells = 140. + fl * 90.;
    float ca = floor((a / 6.2831 + .5) * cells);
    float h = hash12(vec2(ca, fl * 7.3));
    float speed = (.15 + h * .5) * (.05 + uWarp * 3.2);
    float z = fract(h * 13.7 + uTime * speed);               // radial position of this streak
    float len = .004 + uWarp * (.12 + h * .25);
    float head = z * 1.2;
    float d = head - r;
    float on = step(.62, hash12(vec2(ca, fl + 2.))) * smoothstep(len, 0., d) * step(0., d);
    float width = abs(fract((a / 6.2831 + .5) * cells) - .5);
    on *= smoothstep(.5, .12, width) * smoothstep(0., .25, r);
    col += mix(vec3(.7, .8, 1.), uTint, h) * on * (.35 + .9 * z) * (1. - fl * .25);
  }
  // still stars when not warping
  vec2 g = vUv * uRes / 3.;
  float s = hash12(floor(g));
  col += vec3(step(.9965, s)) * (1. - uWarp) * (.4 + .6 * hash12(floor(g) + 1.)) * (.6 + .4 * sin(uTime * 2. + s * 50.));
  col += uTint * exp(-r * 5.) * uWarp * uWarp * .35;
  col *= 1. + uWarp * .6;
  gl_FragColor = vec4(col * uAlpha, 1.);
}
`;

/* Procedural planet surfaces. kind: 0 rocky, 1 gas bands, 2 earth, 3 ice */
export const PLANET_VS = /* glsl */`
varying vec3 vN; varying vec3 vP; varying vec3 vW;
void main() { vN = normalize(normalMatrix * normal); vP = position; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
export const PLANET_FS = /* glsl */`
precision highp float;
varying vec3 vN; varying vec3 vP; varying vec3 vW;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uKind; uniform float uTime; uniform float uSeed;
uniform vec3 uSun; uniform float uOpacity; uniform float uHover; uniform float uNight;
${NOISE}
void main() {
  vec3 p = normalize(vP);
  vec3 c;
  float spec = 0.;
  if (uKind < .5) {                 // rocky / cratered
    float n = fbm3(p * 3. + uSeed) * .7 + fbm3(p * 12. + uSeed) * .3;
    c = mix(uA, uB, smoothstep(.3, .7, n));
    float cr = smoothstep(.62, .66, fbm3(p * 7. + uSeed * 2.)); c = mix(c, uC, cr * .6);
  } else if (uKind < 1.5) {         // gas giant bands
    float lat = p.y + fbm3(p * 2.5 + vec3(uTime * .02, 0., uSeed)) * .18;
    float b = sin(lat * 18. + uSeed) * .5 + .5;
    c = mix(uA, uB, b); c = mix(c, uC, smoothstep(.55, .9, fbm3(p * 5. + uSeed)) * .5);
  } else if (uKind < 2.5) {         // earth
    float land = fbm3(p * 2.2 + 4.1) + fbm3(p * 6. + 1.3) * .25;
    float isLand = smoothstep(.56, .6, land);
    float ice = smoothstep(.78, .86, abs(p.y));
    vec3 ocean = mix(vec3(.02, .08, .22), vec3(.03, .2, .42), fbm3(p * 4.));
    vec3 ground = mix(vec3(.12, .3, .1), vec3(.45, .38, .22), smoothstep(.6, .85, land));
    c = mix(ocean, ground, isLand); c = mix(c, vec3(.92), ice);
    spec = (1. - isLand) * (1. - ice);
    float cl = smoothstep(.5, .78, fbm3(p * 3.4 + vec3(uTime * .015, 0., 0.)) + fbm3(p * 9.) * .2);
    c = mix(c, vec3(1.), cl * .85);
    // city lights on the night side
    float night = smoothstep(.05, -.2, dot(normalize(vN), normalize(uSun)));
    float cities = isLand * (1. - ice) * step(.86, hash13(floor(p * 160.))) * (1. - cl) * smoothstep(.45, .7, vnoise3(p * 9.));
    c += vec3(1., .72, .38) * cities * night * uNight * 1.1;
  } else {                          // ice giant
    float b = fbm3(p * vec3(1., 6., 1.) + uSeed);
    c = mix(uA, uB, b);
  }
  vec3 n = normalize(vN);
  float diff = clamp(dot(n, normalize(uSun)), 0., 1.);
  float light = .08 + diff * 1.05;
  vec3 v = vec3(0., 0., 1.);
  float rim = pow(1. - clamp(dot(n, v), 0., 1.), 3.);
  vec3 col = c * light;
  col += pow(clamp(dot(reflect(-normalize(uSun), n), v), 0., 1.), 24.) * spec * .6;
  col += mix(uB, vec3(.6, .8, 1.), .5) * rim * (.35 + uHover * .8);
  gl_FragColor = vec4(col, uOpacity);
}
`;

/* Additive atmosphere shell */
export const ATMO_FS = /* glsl */`
precision highp float;
varying vec3 vN; varying vec3 vP; varying vec3 vW;
uniform vec3 uColor; uniform vec3 uSun; uniform float uOpacity;
void main() {
  vec3 v = vec3(0., 0., 1.);
  float rim = pow(1. - clamp(dot(normalize(vN), v), 0., 1.), 2.4);
  float lit = clamp(dot(normalize(vN), normalize(uSun)) * .6 + .5, 0., 1.);
  gl_FragColor = vec4(uColor * rim * lit * 1.6 * uOpacity, 1.);
}
`;

/* Sun surface */
export const SUN_FS = /* glsl */`
precision highp float;
varying vec3 vN; varying vec3 vP; varying vec3 vW;
uniform float uTime; uniform float uOpacity;
${NOISE}
void main() {
  vec3 p = normalize(vP);
  float n = fbm3(p * 4. + vec3(0., uTime * .08, 0.)) * .6 + fbm3(p * 14. - uTime * .1) * .4;
  vec3 c = mix(vec3(1., .45, .08), vec3(1., .92, .6), n);
  vec3 v = vec3(0., 0., 1.);
  float rim = pow(1. - clamp(dot(normalize(vN), v), 0., 1.), 2.);
  c += vec3(1., .5, .1) * rim;
  gl_FragColor = vec4(c * uOpacity, uOpacity);
}
`;

/* The landing: night sky, live aurora, layered mountains and a lit pad. */
export const LANDING_FS = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes; uniform float uTime; uniform float uAlpha; uniform float uPad; uniform vec2 uPadPos;
${NOISE}
float ridge(float x, float seed, float amp, float base) { return base + amp * (fbm(vec2(x * 3. + seed, seed)) - .5) + amp * .6 * (fbm(vec2(x * 11. + seed * 2., 1.)) - .5) * .4; }
void main() {
  vec2 uv = vUv; float asp = uRes.x / uRes.y;
  vec3 sky = mix(vec3(.01, .02, .06), vec3(.02, .07, .12), smoothstep(.2, .9, 1. - uv.y));
  sky = mix(sky, vec3(.04, .12, .16), smoothstep(.55, .25, uv.y) * .6);
  // stars
  vec2 g = uv * uRes / 2.5; float s = hash12(floor(g));
  sky += vec3(step(.997, s)) * (.5 + .5 * sin(uTime * 3. + s * 40.)) * smoothstep(.3, .7, uv.y);
  // aurora curtains
  vec3 au = vec3(0.);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * asp * (1.2 + fi * .3) + fi * 3.7;
    float wave = fbm(vec2(x * .8 + uTime * .05 * (1. + fi * .4), fi)) * .35;
    float base = .58 + fi * .07 + wave;
    float dy = uv.y - base;
    float curtain = smoothstep(.0, .02, dy) * exp(-dy * (5. + fi * 2.));
    float rays = .55 + .45 * fbm(vec2(x * 9. + uTime * .3, uv.y * 2. - uTime * .2));
    vec3 tint = mix(vec3(.15, 1., .55), vec3(.55, .3, 1.), clamp(dy * 3.2 + fi * .25, 0., 1.));
    au += tint * curtain * rays * (.9 - fi * .22);
  }
  sky += au * 1.1;
  // mountains (back to front)
  vec3 col = sky;
  float x = uv.x * asp;
  float m1 = ridge(x * .7, 3.1, .22, .33); float m2 = ridge(x * 1.1, 7.7, .18, .24); float m3 = ridge(x * 1.6, 1.9, .1, .14);
  col = mix(col, vec3(.03, .06, .09) + au * .05, smoothstep(m1 + .002, m1 - .002, uv.y));
  col = mix(col, vec3(.02, .035, .055), smoothstep(m2 + .002, m2 - .002, uv.y));
  col = mix(col, vec3(.008, .012, .02), smoothstep(m3 + .002, m3 - .002, uv.y));
  // landing pad glow (pad sits at x = .7 of width on wide screens)
  vec2 pad = uPadPos;
  vec2 dp = (uv - pad) * vec2(asp, 4.);
  col += vec3(1., .72, .38) * exp(-dot(dp, dp) * 30.) * (.18 + uPad * .55);
  col += vec3(.35, .85, 1.) * exp(-dot(dp, dp) * 260.) * .35;
  // the pad itself: a thin lit disc
  float disc = smoothstep(.006, 0., abs(length((uv - pad) * vec2(asp, 7.)) - .05)) * step(uv.y, pad.y + .01);
  col += vec3(.55, .9, 1.) * disc * .5;
  gl_FragColor = vec4(col, uAlpha);
}
`;

/* Rocket exhaust */
export const FLAME_VS = /* glsl */`
varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
export const FLAME_FS = /* glsl */`
precision highp float;
varying vec2 vUv; uniform float uTime; uniform float uPower;
${NOISE}
void main() {
  float y = vUv.y;                                          // 0 at nozzle (top of cone geometry flipped)
  float n = vnoise(vec2(vUv.x * 8., y * 6. - uTime * 14.));
  float core = smoothstep(1., .0, y + n * .25);
  vec3 c = mix(vec3(1., .35, .08), vec3(1., .95, .75), core);
  c = mix(c, vec3(.45, .7, 1.), smoothstep(.05, 0., y) * .6);
  float a = core * uPower;
  gl_FragColor = vec4(c * a, a);
}
`;

/* Saturn's rings */
export const RING_VS = /* glsl */`
varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
export const RING_FS = /* glsl */`
precision highp float;
varying vec3 vPos; uniform vec3 uA; uniform float uOpacity;
void main() {
  float t = (length(vPos.xy) - 1.32) / (2.1 - 1.32);
  float bands = .55 + .45 * sin(t * 61.) * sin(t * 17. + 1.);
  float a = smoothstep(0., .05, t) * smoothstep(1., .82, t) * (.3 + .55 * bands);
  a *= 1. - .85 * step(.6, t) * step(t, .655);
  gl_FragColor = vec4(uA * (.55 + .45 * bands), a * uOpacity);
}
`;

/* Soft radial glow, drawn additively */
export const GLOW_VS = /* glsl */`
varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
export const GLOW_FS = /* glsl */`
precision highp float;
varying vec2 vUv; uniform vec3 uColor; uniform float uAlpha; uniform float uPow;
void main() { float d = length(vUv - .5) * 2.; float g = pow(clamp(1. - d, 0., 1.), uPow); gl_FragColor = vec4(uColor * g * uAlpha, 1.); }
`;

/* Landing smoke */
export const SMOKE_VS = /* glsl */`
attribute float aAge; attribute float aSize; varying float vAge; uniform float uDpr;
void main() { vAge = aAge; gl_PointSize = aSize * uDpr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
export const SMOKE_FS = /* glsl */`
precision highp float;
varying float vAge;
void main() {
  if (vAge <= 0. || vAge >= 1.) discard;
  float d = length(gl_PointCoord - .5) * 2.;
  float a = smoothstep(1., .2, d) * (1. - vAge) * smoothstep(0., .08, vAge) * .55;
  vec3 c = mix(vec3(1., .78, .5), vec3(.55, .6, .7), smoothstep(0., .35, vAge));
  gl_FragColor = vec4(c, a);
}
`;
