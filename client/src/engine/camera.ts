export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function updateFreeCamera(
  camera: Camera,
  panVelocityX: number,
  panVelocityY: number,
  dragging: boolean,
): [number, number] {
  if (!dragging) {
    camera.x += panVelocityX;
    camera.y += panVelocityY;
    panVelocityX *= 0.92;
    panVelocityY *= 0.92;
    if (Math.abs(panVelocityX) < 0.01) panVelocityX = 0;
    if (Math.abs(panVelocityY) < 0.01) panVelocityY = 0;
  }
  return [panVelocityX, panVelocityY];
}
