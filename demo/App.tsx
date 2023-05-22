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
  const randomize = useCallback((event: ThreeEvent<MouseEvent>) => {
    // obj.entity.color.setHex(Math.random() * 0xffffff)
  }, [])

  const raymarcherRef = useRef<Raymarcher>(null)
  const meshRef = useRef<Mesh>(null)

  return (
    <>
      <raymarcher
        ref={raymarcherRef}
        onClick={randomize}
        userData-envMap={envMap}
        userData-envMapIntensity={0.6}
        userData-roughness={1.0}
        userData-blending={0.35}
      >
        <sdfLayer>
          <sdfCapsule color={'green'} />
          <sdfCapsule
            color={'green'}
            operation={Operation.SUBSTRACTION}
            position-x={1}
            scale-y={2}
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
