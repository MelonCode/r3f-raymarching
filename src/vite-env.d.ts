declare module '*.glsl' {
  const shader: string
  export default shader
}
declare module '*.frag' {
  const shader: string
  export default shader
}
declare module '*.vert' {
  const shader: string
  export default shader
}

// Add types to ThreeElements elements so primitives pick up on it
declare module '@react-three/fiber' {
  interface ThreeElements {
    customElement: Object3DNode<CustomElement, typeof CustomElement>
  }
}
