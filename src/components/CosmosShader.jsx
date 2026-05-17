import { useEffect, useRef } from 'react'

const VERT_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const FRAG_SRC = `
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec3  u_dominant;
uniform float u_dominance;

// Ashima 2D simplex noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x  = 2.0 * fract(p * C.www) - 1.0;
  vec3 h  = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 8; i++) {
    v += a * snoise(p);
    p = p * 2.0 + vec2(100.0);
    a *= 0.5;
  }
  return v;
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p  = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;
  float t = u_time * 0.12;

  // Deeper space base — closer to true black so lit nebula pops against it
  vec3 col = vec3(0.010, 0.006, 0.018);

  // Density fields — drive HOW MUCH nebula appears
  float d1 = fbm(p * 1.2 + vec2(t * 0.3, t * 0.2));
  float d2 = fbm(p * 3.0 - vec2(t * 0.15, t * 0.4) + d1 * 0.5);
  float d3 = fbm(p * 7.0 + vec2(t * 0.6, -t * 0.3));

  // Independent color-mixing fields — drive WHICH colors swirl where
  float cm1 = fbm(p * 1.8 + vec2(t * 0.25, -t * 0.15));
  float cm2 = fbm(p * 3.5 - vec2(t * 0.10, t * 0.30) + cm1 * 0.4);

  vec2 core1 = vec2(sin(t*0.4)*0.45 - 0.35, cos(t*0.3)*0.30 - 0.25);
  vec2 core2 = vec2(cos(t*0.5)*0.45 + 0.45, sin(t*0.6)*0.30 + 0.35);

  float c1Glow = pow(smoothstep(1.0, 0.0, length(p - core1)), 2.5);
  float c2Glow = pow(smoothstep(0.9, 0.0, length(p - core2)), 2.5);

  float pulse1 = 0.85 + 0.15 * sin(u_time * 0.8);
  float pulse2 = 0.85 + 0.15 * sin(u_time * 0.6 + 1.5);

  // Carina Nebula palette
  vec3 rosePink     = vec3(0.95, 0.50, 0.60);  // dominant dusty rose
  vec3 softLavender = vec3(0.55, 0.65, 0.95);  // soft blue secondary
  vec3 brightCyan   = vec3(0.70, 0.90, 1.00);  // central cluster glow
  vec3 warmOrange   = vec3(1.00, 0.55, 0.25);  // warm dust highlights
  vec3 deepMagenta  = vec3(0.85, 0.30, 0.55);  // saturation pops
  vec3 darkDust     = vec3(0.45, 0.20, 0.25);  // reddish-brown filaments

  // Swirl through palette — pink/blue split driven by cm1, warm accents by cm2
  vec3 baseField = mix(rosePink, softLavender, smoothstep(-0.5, 0.5, cm1));
  baseField = mix(baseField, warmOrange * 0.85, smoothstep(0.3, 0.9, cm2) * 0.35);
  baseField = mix(baseField, deepMagenta,       smoothstep(0.5, 1.0, cm1 + cm2 * 0.4) * 0.30);

  float n1 = max(d1, 0.0);
  float n2 = max(d2, 0.0);
  float n3 = max(d3, 0.0);

  // Density with contrast curve — pow() pushes low values toward
  // black, high values stay bright. Multiplier bumped to compensate.
  float density = n1 * n1 * 0.7 + n2 * 0.35 + n3 * n3 * 0.25;
  density = pow(density, 1.25);

  vec3 nebula = baseField * density * 1.5;

  // Bright cluster cores — cyan halo + rose halo
  nebula += brightCyan * c1Glow * 1.15 * pulse1;
  nebula += rosePink   * c2Glow * 1.10 * pulse2;

  // Warm orange sparkle only in densest swirl regions
  nebula += warmOrange * n3 * n3 * 0.25 * smoothstep(0.4, 0.8, n1);

  // Dust lanes modulate everything — wider range (was 0.50→1.0,
  // now 0.20→1.20) so shadow channels go deeper black and lit regions
  // glow more brightly. Main driver of nebula-vs-void contrast.
  float lanes = smoothstep(-0.3, 0.4, fbm(p * 1.8 + vec2(t * 0.1)));
  nebula *= mix(0.20, 1.20, lanes);

  // Dark reddish-brown filament hints in shadowed regions (strengthened)
  nebula += darkDust * (1.0 - lanes) * d2 * 0.28;

  col += nebula;

  // Saturation boost — pull colors away from gray toward their hue
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.25);

  float domStrength = 0.06 + u_dominance * 0.10;
  col += u_dominant * smoothstep(1.4, 0.0, length(p)) * domStrength;

  float grain = (hash21(uv * u_resolution.xy + u_time) - 0.5) * 0.020;
  col += grain;

  gl_FragColor = vec4(col, 1.0);
}
`

function compileShader(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('CosmosShader compile error:', gl.getShaderInfoLog(s))
    gl.deleteShader(s)
    return null
  }
  return s
}

export function CosmosShader({ tint, dominance }) {
  const canvasRef = useRef(null)
  const propsRef = useRef({ tint, dominance })

  // Sync prop changes into the render loop without recreating GL context
  useEffect(() => {
    propsRef.current = { tint, dominance }
  }, [tint, dominance])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false })
    if (!gl) {
      console.warn('CosmosShader: WebGL unavailable; rendering nothing (the .ambient base gradient shows through)')
      return
    }

    const reducedMql = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = reducedMql.matches
    const onReducedChange = (e) => { reducedMotion = e.matches }
    reducedMql.addEventListener('change', onReducedChange)

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
    if (!vs || !fs) return

    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('CosmosShader link error:', gl.getProgramInfoLog(program))
      return
    }
    gl.useProgram(program)

    const posLoc = gl.getAttribLocation(program, 'a_pos')
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const u_time = gl.getUniformLocation(program, 'u_time')
    const u_res = gl.getUniformLocation(program, 'u_resolution')
    const u_dom = gl.getUniformLocation(program, 'u_dominant')
    const u_domStr = gl.getUniformLocation(program, 'u_dominance')

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    let shaderTime = 0
    let lastFrame = performance.now()
    let rafId = 0

    function loop(now) {
      const dt = Math.min((now - lastFrame) / 1000, 0.1)
      lastFrame = now
      if (reducedMotion) {
        shaderTime = 80.0
      } else {
        shaderTime += dt
      }

      const { tint, dominance } = propsRef.current
      gl.uniform1f(u_time, shaderTime)
      gl.uniform2f(u_res, canvas.width, canvas.height)
      gl.uniform3f(u_dom, tint.r / 255, tint.g / 255, tint.b / 255)
      gl.uniform1f(u_domStr, dominance)

      gl.drawArrays(gl.TRIANGLES, 0, 3)
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      reducedMql.removeEventListener('change', onReducedChange)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  }, [])

  return <canvas ref={canvasRef} className="cosmos-shader-canvas" aria-hidden="true" />
}
