import { lazy, Suspense } from 'react';
import type { Scene3DProps } from './Scene3D';

// three.js loads on demand, so the first paint and the emergency path never wait for it.
const Scene3D = lazy(() => import('./Scene3D'));

export function Scene(props: Scene3DProps) {
  return (
    <Suspense fallback={<div className={`scene-skeleton ${props.className ?? ''}`} aria-hidden="true" />}>
      <Scene3D {...props} />
    </Suspense>
  );
}
