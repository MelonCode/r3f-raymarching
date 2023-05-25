import { OrbitControls, Stats, TransformControls } from '@react-three/drei'
import {
  Canvas,
  Object3DNode,
  ThreeEvent,
  extend,
  useFrame,
  useThree,
} from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import THREE, {
  BoxGeometry,
  Color,
  Euler,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  Quaternion,
  Vector3,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import Raymarcher, {
  Entity,
  Operation,
  SDFBox,
  SDFCapsule,
  SDFLayer,
  SDFSphere,
} from '../src'
import React from 'react'
import { WireframeMaterial } from '@react-three/drei/materials/WireframeMaterial'
import {
  Selection,
  Select,
  EffectComposer,
  Outline,
} from '@react-three/postprocessing'

extend({
  Raymarcher,
  SdfSphere: SDFSphere,
  SdfBox: SDFBox,
  SdfCapsule: SDFCapsule,
  SdfLayer: SDFLayer,
})

// Add types to ThreeElements elements so primitives pick up on it
declare module '@react-three/fiber' {
  interface ThreeElements {
    raymarcher: Object3DNode<Raymarcher, typeof Raymarcher>
    sdfBox: Object3DNode<SDFBox, typeof SDFBox>
    sdfSphere: Object3DNode<SDFSphere, typeof SDFSphere>
    sdfCapsule: Object3DNode<SDFCapsule, typeof SDFCapsule>
    sdfLayer: Object3DNode<SDFLayer, typeof SDFLayer>
  }
}

function SelectableBox(props) {
  const ref = useRef<SDFSphere>(null)
  const [color, setColor] = useState<string>('orangered')

  return (
    <>
      <TransformControls object={ref.current!}>
        <sdfSphere
          ref={ref}
          operation={Operation.SUBSTRACTION}
          color="limegreen"
          position={[-4.2, 1.6, 1.4]}
          scale={[0.5, 0.5, 0.5]}
        />
      </TransformControls>
    </>
  )
}

const Scene = () => {
  const { gl } = useThree()
  const envMap = useMemo(
    () => new PMREMGenerator(gl).fromScene(new RoomEnvironment()).texture,
    [gl]
  )

  const raymarcherRef = useRef<Raymarcher>(null)

  const meshRef = useRef<Mesh>(null)

  const frame = useFrame((state, delta) => {
    if (meshRef.current) {
      // raymarcherRef.current!.blending = Math.max(
      //   Math.cos(state.clock.getElapsedTime()) * 0.75,
      //   0
      // )
      // meshRef.current.rotation.y += delta
      // meshRef.current.rotation.x += delta
    }
  })

  console.log(raymarcherRef)

  return (
    <>
      <raymarcher
        ref={raymarcherRef}
        envMap={envMap}
        envMapIntensity={0.6}
        blending={0.0}
      >
        <sdfLayer>
          <sdfBox
            pbr-color={'red'}
            position-x={-0.1}
            scale={[1.2, 1.2, 1.2]}
            pbr-params={[1.0, 0.0, 0.0, 0.0]}
          />

          <sdfSphere
            position-x={1.2}
            pbr-color={'orange'}
            pbr-params={[0.2, 0.8, 0.0, 0.0]}
          />
          <sdfBox
            ref={meshRef}
            rotation-x={Math.PI / 4}
            rotation-y={Math.PI / 4}
            scale-y={1}
            position-x={2.4}
            pbr-color={'green'}
            pbr-params={[0.0, 1.0, 0.0, 0.0]}
          />
          <sdfSphere
            position-x={3.6}
            pbr-color={'blue'}
            pbr-params={[1.0, 0.0, 0.0, 0.0]}
          />
          <sdfCapsule
            scale-y={2}
            position-x={4.8}
            pbr-color={'purple'}
            pbr-params={[0.0, 0.0, 0.0, 0.0]}
          />
        </sdfLayer>
      </raymarcher>
    </>
  )
}

export default function App() {
  return (
    <Canvas
      camera={{ fov: 50, position: [0, 4, 8] }}
      dpr={1}
      className="canvas"
    >
      <OrbitControls makeDefault />
      <Scene />
      <Stats />
    </Canvas>
  )
}
