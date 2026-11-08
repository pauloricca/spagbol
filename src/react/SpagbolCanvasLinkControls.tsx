import type { CSSProperties } from 'react';
import { standardLinkModes } from '../core/index.js';
import { SpagbolControlNumberLink } from './SpagbolControlNumberLink.js';
export interface SpagbolCanvasLinkControlsProps {
  weight: number; mode: string; enabled: boolean; style?: CSSProperties;
  modes?: readonly { id: string; label: string }[];
  onWeightChange(value: number): void;
  onModeChange(mode: string): void;
  onEnabledChange(enabled: boolean): void;
}
export function SpagbolCanvasLinkControls({ weight, mode, enabled, style, modes = standardLinkModes, onWeightChange, onModeChange, onEnabledChange }: SpagbolCanvasLinkControlsProps) {
  return <div className="spagbol-canvas-link-controls nodrag nopan" style={style} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <div className="spagbol-canvas-link-controls-value-row">
      <SpagbolControlNumberLink value={weight} onChange={onWeightChange} />
      <button className={`spagbol-canvas-link-controls-enabled nodrag nopan${enabled ? ' spagbol-canvas-link-controls-enabled-active' : ''}`} type="button" onClick={event => { event.stopPropagation(); onEnabledChange(!enabled); }} onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} aria-label={enabled ? 'Disable link' : 'Enable link'} aria-pressed={enabled} title={enabled ? 'Disable link' : 'Enable link'} />
    </div>
    <select className="spagbol-canvas-link-controls-mode nodrag nopan" value={mode} onChange={event => { onModeChange(event.target.value); event.currentTarget.blur(); }} onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} aria-label="Link mode" title="Link mode">
      {modes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
  </div>;
}
