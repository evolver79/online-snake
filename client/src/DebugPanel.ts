import { Pane } from 'tweakpane';

export interface PanelCallbacks {
  onCamera:   (elevation: number, azimuth: number, zoom: number) => void;
  onFov:      (fov: number) => void;
  onBoxHeight:(mult: number) => void;
  onBloom:    (strength: number, threshold: number) => void;
  onBaseTick: (ms: number) => void;
}

export function buildDebugPanel(cb: PanelCallbacks): void {
  const params = {
    elevation:      22,
    azimuth:        90,
    zoom:           50,
    fov:            70,
    boxHeight:      1.0,
    bloomStrength:  0.7,
    bloomThreshold: 0.55,
    baseTick:       100,
  };

  const pane = new Pane({ title: 'SETTINGS', expanded: false });

  const cam = pane.addFolder({ title: 'Camera' });
  cam.addBinding(params, 'elevation',  { min: 5,   max: 80,   step: 0.5,  label: 'Elevation °' })
    .on('change', () => cb.onCamera(params.elevation, params.azimuth, params.zoom));
  cam.addBinding(params, 'azimuth',    { min: 0,   max: 180,  step: 0.5,  label: 'Azimuth °' })
    .on('change', () => cb.onCamera(params.elevation, params.azimuth, params.zoom));
  cam.addBinding(params, 'zoom',       { min: 15,  max: 100,  step: 0.5,  label: 'Zoom' })
    .on('change', () => cb.onCamera(params.elevation, params.azimuth, params.zoom));
  cam.addBinding(params, 'fov',        { min: 30,  max: 110,  step: 1,    label: 'FOV °' })
    .on('change', () => cb.onFov(params.fov));

  const scene = pane.addFolder({ title: 'Scene' });
  scene.addBinding(params, 'boxHeight', { min: 0.2, max: 2.5, step: 0.05, label: 'Box Height ×' })
    .on('change', () => cb.onBoxHeight(params.boxHeight));

  const fx = pane.addFolder({ title: 'Bloom' });
  fx.addBinding(params, 'bloomStrength',  { min: 0, max: 2.0, step: 0.05, label: 'Strength' })
    .on('change', () => cb.onBloom(params.bloomStrength, params.bloomThreshold));
  fx.addBinding(params, 'bloomThreshold', { min: 0.05, max: 0.95, step: 0.01, label: 'Threshold' })
    .on('change', () => cb.onBloom(params.bloomStrength, params.bloomThreshold));

  const game = pane.addFolder({ title: 'Game' });
  game.addBinding(params, 'baseTick', { min: 40, max: 300, step: 5, label: 'Base tick ms' })
    .on('change', () => cb.onBaseTick(params.baseTick));

  const el = pane.element;
  el.style.position  = 'fixed';
  el.style.top       = '12px';
  el.style.left      = '50%';
  el.style.transform = 'translateX(-50%)';
  el.style.zIndex    = '200';
  el.style.pointerEvents = 'all';
  document.body.appendChild(el);

  el.addEventListener('keydown', e => e.stopPropagation());
}
