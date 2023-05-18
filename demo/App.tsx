import { OrbitControls, Stats } from '@react-three/drei'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useMemo, useRef } from 'react'
import { Color, PMREMGenerator, Quaternion, Vector3 } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Raymarcher } from '../src'
import type { Entity } from '../src/lib/raymarching'
import React from 'react'

extend({ Raymarcher })

const { operations, shapes } = Raymarcher

const Scene = () => {
  const layers = useRef(
    Array.from({ length: 5 }, (v, l) => {
      const position = new Vector3(-5 + l * 2.5, ((l % 2) - 0.25) * 1.5, -l % 2)
      const scale = new Vector3().setScalar(2 + Math.random())
      return [
        {
          color: new Color(Math.random() * 0xffffff),
          operation: operations.union,
          position,
          rotation: new Quaternion(0, 0, 0, 1),
          scale,
          shape: shapes.box,
        },
        {
          color: new Color(Math.random() * 0xffffff),
          operation: l % 2 ? operations.union : operations.substraction,
          position: position.clone(),
          rotation: new Quaternion(0, 0, 0, 1),
          scale: scale.clone(),
          shape: shapes.sphere,
        },
      ]
    })
  )
  useFrame(({ clock }) => {
    layers.current.forEach((layer, l) =>
      layer.forEach((entity, e) => {
        entity.scale.setScalar(
          1.5 +
            Math.sin(clock.oldTime / 1000 + l * 1.5) * 0.5 +
            e * (0.125 + (l % 2 ? e * 0.5 : 0))
        )
      })
    )
  })
  const { gl } = useThree()
  const envMap = useMemo(
    () => new PMREMGenerator(gl).fromScene(new RoomEnvironment()).texture,
    [gl]
  )
  const randomize = useCallback((obj: { entity: Entity }) => {
    console.log(obj)
    obj.entity.color.setHex(Math.random() * 0xffffff)
  }, [])
  return (
    <raymarcher
      onClick={randomize}
      userData-layers={layers.current}
      userData-envMap={envMap}
      userData-envMapIntensity={0.6}
      userData-roughness={0.0}
    />
  )
}

export default function App() {
  return (
    <Canvas
      camera={{ fov: 50, position: [0, 4, 8] }}
      dpr={1}
      className="canvas"
    >
      <OrbitControls />
      <Scene />
      <Stats />
    </Canvas>
  )
}
