import * as THREE from './three.module.min.js';

window.THREE = THREE;
window.dispatchEvent(new Event('three-ready'));
