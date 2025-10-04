import React, { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, Stage } from "@react-three/drei";

const IsometricCamera = () => {
  const { camera, size } = useThree();

  React.useEffect(() => {
    camera.position.set(12, 12, 12);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  React.useEffect(() => {
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
  }, [camera, size]);

  useFrame(() => {
    camera.updateMatrixWorld();
  });

  return null;
};

const Ground = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[20, 20]} />
    <meshStandardMaterial color="#2f3d2f" roughness={1} flatShading />
  </mesh>
);

const Campfire = () => {
  const flameRef = useRef();
  const emberPositions = useMemo(
    () =>
      new Array(8).fill().map((_, index) => ({
        angle: (index / 8) * Math.PI * 2,
        radius: 0.6 + Math.random() * 0.15,
        height: 0.1 + Math.random() * 0.1,
      })),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (flameRef.current) {
      const scale = 1 + Math.sin(t * 3) * 0.15;
      flameRef.current.scale.set(1, scale, 1);
      flameRef.current.material.emissiveIntensity = 1.5 + Math.sin(t * 4) * 0.5;
    }
  });

  return (
    <group>
      <mesh position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.18, 2.4, 6]} />
        <meshStandardMaterial color="#5a3d2b" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, 0.35, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.15, 0.18, 2.4, 6]} />
        <meshStandardMaterial color="#4b2f1f" roughness={0.8} flatShading />
      </mesh>
      <mesh ref={flameRef} position={[0, 1.1, 0]} castShadow>
        <coneGeometry args={[0.5, 1.5, 8]} />
        <meshStandardMaterial
          color="#ff914d"
          emissive="#ffcc66"
          emissiveIntensity={1.8}
          roughness={0.4}
          flatShading
        />
      </mesh>
      {emberPositions.map(({ angle, radius, height }, index) => (
        <mesh key={index} position={[Math.cos(angle) * radius, height, Math.sin(angle) * radius]}>
          <icosahedronGeometry args={[0.08, 0]} />
          <meshStandardMaterial color="#ffb347" emissive="#ff792e" emissiveIntensity={0.6} />
        </mesh>
      ))}
    </group>
  );
};

const PineTree = ({ position = [0, 0, 0], scale = 1 }) => (
  <group position={position} scale={scale} castShadow>
    <mesh position={[0, 0.8, 0]}>
      <coneGeometry args={[0.6, 1.6, 6]} />
      <meshStandardMaterial color="#254035" roughness={0.9} flatShading />
    </mesh>
    <mesh position={[0, 1.4, 0]}>
      <coneGeometry args={[0.5, 1.2, 6]} />
      <meshStandardMaterial color="#2f5a45" roughness={0.9} flatShading />
    </mesh>
    <mesh position={[0, 0.35, 0]}>
      <cylinderGeometry args={[0.14, 0.18, 0.7, 6]} />
      <meshStandardMaterial color="#5b3d2b" roughness={0.8} flatShading />
    </mesh>
  </group>
);

const Camper = ({ position = [0, 0, 0], color = "#f2d2b6" }) => {
  const bobRef = useRef();
  useFrame(({ clock }) => {
    if (!bobRef.current) return;
    bobRef.current.position.y = Math.sin(clock.getElapsedTime() * 1.2) * 0.05 + 0.5;
  });
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.3, 0.35, 1.1, 6]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh ref={bobRef} position={[0, 0.9, 0]}>
        <icosahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#f7c89a" flatShading />
      </mesh>
      <mesh position={[0, 0.2, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.6, 6]} />
        <meshStandardMaterial color="#c06f4a" flatShading />
      </mesh>
    </group>
  );
};

const Fireflies = () => {
  const group = useRef();
  const offsets = useMemo(
    () => new Array(20).fill().map(() => [Math.random() * 6 - 3, Math.random() * 1.5 + 1, Math.random() * 6 - 3]),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!group.current) return;
    offsets.forEach((offset, index) => {
      const mesh = group.current.children[index];
      const sway = Math.sin(t * 0.8 + index) * 0.3;
      mesh.position.set(offset[0] + Math.sin(t + index) * 0.2, offset[1] + sway * 0.1, offset[2] + Math.cos(t + index) * 0.2);
      mesh.material.emissiveIntensity = 0.6 + Math.sin(t * 4 + index) * 0.3;
    });
  });

  return (
    <group ref={group}>
      {offsets.map((offset, index) => (
        <mesh key={index} position={offset}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#ffd27f" emissive="#ffd27f" emissiveIntensity={0.9} />
        </mesh>
      ))}
    </group>
  );
};

const MiniGameScene = () => (
  <Stage intensity={0.6} environment={null} shadows="contact" adjustCamera={false}>
    <group>
      <Ground />
      <Campfire />
      <PineTree position={[-3.2, 0, -2.5]} scale={1.4} />
      <PineTree position={[3, 0, -1.5]} scale={1.1} />
      <PineTree position={[-2.4, 0, 3.2]} scale={0.9} />
      <Camper position={[1.8, 0, 1.6]} color="#9bb7d4" />
      <Camper position={[-1.6, 0, 1.2]} color="#d4a29c" />
      <Fireflies />
    </group>
  </Stage>
);

const MiniGame = () => (
  <div id="mini-game" className="w-full h-full flex-1">
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [12, 12, 12], fov: 45, near: 0.1, far: 100 }}
    >
      <color attach="background" args={["#0f1419"]} />
      <IsometricCamera />
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1.1} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[0, 2.4, 0]} intensity={1.4} color="#ff9f6e" distance={8} />
      <Suspense fallback={null}>
        <MiniGameScene />
      </Suspense>
      <Environment preset="night" background={false} />
      <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
    </Canvas>
  </div>
);

export default MiniGame;
