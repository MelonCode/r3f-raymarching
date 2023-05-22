import {
  BoxGeometry,
  BufferGeometry,
  Camera,
  CapsuleGeometry,
  Color,
  CubeTexture,
  CylinderGeometry,
  DepthTexture,
  Frustum,
  GLSL3,
  Group,
  IcosahedronGeometry,
  Intersection,
  Material,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBufferAttributes,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RawShaderMaterial,
  Scene,
  Sphere,
  SphereGeometry,
  Texture,
  UnsignedShortType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three'
import lighting from './shaders/lighting.glsl'
import raymarcherFragment from './shaders/raymarcher.frag'
import raymarcherVertex from './shaders/raymarcher.vert'
import screenFragment from './shaders/screen.frag'
import screenVertex from './shaders/screen.vert'

export interface Entity {
  color: Color
  operation: number
  position: Vector3
  rotation: Quaternion
  scale: Vector3
  shape: number
}

export interface Layer extends Array<Entity> {}

export class SDFLayer extends Group {
  constructor() {
    super()
  }
}

export interface SortedLayer {
  bounds: Sphere
  distance: number
  entities: Set<SDFPrimitive>
}

// TODO: Temporary type until raycasting detection is refactored
export interface SDFIntersection extends Intersection {
  entity: Entity
  entityId: number
  layer: Layer
  layerId: number
}

export type EnvMap = Texture | CubeTexture | null

const _bounds: Array<Sphere> = []
const _frustum = new Frustum()
const _position = new Vector3()
const _projection = new Matrix4()
const _size = new Vector2()
const _sphere = new Sphere()

type PrimitiveShapes =
  | BoxGeometry
  | CapsuleGeometry
  | SphereGeometry
  | CylinderGeometry
  | IcosahedronGeometry
  | PlaneGeometry

abstract class SDFPrimitive extends Mesh<PrimitiveShapes> {
  color: Color = new Color(0xffffff)
  operation: Operation = Operation.UNION
  shape: Shape = Shape.BOX
  override material: MeshBasicMaterial

  constructor(shape: number, geometry: PrimitiveShapes) {
    super(geometry)
    this.frustumCulled = false
    this.shape = shape
    this.material = new MeshBasicMaterial({
      wireframe: true,
      color: this.color,
      transparent: true,
      opacity: 0.5,
      depthWrite: true,
    })
  }
}

export class SDFBox extends SDFPrimitive {
  constructor() {
    super(Shape.BOX, new BoxGeometry(1, 1, 1))
  }
}

export class SDFCapsule extends SDFPrimitive {
  constructor() {
    super(Shape.CAPSULE, new CapsuleGeometry(0.5, 0, 16, 16))
  }
}

export class SDFSphere extends SDFPrimitive {
  constructor() {
    super(Shape.SPHERE, new IcosahedronGeometry(0.5, 2))
  }
}

export enum Shape {
  BOX,
  CAPSULE,
  SPHERE,
}

export enum Operation {
  UNION,
  SUBSTRACTION,
}

class Raymarcher extends Mesh<PlaneGeometry, RawShaderMaterial> {
  override userData: {
    blending: number
    conetracing: boolean
    envMap: EnvMap
    envMapIntensity: number
    metalness: number
    roughness: number
    layers: Layer[]
    raymarcher: Mesh<PlaneGeometry, RawShaderMaterial>
    resolution: number
    target: WebGLRenderTarget
  }

  declare material: RawShaderMaterial

  constructor({
    blending = 0.5,
    conetracing = true,
    envMap = null,
    envMapIntensity = 1,
    metalness = 0,
    layers = [],
    resolution = 1,
    roughness = 1,
  } = {}) {
    const plane = new PlaneGeometry(2, 2, 1, 1)
    plane.deleteAttribute('normal')
    plane.deleteAttribute('uv')
    const target = new WebGLRenderTarget(1, 1, {
      depthTexture: new DepthTexture(1, 1, UnsignedShortType),
    })
    const screen = new RawShaderMaterial({
      glslVersion: GLSL3,
      transparent: !!conetracing,
      vertexShader: screenVertex,
      fragmentShader: screenFragment,
      uniforms: {
        colorTexture: { value: target.texture },
        depthTexture: { value: target.depthTexture },
      },
    })

    super(plane, screen)
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      transparent: !!conetracing,
      vertexShader: raymarcherVertex,
      fragmentShader: raymarcherFragment.replace(
        '#include <lighting>',
        lighting
      ),
      defines: {
        CONETRACING: !!conetracing,
        MAX_ENTITIES: 0,
        MAX_DISTANCE: '1000.0',
        MAX_ITERATIONS: 500,
        MIN_COVERAGE: '0.02',
        MIN_DISTANCE: '0.05',
      },
      uniforms: {
        blending: { value: blending },
        bounds: { value: { center: new Vector3(), radius: 0 } },
        cameraDirection: { value: new Vector3() },
        cameraFar: { value: 0 },
        cameraFov: { value: 0 },
        cameraNear: { value: 0 },
        envMap: { value: null },
        envMapIntensity: { value: envMapIntensity },
        metalness: { value: metalness },
        resolution: { value: new Vector2() },
        roughness: { value: roughness },
        numEntities: { value: 0 },
        entities: {
          value: [
            {
              color: new Vector3(),
              operation: Operation.UNION,
              position: new Vector3(),
              rotation: new Quaternion(1, 0, 0, 0),
              scale: new Vector3(1, 1, 1),
              shape: Shape.BOX,
            },
          ],
        },
      },
    })
    const { defines, uniforms } = material
    this.userData = {
      get blending() {
        return uniforms.blending.value
      },
      set blending(value) {
        uniforms.blending.value = value
      },
      get conetracing() {
        return defines.CONETRACING
      },
      set conetracing(value) {
        if (defines.CONETRACING !== !!value) {
          defines.CONETRACING = !!value
          material.transparent = screen.transparent = !!value
          material.needsUpdate = true
        }
      },
      get envMap() {
        return uniforms.envMap.value
      },
      set envMap(value) {
        uniforms.envMap.value = value
        if (defines.ENVMAP_TYPE_CUBE_UV !== !!value) {
          defines.ENVMAP_TYPE_CUBE_UV = !!value
          material.needsUpdate = true
        }
        if (value) {
          const maxMip = Math.log2(value.image.height) - 2
          const texelWidth = 1.0 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16))
          const texelHeight = 1.0 / value.image.height
          if (defines.CUBEUV_MAX_MIP !== `${maxMip}.0`) {
            defines.CUBEUV_MAX_MIP = `${maxMip}.0`
            material.needsUpdate = true
          }
          if (defines.CUBEUV_TEXEL_WIDTH !== texelWidth) {
            defines.CUBEUV_TEXEL_WIDTH = texelWidth
            material.needsUpdate = true
          }
          if (defines.CUBEUV_TEXEL_HEIGHT !== texelHeight) {
            defines.CUBEUV_TEXEL_HEIGHT = texelHeight
            material.needsUpdate = true
          }
        }
      },
      get envMapIntensity() {
        return uniforms.envMapIntensity.value
      },
      set envMapIntensity(value) {
        uniforms.envMapIntensity.value = value
      },
      get metalness() {
        return uniforms.metalness.value
      },
      set metalness(value) {
        uniforms.metalness.value = value
      },
      get roughness() {
        return uniforms.roughness.value
      },
      set roughness(value) {
        uniforms.roughness.value = value
      },
      layers,
      raymarcher: new Mesh(plane, material),
      resolution,
      target,
    }
    this.matrixAutoUpdate = this.userData.raymarcher.matrixAutoUpdate = false
    this.frustumCulled = this.userData.raymarcher.frustumCulled = false
    if (envMap) {
      this.userData.envMap = envMap
    }
  }

  private findSdfLayers(object: Object3D): Set<SDFLayer> {
    let sdfLayerSet: Set<SDFLayer> = new Set()
    let queue: Object3D[] = [object]
    while (queue.length > 0) {
      let current = queue.shift()
      if (current instanceof SDFLayer) {
        sdfLayerSet.add(current)
        continue
      }
      if (current && current.children) {
        queue = queue.concat(current.children)
      }
    }
    return sdfLayerSet
  }

  private findSdfPrimitives(layer: SDFLayer): Set<SDFPrimitive> {
    let sdfPrimitiveSet: Set<SDFPrimitive> = new Set()
    let queue: Object3D[] = [layer]
    while (queue.length > 0) {
      let current = queue.shift()
      if (current instanceof SDFPrimitive) {
        sdfPrimitiveSet.add(current)
      }
      if (current && current.children) {
        queue = queue.concat(current.children)
      }
    }
    return sdfPrimitiveSet
  }

  dispose() {
    const {
      material,
      geometry,
      userData: { raymarcher, target },
    } = this
    material.dispose()
    geometry.dispose()
    raymarcher.material.dispose()
    target.dispose()
    target.depthTexture.dispose()
    target.texture.dispose()
  }
  onBeforeRender = (renderer: WebGLRenderer, _scene: Scene, camera: Camera) => {
    const sdfLayerSet: Set<SDFLayer> = this.findSdfLayers(this)

    const layers: Set<SDFPrimitive>[] = []
    for (const sdfLayer of sdfLayerSet) {
      layers.push(this.findSdfPrimitives(sdfLayer))
    }

    // TODO Can we get rid of this?
    if (!(camera instanceof PerspectiveCamera)) {
      throw new Error('Camera must be a PerspectiveCamera')
    }

    const {
      userData: { resolution, raymarcher, target },
    } = this
    const {
      material: { defines, uniforms },
    } = raymarcher

    camera.getWorldDirection(uniforms.cameraDirection.value)
    uniforms.cameraFar.value = camera.far
    uniforms.cameraFov.value = MathUtils.degToRad(camera.fov)
    uniforms.cameraNear.value = camera.near

    _frustum.setFromProjectionMatrix(
      _projection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      )
    )
    camera.getWorldPosition(_position)

    // TODO Can we only sort layers when they change?
    const sortedLayers: Array<SortedLayer> = layers
      .reduce((layers, entities, layer) => {
        if (defines.MAX_ENTITIES < entities.size) {
          defines.MAX_ENTITIES = entities.size

          const value: Array<Entity> = []
          for (const entity of entities) {
            value.push({
              color: entity.color,
              operation: entity.operation,
              position: entity.position,
              rotation: entity.quaternion,
              scale: entity.scale,
              shape: entity.shape,
            })
          }
          uniforms.entities.value = value
          raymarcher.material.needsUpdate = true
        }
        const bounds = Raymarcher.getLayerBounds(layer)
        entities.forEach((entity) => {
          entity.material.color = entity.color

          entity.geometry.computeBoundingSphere()
          const {
            geometry: { boundingSphere },
            matrixWorld,
          } = entity

          _sphere.copy(boundingSphere!).applyMatrix4(matrixWorld)

          if (bounds.isEmpty()) {
            bounds.copy(_sphere)
          } else {
            bounds.union(_sphere)
          }
        })

        if (_frustum.intersectsSphere(bounds)) {
          layers.push({
            bounds,
            entities,
            distance: bounds.center.distanceTo(_position),
          })
        }
        return layers
      }, [] as Array<SortedLayer>)
      .sort(({ distance: a }, { distance: b }) =>
        defines.CONETRACING ? b - a : a - b
      )

    renderer.getDrawingBufferSize(_size).multiplyScalar(resolution).floor()
    if (target.width !== _size.x || target.height !== _size.y) {
      target.setSize(_size.x, _size.y)
      uniforms.resolution.value.copy(_size)
    }

    const currentAutoClear = renderer.autoClear
    const currentClearAlpha = renderer.getClearAlpha()
    const currentRenderTarget = renderer.getRenderTarget()
    const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate
    const currentXrEnabled = renderer.xr.enabled
    renderer.autoClear = false
    renderer.shadowMap.autoUpdate = false
    renderer.xr.enabled = false
    renderer.setClearAlpha(0)
    renderer.setRenderTarget(target)
    renderer.state.buffers.depth.setMask(true)

    renderer.clear()
    sortedLayers.forEach(({ bounds, entities }) => {
      uniforms.bounds.value.center.copy(bounds.center)
      uniforms.bounds.value.radius = bounds.radius
      uniforms.numEntities.value = entities.size
      let i = 0
      entities.forEach(
        ({ color, operation, position, quaternion, scale, shape }) => {
          const uniform = uniforms.entities.value[i++]
          uniform.color.copy(color)
          uniform.operation = operation
          uniform.position.copy(position)
          uniform.rotation.copy(quaternion)
          uniform.scale.copy(scale)
          uniform.shape = shape
        }
      )
      renderer.render(raymarcher, camera)
    })

    renderer.autoClear = currentAutoClear
    renderer.shadowMap.autoUpdate = currentShadowAutoUpdate
    renderer.xr.enabled = currentXrEnabled
    renderer.setClearAlpha(currentClearAlpha)
    renderer.setRenderTarget(currentRenderTarget)

    // What is this for?
    // if (camera.viewport) renderer.state.viewport(camera.viewport)
  }

  static cloneEntity({
    color,
    operation,
    position,
    rotation,
    scale,
    shape,
  }: Entity): Entity {
    return {
      color: color.clone(),
      operation,
      position: position.clone(),
      rotation: rotation.clone(),
      scale: scale.clone(),
      shape,
    }
  }

  static getEntityCollider(entity: SDFPrimitive) {
    // const collider = _colliders[shape]
    // collider.position.copy(position)
    // collider.quaternion.setFromEuler(rotation)
    // collider.scale.copy(scale)
    // if (shape === Shape.CAPSULE) {
    //   collider.scale.z = collider.scale.x
    // }
    // collider.updateMatrixWorld()
    return entity
  }

  static getLayerBounds(layer: number): Sphere {
    if (!_bounds[layer]) {
      _bounds[layer] = new Sphere()
    }
    return _bounds[layer].makeEmpty()
  }
}

export default Raymarcher
