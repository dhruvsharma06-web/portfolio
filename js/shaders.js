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
// stars live in 3D cells around the viewer, so they stay round in every direction
vec3 starLayer(vec3 d, float sc, float thr, float seed) {
  vec3 p = d * sc; vec3 id = floor(p); vec3 f = fract(p);
  float h = hash13(id + seed);
  if (h < thr) return vec3(0.);
  vec3 c = vec3(hash13(id + seed + 1.7), hash13(id + seed + 9.1), hash13(id + seed + 5.3)) * .5 + .25;
  float dd = length(f - c);
  float mag = (h - thr) / (1. - thr);
  float core = smoothstep(.09 + mag * .06, 0., dd);
  float halo = exp(-dd * dd * 90.) * .3 * mag;
  vec3 tint = mix(vec3(.72, .82, 1.), vec3(1., .86, .68), hash13(id + 4.4));
  return tint * (core + halo) * (.5 + mag);
}
vec3 starsDir(vec3 d) {
  vec3 c = starLayer(d, 70., .86, 0.) * 2.;
  vec2 sp = vec2(atan(d.z, d.x) / 6.2831, asin(clamp(d.y, -1., 1.)) / 3.1416);
  float band = exp(-pow(d.y * 2.4 - .35 * d.x, 2.) * 5.);
  c += vec3(.16, .13, .22) * band * pow(fbm(sp * 14.), 2.) * .9;
  return c;
}
`;

/* Deep-sky backdrop: the same stars as around the black hole, turning slowly with scroll */
export const STARFIELD_FS = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes; uniform float uTime; uniform float uAlpha; uniform float uTurn;
${NOISE}
${STARS}
void main() {
  vec2 uv = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
  float a = uTurn, b = .35 + uTurn * .3;
  vec3 d = normalize(vec3(uv, 1.6));
  d.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * d.xz;
  d.yz = mat2(cos(b), -sin(b), sin(b), cos(b)) * d.yz;
  vec3 c = starsDir(d);
  // gentle twinkle
  c *= .85 + .15 * sin(uTime * 2. + hash12(floor(vUv * uRes / 3.)) * 40.);
  gl_FragColor = vec4(c * uAlpha, 1.);
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
  float tilt = .13 + uLook.y * .03 + sin(uTime * .07) * .02;
  float yaw = uLook.x * .08 + sin(uTime * .05) * .12;
  vec3 ro = vec3(sin(yaw) * uDist, uDist * sin(tilt), -uDist * cos(tilt) * cos(yaw));
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
        float beam = pow(1. + .62 * dop, 3.);
        hot = mix(hot, vec3(.82, .9, 1.), clamp(dop, 0., 1.) * .35 * temp);   // approaching side runs blue-white
        vec3 dc = hot * dens * (.75 + 2.8 * pow(temp, 3.)) * beam;
        dc += vec3(1., .88, .7) * smoothstep(3.3, 2.7, rr) * .7 * beam;      // white-hot inner rim
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
  col += (1. - alpha) * vec3(1., .78, .52) * exp(-abs(minR - 1.52) * 34.) * .8;
  col = 1. - exp(-col * .85);
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
  vec2 g = vUv * uRes / 16.; float s = hash12(floor(g));
  float sd = length(fract(g) - .5) * 16.;
  col += vec3(step(.95, s) * smoothstep(1.8, 0., sd)) * (1. - uWarp) * (.5 + .5 * hash12(floor(g) + 1.));
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
  } else if (uKind < 2.5) {         // earth: warped continents, biomes, clouds with shadows, night lights
    vec3 n0 = normalize(vN), L = normalize(uSun), v0 = vec3(0., 0., 1.);
    vec3 q = p * 1.5 + vec3(fbm3(p * 2.1 + 1.7), fbm3(p * 2.1 + 9.2), fbm3(p * 2.1 + 4.4)) * 1.1;
    float land = fbm3(q * 1.6 + 4.1) * .8 + fbm3(p * 9. + 2.) * .2;
    float coast = .53;
    float isLand = smoothstep(coast, coast + .012, land);
    float lat = abs(p.y);
    float hgt = clamp((land - coast) / .25, 0., 1.);
    float dry = smoothstep(.12, .3, lat) * smoothstep(.45, .3, lat) * smoothstep(.35, .6, fbm3(p * 4. + 7.));
    vec3 forest = mix(vec3(.05, .16, .05), vec3(.12, .24, .08), fbm3(p * 14.));
    vec3 desert = mix(vec3(.55, .44, .27), vec3(.68, .55, .36), fbm3(p * 18.));
    vec3 tundra = vec3(.36, .33, .26);
    vec3 ground = mix(forest, desert, dry);
    ground = mix(ground, tundra, smoothstep(.55, .72, lat));
    ground = mix(ground, vec3(.42, .38, .34), smoothstep(.55, .9, hgt) * .6);            // mountains
    float shallow = smoothstep(coast - .07, coast, land);
    vec3 ocean = mix(vec3(.01, .05, .16), vec3(.02, .16, .3), shallow);
    ocean = mix(ocean, vec3(.05, .3, .38), shallow * shallow * .6);
    float ice = smoothstep(.8, .88, lat + fbm3(p * 6.) * .08);
    c = mix(ocean, ground, isLand); c = mix(c, vec3(.9, .93, .96), ice);
    // clouds drift on their own, with a faint shadow underneath
    float ct = uTime * .012; mat2 rc = mat2(cos(ct), -sin(ct), sin(ct), cos(ct));
    vec3 pc = vec3(rc * p.xz, p.y).xzy;
    vec3 wc = pc * 2.6 + vec3(fbm3(pc * 3. + 5.), fbm3(pc * 3. + 1.), 0.) * .9;
    float cloud = smoothstep(.5, .78, fbm3(wc) * .8 + fbm3(pc * 11.) * .25);
    cloud *= 1. - smoothstep(.85, .97, lat) * .5;
    float shade = smoothstep(.5, .78, fbm3(wc + L * .03) * .8 + fbm3(pc * 11.) * .25);
    float day = clamp(dot(n0, L), 0., 1.);
    float term = smoothstep(-.12, .25, dot(n0, L));
    vec3 lit = c * (1. - shade * .35) * (.02 + day * 1.15);
    // ocean glint
    vec3 hv = normalize(L + v0);
    lit += vec3(1., .92, .8) * pow(max(dot(n0, hv), 0.), 60.) * (1. - isLand) * (1. - ice) * (1. - cloud) * .9 * term;
    // twilight band
    lit += vec3(1., .45, .15) * exp(-pow(dot(n0, L) * 6., 2.)) * .12;
    vec3 col = mix(lit, vec3(1.) * (.03 + day * 1.1), cloud * .92);
    // night side city lights
    float night = 1. - smoothstep(-.18, .05, dot(n0, L));
    float cities = isLand * (1. - ice) * (1. - cloud) * smoothstep(.62, .8, vnoise3(p * 40.)) * smoothstep(.45, .65, fbm3(p * 6. + 3.));
    col += vec3(1., .7, .35) * cities * night * uNight * 1.4;
    // thin blue limb hugging the day side
    float mu = clamp(dot(n0, v0), 0., 1.);
    col += vec3(.35, .6, 1.) * pow(1. - mu, 3.5) * (.25 + term * .9) + vec3(.5, .7, 1.) * uHover * pow(1. - mu, 3.) * .5;
    gl_FragColor = vec4(col, uOpacity);
    return;
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
  float mu = clamp(dot(normalize(vN), v), 0., 1.);
  float rim = pow(1. - mu, 5.) * smoothstep(0., .25, mu);
  float lit = clamp(dot(normalize(vN), normalize(uSun)) * .7 + .35, 0., 1.);
  gl_FragColor = vec4(uColor * rim * lit * 2.2 * uOpacity, 1.);
}
`;

/* Sun surface: boiling granulation, darker limb, slow sunspots */
export const SUN_FS = /* glsl */`
precision highp float;
varying vec3 vN; varying vec3 vP; varying vec3 vW;
uniform float uTime; uniform float uOpacity;
${NOISE}
void main() {
  vec3 p = normalize(vP);
  float t = uTime * .06;
  float gran = fbm3(p * 22. + vec3(t * 2., -t, t)) ;                         // small convection cells
  float cells = 1. - abs(fbm3(p * 9. - vec3(0., t, 0.)) * 2. - 1.);           // brighter cell walls
  float flow = fbm3(p * 3. + vec3(t * .5, 0., -t * .3));
  float spots = smoothstep(.72, .8, fbm3(p * 4. + 11.)) * .55;
  float heat = gran * .55 + cells * .35 + flow * .3 - spots;
  vec3 c = mix(vec3(.95, .32, .04), vec3(1., .72, .28), smoothstep(.25, .75, heat));
  c = mix(c, vec3(1., .95, .78), smoothstep(.7, .95, heat));
  float mu = clamp(dot(normalize(vN), vec3(0., 0., 1.)), 0., 1.);
  c *= .45 + .55 * pow(mu, .45);                                              // limb darkening
  c += vec3(1., .45, .1) * pow(1. - mu, 3.) * .9;                             // hot rim
  gl_FragColor = vec4(c * 1.15 * uOpacity, uOpacity);
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
  vec2 g = uv * uRes / 18.; vec2 gid = floor(g); float s = hash12(gid);
  if (s > .93) {
    vec2 sc = vec2(hash12(gid + 3.1), hash12(gid + 7.7)) * .6 + .2;
    float d = length(fract(g) - sc) * 18.;                     // distance in px
    float mag = (s - .93) / .07;
    float star = smoothstep(1.2 + mag * 1.2, 0., d) + exp(-d * d * .08) * .25 * mag;
    sky += mix(vec3(.75, .85, 1.), vec3(1., .9, .75), hash12(gid + 1.3)) * star * (.5 + .5 * mag) * (.75 + .25 * sin(uTime * 2. + s * 60.)) * smoothstep(.3, .7, uv.y);
  }
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
  // shooting stars: a few bright streaks crossing the upper sky
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cyc = uTime * (.16 + fi * .03) + fi * .37;
    float id = floor(cyc), t = fract(cyc);
    vec2 st = vec2(hash12(vec2(id, fi)) * 1.2 - .1, .62 + hash12(vec2(fi, id)) * .33);
    vec2 dir = normalize(vec2(1., -.38 - hash12(vec2(id * 1.7, fi)) * .3));
    float life = smoothstep(0., .05, t) * smoothstep(.32, .2, t);
    vec2 head = st + dir * t * .9;
    vec2 q = vec2((uv.x - head.x) * asp, uv.y - head.y);
    vec2 dd = vec2(dir.x * asp, dir.y); float dl = length(dd); dd /= dl;
    float along = dot(q, dd), across = abs(q.x * dd.y - q.y * dd.x);
    float tail = smoothstep(-.16, 0., along) * step(along, 0.) * smoothstep(.0028, 0., across);
    float tip = exp(-dot(q, q) * 9000.);
    sky += vec3(.85, .92, 1.) * (tail * (1. + along * 6.) + tip * 1.5) * life;
  }
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
varying vec2 vUv; uniform float uTime; uniform float uPower; uniform float uCore;
${NOISE}
void main() {
  float y = vUv.y;                                          // 0 at the nozzle, 1 at the tip
  float n = vnoise(vec2(vUv.x * 8., y * 6. - uTime * 16.));
  if (uCore > .5) {
    // hot blue-white core with shock diamonds
    float diam = .55 + .45 * pow(abs(sin(y * 26. - uTime * 2.)), 3.);
    float core = smoothstep(.75, .0, y + n * .1) * diam;
    vec3 c = mix(vec3(.55, .78, 1.), vec3(1.), smoothstep(.4, .0, y));
    float a = core * uPower;
    gl_FragColor = vec4(c * a * 1.3, a);
    return;
  }
  float body = smoothstep(1., .0, y + n * .3) * (.75 + .25 * n);
  vec3 c = mix(vec3(1., .3, .06), vec3(1., .78, .4), smoothstep(.7, .1, y));
  float a = body * uPower;
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
  float a = smoothstep(1., .2, d) * (1. - vAge) * smoothstep(0., .08, vAge) * .28;
  vec3 c = mix(vec3(1., .7, .42), vec3(.32, .36, .44), smoothstep(0., .3, vAge));
  gl_FragColor = vec4(c, a);
}
`;

/* Corona: streamers of plasma flowing outward, brightest at the limb */
export const RAYS_FS = /* glsl */`
precision highp float;
varying vec2 vUv; uniform float uTime; uniform float uAlpha;
${NOISE}
void main() {
  vec2 p = vUv - .5; float r = length(p) * 2.; float a = atan(p.y, p.x);
  vec2 ca = vec2(cos(a), sin(a));
  float rs = .2667;                                                // the Sun's edge in this quad (radius / quad half-size)
  float h = max(r - rs, 0.);
  // streamers: angular noise that drifts outward over time
  float s1 = fbm(ca * 2.4 + vec2(h * 2. - uTime * .07, uTime * .01));
  float s2 = fbm(ca * 7. + vec2(h * 5. - uTime * .12, 4.));
  float streak = pow(s1, 2.) * 1.6 + pow(s2, 3.) * 1.4;
  float fall = exp(-h * 5.5) * smoothstep(rs * .92, rs * 1.02, r);
  float halo = exp(-h * 14.) * .9 * smoothstep(rs * .9, rs * 1.01, r);
  float far = exp(-h * 2.2) * .12;
  vec3 c = mix(vec3(1., .5, .16), vec3(1., .86, .6), exp(-h * 9.));
  float edge = smoothstep(1., .7, r);                              // fade out well before the quad's border
  gl_FragColor = vec4(c * (streak * fall + halo + far) * edge * uAlpha, 1.);
}
`;

/* Solar wind: sparks streaming off the Sun */
export const SPARK_VS = /* glsl */`
attribute float aAge; attribute float aSize; varying float vAge; uniform float uDpr; uniform float uScale;
void main() { vAge = aAge; gl_PointSize = aSize * uDpr * (1. - aAge * .6) * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
export const SPARK_FS = /* glsl */`
precision highp float;
varying float vAge; uniform float uAlpha;
void main() {
  if (vAge <= 0. || vAge >= 1.) discard;
  float d = length(gl_PointCoord - .5) * 2.;
  float a = pow(smoothstep(1., 0., d), 2.) * smoothstep(0., .15, vAge) * pow(1. - vAge, 1.6) * .8;
  vec3 c = mix(vec3(1., .9, .66), vec3(1., .36, .08), smoothstep(0., .7, vAge));
  gl_FragColor = vec4(c * a * uAlpha, 1.);
}
`;
