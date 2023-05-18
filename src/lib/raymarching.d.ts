import { Properties } from '@react-three/fiber'
import { IntersectionEvent } from '@react-three/fiber/dist/declarations/src/core/events'

import {
  Camera,
  CubeTexture,
  Mesh,
  Scene,
  Sphere,
  Texture,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
  Raycaster,
  Intersection,
  Color,
  Quaternion,
} from 'three'

export interface Entity {
  color: Color
  operation: number
  position: Vector3
  rotation: Quaternion
  scale: Vector3
  shape: number
}

export interface Layer extends Array<Entity> {}

export interface SortedLayer {
  bounds: Sphere
  distance: number
  entities: Entity[]
}

type EnvMap = Texture | CubeTexture | null

export default class Raymarcher extends Mesh {
  constructor(options?: {
    blending?: number
    conetracing?: boolean
    envMap?: EnvMap
    envMapIntensity?: number
    metalness?: number
    layers?: Layer[]
    resolution?: number
    roughness?: number
  })

  static operations: {
    union: 0
    substraction: 1
    intersection: 2
  }

  static shapes: {
    box: 0
    capsule: 1
    sphere: 2
  }

  static cloneEntity(entity: Entity): Entity
  static getEntityCollider(entity: Entity): Mesh
  static getLayerBounds(layer: number): Sphere

  copy(source: Raymarcher): this
  dispose(): void
  onBeforeRender: (
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera
  ) => void

  onClick(
    event: IntersectionEvent<MouseEvent> &
      Properties<MouseEvent> & { entity: Entity }
  ): void

  raycast(raycaster: Raycaster, intersects: Intersection[]): void

  userData: {
    blending: number
    conetracing: boolean
    envMap: EnvMap
    envMapIntensity: number
    metalness: number
    roughness: number
    layers: Layer[]
    raymarcher: Mesh
    resolution: number
    target: WebGLRenderTarget
  }
}

declare module '@react-three/fiber' {
  interface ThreeElements {
    raymarcher: Object3DNode<Raymarcher, typeof Raymarcher>
  }
}
