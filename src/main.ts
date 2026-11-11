import {
  Color, Fog, HemisphereLight, Mesh, MeshLambertMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer,
} from 'three';

// A calm, empty waterfront: sky, lake, and a slow camera drift.
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap for phone GPUs
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color('#f3d9c4');
scene.fog = new Fog('#f3d9c4', 20, 80);

const camera = new PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(0, 3, 10);

scene.add(new HemisphereLight('#fff4e6', '#5b7c99', 2));

const lake = new Mesh(
  new PlaneGeometry(200, 200),
  new MeshLambertMaterial({ color: '#6f9fbf' }),
);
lake.rotation.x = -Math.PI / 2;
scene.add(lake);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((t) => {
  camera.position.x = Math.sin(t / 8000) * 2;
  camera.lookAt(0, 0, -10);
  renderer.render(scene, camera);
});
