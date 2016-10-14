const perspective = require('gl-mat4/perspective')
const lookAt = require('gl-mat4/lookAt')
const inverse = require('gl-mat4/invert')
const delaunay = require('delaunay-triangulate')
const voronoi = require('voronoi-diagram')

const canvas = document.querySelector('#regl-canvas')

const regl = require('regl')({
  canvas
})

const COLORS = [
  [48 / 255, 0, 48 / 255],
  [72 / 255, 0, 72 / 255],
  [96 / 255, 24 / 255, 72 / 255],
  [192 / 255, 72 / 255, 72 / 255],
  [240 / 255, 114 / 255, 65 / 255]
]

const colorUniforms = {
  'colors[0]': COLORS[0],
  'colors[1]': COLORS[1],
  'colors[2]': COLORS[2],
  'colors[3]': COLORS[3],
  'colors[4]': COLORS[4]
}

const drawBackground = regl({
  frag: `
  precision highp float;
  varying vec2 screenPos;
  uniform vec3 colors[5];
  uniform mat4 projection, view, invProjection, invView;
  uniform float time;

  vec3 envMap (vec3 dir) {
    float t = 1.0 / (1.0 - length(dir.xy));
    vec3 hit = t * dir;

    float theta = atan(hit.y, hit.x) + 0.5 * time;
    float radius = hit.z - 0.25 * time;

    float hx = step(fract(theta * 40.0 / ${2.0 * Math.PI}), 0.1);
    float hy = step(fract(radius * 10.0), 0.1);
    return mix(
      mix(
        colors[0],
        colors[2],
        max(hx, hy)),
      colors[1],
      1.0 / (1.0 + exp(-5.0 * (1.0 - abs(hit.z)) ) ));
  }

  void eyeVec (out vec3 origin, out vec3 dir) {
    mat4 inv = invView * invProjection;

    vec4 s0 = inv * vec4(screenPos, 0, 1);
    vec4 s1 = inv * vec4(screenPos, 1, 1);

    vec3 x0 = s0.xyz / s0.w;
    vec3 x1 = s1.xyz / s1.w;

    origin = x0;
    dir = normalize(x1 - x0);
  }

  void main () {
    vec3 origin, dir;
    eyeVec(origin, dir);
    gl_FragColor = vec4(envMap(dir), 1);
  }
  `,

  vert: `
  precision highp float;
  attribute vec2 position;
  varying vec2 screenPos;
  void main () {
    screenPos = position;
    gl_Position = vec4(position, 0.98, 1);
  }
  `,

  attributes: {
    position: [
      [-4, 0],
      [4, 4],
      [4, -4]
    ]
  },

  uniforms: Object.assign({
    time: ({time}) => 0.25 * time,
    invProjection: regl.prop('invProjection'),
    invView: regl.prop('invView')
  }, colorUniforms),

  depth: {
    enable: false
  },

  count: 3
})

const drawPoints = initPoints(regl)

const mousePosition = [0, 0]

function handleEvent (ev) {
  mousePosition[0] = 2.0 * ev.clientX / window.innerWidth - 1.0
  mousePosition[1] = 1.0 - 2.0 * ev.clientY / window.innerHeight
}

window.addEventListener('mousemove', handleEvent, false)
window.addEventListener('touchmove', handleEvent, false)
window.addEventListener('touchstart', handleEvent, false)

const projection = new Float32Array(16)
const view = new Float32Array(16)
const invProjection = new Float32Array(16)
const invView = new Float32Array(16)

regl.frame(({viewportWidth, viewportHeight, time, tick}) => {
  perspective(projection,
    0.25 * Math.PI,
    viewportWidth / viewportHeight,
    0.01,
    1000.0)
  lookAt(view,
    [0, 0, -7],
    [mousePosition[0], mousePosition[1], 0],
    [0, 1, 0])
  inverse(invView, view)
  inverse(invProjection, projection)
  drawBackground({
    invProjection,
    invView
  })
  drawPoints(projection, view, time, tick)
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
})

function initPoints (regl) {
  const N = 512
  const S = 5
  const grid = new Array(N * N)

  function generatePoints (time) {
    let ptr = 0
    for (let i = 0; i < N; ++i) {
      for (let j = 0; j < N; ++j) {
        const x = 0.4 * (i - N / 2)
        const y = 0.4 * (j - N / 2)
        let p = 0
        for (let s = 0; s < S; ++s) {
          const theta = 2.0 * Math.PI * s / S
          p += Math.sin(
            x * Math.cos(theta) +
            y * Math.sin(theta))
        }
        grid[ptr++] = p
      }
    }

    const points = []
    for (let i = 1; i < N - 1; ++i) {
      for (let j = 1; j < N - 1; ++j) {
        const v = grid[i * N + j]
        var m = v
        for (let dx = -1; dx <= 1; ++dx) {
          for (let dy = -1; dy <= 1; ++dy) {
            m = Math.max(m, grid[(i + dx) * N + j + dy])
          }
        }
        if (v >= m || (i === N / 2 && j === N / 2)) {
          points.push([i / N - 0.5, j / N - 0.5])
        }
      }
    }

    return points
  }

  const pointBuffer = regl.buffer({
    length: 2,
    size: 2,
    type: 'float'
  })

  const cellBuffer = regl.elements({
    length: 2,
    primitive: 'lines',
    type: 'uint16'
  })

  const drawPoints = regl({
    frag: `
    precision mediump float;
    uniform vec3 colors[5];
    void main () {
      gl_FragColor = vec4(colors[2], 1);
    }`,

    vert: `
    precision mediump float;
    attribute vec2 position;
    uniform float time;
    uniform mat4 projection, view;
    uniform float pixelRatio, aspect;

    void main () {
      gl_PointSize = 2.2 * pixelRatio;

      vec2 axis = vec2(cos(0.12 * time), sin(0.12 * time));

      vec2 pr = vec2(
        axis.x * position.x + axis.y * position.y,
        -axis.y * position.x + axis.x * position.y);

      gl_Position = projection * view * vec4(
        14.0 * pr * aspect,
         sin(time + 10.0 * length(position)),
        1);
    }
    `,

    attributes: {
      position: pointBuffer
    },

    uniforms: Object.assign({
      aspect: ({viewportWidth, viewportHeight}) => viewportWidth / viewportHeight,
      pixelRatio: regl.context('pixelRatio'),
      projection: regl.prop('projection'),
      view: regl.prop('view'),
      time: regl.context('time')
    }, colorUniforms),

    count: regl.prop('count'),

    primitive: 'points'
  })

  const drawEdges = regl({
    elements: cellBuffer,

    frag: `
    precision mediump float;
    uniform vec3 colors[5];
    void main () {
      gl_FragColor = vec4(colors[3], 1);
    }
    `,

    lineWidth: Math.min(regl.limits.lineWidthDims[1], 2)
  })

  const voroPositions = regl.buffer({
    length: 2,
    size: 2,
    type: 'float'
  })

  const voroColors = regl.buffer({
    length: 3,
    size: 3,
    type: 'float'
  })

  const voroCenters = regl.buffer({
    length: 2,
    size: 2,
    type: 'float'
  })

  const drawVoronoi = regl({
    frag: `
    precision mediump float;
    varying vec3 vcolor;
    void main () {
      gl_FragColor = vec4(vcolor, 1);
    }
    `,

    vert: `
    precision mediump float;
    attribute vec2 position, center;
    attribute vec3 color;
    uniform mat4 projection, view;
    uniform float time, aspect;
    varying vec3 vcolor;

    void main () {
      vcolor = color;

      vec2 p = 0.5 * max(0.5, 1.0 + cos(time + 4.0 * -length(center))) * position + center;
      vec2 axis = vec2(cos(0.12 * time), sin(0.12 * time));
      vec2 pr = vec2(
        axis.x * p.x + axis.y * p.y,
        -axis.y * p.x + axis.x * p.y);

      gl_Position = projection * view * vec4(
        14.0 * pr * aspect,
        1.25,
        1);
    }
    `,

    attributes: {
      position: voroPositions,
      color: voroColors,
      center: voroCenters
    },

    uniforms: {
      projection: regl.prop('projection'),
      view: regl.prop('view'),
      aspect: ({viewportWidth, viewportHeight}) =>
        viewportWidth / viewportHeight,
      time: regl.context('time')
    },

    count: regl.prop('count'),

    primitive: 'triangles'
  })

  let pointCount = 0
  let voroCount = 0

  function updateVoronoi ({cells, positions}) {
    const p = []
    const c = []
    const x = []

    function sub (a, b) {
      return [
        a[0] - b[0],
        a[1] - b[1]
      ]
    }

loop_i:
    for (let i = 0; i < cells.length; ++i) {
      const cell = cells[i]
      const center = [0, 0]
      for (let j = 0; j < cell.length; ++j) {
        if (cell[j] < 0) {
          continue loop_i
        }
        const y = positions[cell[j]]
        if (isNaN(y[0]) || isNaN(y[1])) {
          continue loop_i
        }
        center[0] += y[0]
        center[1] += y[1]
      }
      center[0] /= cell.length
      center[1] /= cell.length

      const color = COLORS[cell.length % COLORS.length]

      for (let j = 2; j < cell.length; ++j) {
        p.push(
          sub(positions[cell[0]], center),
          sub(positions[cell[j - 1]], center),
          sub(positions[cell[j]], center))
        c.push(
          color,
          color,
          color)
        x.push(
          center,
          center,
          center)
      }
    }

    voroPositions(p)
    voroColors(c)
    voroCenters(x)

    voroCount = p.length
  }

  function regenerate () {
    const points = generatePoints(0)
    pointBuffer(points)
    const cells = delaunay(points)
    const edges = []
    cells.forEach(([i, j, k]) => {
      edges.push(
        [i, j],
        [j, k],
        [k, i]
      )
    })
    cellBuffer(edges)
    pointCount = points.length
    updateVoronoi(voronoi(points))
  }

  regenerate()

  return function (projection, view, time, tick) {
    drawVoronoi({
      view,
      projection,
      count: voroCount
    })

    drawPoints({
      projection,
      view,
      count: pointCount
    }, () => {
      // regl.draw()
      drawEdges()
    })
  }
}
