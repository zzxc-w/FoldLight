import * as THREE from 'three';

export type ModelTool = 'view' | 'translate' | 'rotate' | 'scale';
export const wrapDegrees = (degrees:number) => ((degrees+180)%360+360)%360-180;
export function lightDirection(azimuth:number,elevation:number) {
  const az=THREE.MathUtils.degToRad(azimuth),el=THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));
}
export function lightAngles(direction:THREE.Vector3) {
  const n=direction.clone().normalize();
  const elevation=THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(n.y,-1,1)));
  return {azimuth:wrapDegrees(THREE.MathUtils.radToDeg(Math.atan2(n.x,n.z))),elevation:THREE.MathUtils.clamp(elevation,5,85)};
}
// Move the direction across the camera plane on its starting hemisphere.
// A trackball rotation reverses a back light's projected movement; retaining
// its hemisphere instead makes the handle follow the pointer from either side.
export function dragLightDirection(start:THREE.Vector3,cameraRotation:THREE.Quaternion,dx:number,dy:number,radius:number) {
  if(dx===0&&dy===0)return start.clone();
  const local=start.clone().normalize().applyQuaternion(cameraRotation.clone().invert());
  const screen=new THREE.Vector2(local.x+dx/Math.max(80,radius),local.y-dy/Math.max(80,radius));
  // Stop at the visible rim instead of rolling over it and reversing direction.
  if(screen.lengthSq()>1)screen.normalize();
  const depth=Math.sqrt(Math.max(0,1-screen.lengthSq()))*(local.z<0?-1:1);
  return new THREE.Vector3(screen.x,screen.y,depth).applyQuaternion(cameraRotation).normalize();
}
export function screenTranslation(cameraRotation:THREE.Quaternion,dx:number,dy:number,visibleHeight:number,viewportHeight:number) {
  return new THREE.Vector3(dx,-dy,0).multiplyScalar(visibleHeight/Math.max(1,viewportHeight)).applyQuaternion(cameraRotation);
}
export function dragModelRotation(start:THREE.Quaternion,cameraRotation:THREE.Quaternion,dx:number,dy:number,viewportHeight:number) {
  const angle=Math.hypot(dx,dy)*Math.PI/Math.max(160,viewportHeight);
  if(!angle)return start.clone();
  const axis=new THREE.Vector3(dy,dx,0).normalize().applyQuaternion(cameraRotation);
  return new THREE.Quaternion().setFromAxisAngle(axis,angle).multiply(start).normalize();
}
export const dragUniformScale=(start:number,dx:number,dy:number)=>THREE.MathUtils.clamp(start*Math.exp((dx-dy)*0.006),0.1,5);
