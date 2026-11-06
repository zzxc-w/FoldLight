import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {lightDirection,lightAngles,dragLightDirection,screenTranslation,dragModelRotation,dragUniformScale} from '../src/interaction.ts';
test('camera-relative light drags are continuous, normalized, and follow the screen',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI])for(const pitch of [0,.3])for(const azimuth of [-135,-45,45,135]){
    const camera=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
    // Keep the world light fixed when the camera moves, including back lights.
    const start=lightDirection(azimuth,38);
    assert.ok(dragLightDirection(start,camera,0,0,160).distanceTo(start)<1e-10,'No jump on initial grab');
    const localStart=start.clone().applyQuaternion(camera.clone().invert());
    const right=dragLightDirection(start,camera,20,0,160).applyQuaternion(camera.clone().invert());
    const up=dragLightDirection(start,camera,0,-20,160).applyQuaternion(camera.clone().invert());
    assert.ok(right.x>localStart.x,'Right follows camera-right, including back view');assert.ok(up.y>localStart.y,'Up follows camera-up');
    const tiny=dragLightDirection(start,camera,.01,0,160);assert.ok(tiny.distanceTo(start)<.001);
    assert.ok(Math.abs(tiny.length()-1)<1e-10);
  }
});
test('light drags retain their starting hemisphere and stop at the camera rim',()=>{
  const camera=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,1.2,0));
  for(const sign of [-1,1]){
    const localStart=new THREE.Vector3(.2,.3,sign*Math.sqrt(.87));
    const start=localStart.clone().applyQuaternion(camera);
    const inside=dragLightDirection(start,camera,10,0,160).applyQuaternion(camera.clone().invert());
    assert.equal(Math.sign(inside.z),sign);
    const edge=dragLightDirection(start,camera,5000,0,160).applyQuaternion(camera.clone().invert());
    assert.ok(edge.x>inside.x);assert.ok(Math.abs(edge.z)<1e-6);assert.ok(Math.abs(edge.length()-1)<1e-10);
    const further=dragLightDirection(start,camera,10000,0,160).applyQuaternion(camera.clone().invert());
    assert.ok(further.x>=edge.x,'Continuing beyond the rim cannot reverse horizontal motion');
  }
});
test('light angle conversion wraps safely and respects the allowed hemisphere',()=>{
  for(const az of [-180,-100,0,90,179])for(const el of [5,38,85]){
    const result=lightAngles(lightDirection(az,el));assert.ok(Math.abs(result.azimuth-az)<1e-8);assert.ok(Math.abs(result.elevation-el)<1e-8);
  }
  for(const delta of [-5000,-1,0,3000]){const angles=lightAngles(dragLightDirection(lightDirection(-45,38),new THREE.Quaternion(),delta,delta,120));assert.ok(angles.azimuth>=-180&&angles.azimuth<180);assert.ok(angles.elevation>=5&&angles.elevation<=85);}
});
test('model screen-plane movement and rotation preserve camera-independent 3D math',()=>{
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,1.2,0));
  const move=screenTranslation(q,60,-30,6,600).applyQuaternion(q.clone().invert());
  assert.ok(move.distanceTo(new THREE.Vector3(.6,.3,0))<1e-9);
  const start=new THREE.Quaternion().setFromEuler(new THREE.Euler(.5,.2,.3));
  assert.ok(dragModelRotation(start,q,0,0,600).angleTo(start)<1e-6);
  const rotation=dragModelRotation(start,q,80,60,600);assert.ok(Math.abs(rotation.length()-1)<1e-9);assert.ok(rotation.angleTo(start)>.1);
});
test('uniform scaling is proportional, reversible, and bounded',()=>{
  const bigger=dragUniformScale(1,50,-30);assert.ok(bigger>1);assert.ok(Math.abs(dragUniformScale(bigger,-50,30)-1)<1e-8);
  assert.equal(dragUniformScale(1,0,0),1);assert.equal(dragUniformScale(1,10000,0),5);assert.equal(dragUniformScale(1,-10000,0),.1);
});
