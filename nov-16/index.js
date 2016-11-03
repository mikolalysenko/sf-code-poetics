const glslify = require('glslify')
const perspective = require('gl-mat4/perspective')
const lookAt = require('gl-mat4/lookAt')
const icosphere = require('icosphere')(5)

const canvas = document.querySelector('#regl-canvas')
const regl = require('regl')({
  canvas
})

const PALETTE = [
  [110 / 255, 100 / 255, 88 / 255, 1],
  [207 / 255, 167 / 255, 98 / 255, 1],
  [237 / 255, 197 / 255, 125 / 255, 1],
  [144 / 255, 25 / 255, 19 / 255, 1],
  [253 / 255, 90 / 255, 35 / 255, 1]
]

function degamma (x) {
  return x.map((y) => Math.pow(y, 2.2))
}

function cameraPos (t) {
  t *= 0.25
  const v = [
    Math.cos(3 * t + 10),
    Math.sin(2.0 * Math.PI * Math.cos(0.25 * t)) - Math.cos(t + 3.1),
    Math.cos(5 * t + 0.1)
  ]
  normalize(v)
  const h = 1.8 - 0.4 * Math.cos(0.05 * t)
  v[0] *= h
  v[1] *= h
  v[2] *= h
  return v
}

function normalize (v) {
  const l = Math.sqrt(
    Math.pow(v[0], 2) +
    Math.pow(v[1], 2) +
    Math.pow(v[2], 2))
  v[0] /= l
  v[1] /= l
  v[2] /= l
  return v
}

const drawSphere = regl({
  frag: `
  precision mediump float;
  varying vec3 normal, eyeVec;

  #define C0 vec4(${degamma(PALETTE[2])})

  void main () {
    vec3 N = normalize(normal);
    vec3 V = normalize(eyeVec);

    float fresnel = pow(1.0 -
      max(dot(N, V), 0.0), 5.0);

    vec3 diffuse = 1.2 * C0.rgb * max(dot(N, V), 0.);

    gl_FragColor = vec4(
      mix(diffuse, vec3(1, 1, 1), 0.5 * fresnel), 1);
  }
  `,

  vert: glslify`
  precision highp float;
  attribute vec3 position;
  uniform mat4 projection, view;
  uniform vec3 eye;
  uniform float time;

  varying vec3 normal, eyeVec;

  #pragma glslify: snoise4 = require("glsl-noise/simplex/4d")

  mat3 adjoint (mat3 m) {
    float a00 = m[0][0], a01 = m[0][1], a02 = m[0][2];
    float a10 = m[1][0], a11 = m[1][1], a12 = m[1][2];
    float a20 = m[2][0], a21 = m[2][1], a22 = m[2][2];

    float b01 = a22 * a11 - a12 * a21;
    float b11 = -a22 * a10 + a12 * a20;
    float b21 = a21 * a10 - a11 * a20;

    return mat3(b01, (-a22 * a01 + a02 * a21), (a12 * a01 - a02 * a11),
                b11, (a22 * a00 - a02 * a20), (-a12 * a00 + a02 * a10),
                b21, (-a21 * a00 + a01 * a20), (a11 * a00 - a01 * a10));
  }

  #define EPSILON (1./128.)

  vec3 warp (vec3 p) {
    float d = 0.125 * cos(dot(vec3(2., 5., -2.), p) + time) + 0.1 * snoise4(vec4(4.0 * p, time));
    return (1. + d) * p;
  }

  void main () {
    vec3 p = warp(position);

    mat3 dp = mat3(
      warp(position + vec3(EPSILON, 0, 0)) - p,
      warp(position + vec3(0, EPSILON, 0)) - p,
      warp(position + vec3(0, 0, EPSILON)) - p);

    normal = normalize(position * adjoint(dp));
    eyeVec = eye - p;
    gl_Position = projection * view * vec4(p, 1);
  }
  `,

  attributes: {
    position: icosphere.positions
  },

  context: {
    eye: ({tick}) => cameraPos(0.0025 * tick)
  },

  uniforms: {
    eye: regl.context('eye'),
    view: (() => {
      const view = new Float32Array(16)
      return ({eye, tick}) => {
        const t = 0.0025 * tick
        return lookAt(
          view,
          eye,
          normalize(cameraPos(t + 2.0)),
          normalize(cameraPos(t - 0.5)))
      }
    })(),
    projection: (() => {
      const projection = new Float32Array(16)
      return ({viewportWidth, viewportHeight}) =>
        perspective(projection,
          Math.PI / 4.0,
          viewportWidth / viewportHeight,
          0.125,
          100)
    })(),
    time: ({tick}) => 0.01 * tick
  },

  elements: icosphere.cells
})

regl.frame(() => {
  regl.clear({
    color: PALETTE[0],
    depth: 1
  })

  drawSphere()

  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
})
