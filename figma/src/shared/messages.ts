import type { Capture } from './capture-types';

export interface BuildWarning {
  level: 'info' | 'warning';
  nodeId?: string;
  message: string;
}

export interface BuildResult {
  nodesCreated: number;
  nodesCollapsed: number;
  warnings: BuildWarning[];
  missingFonts: { family: string; style: string }[];
}

export type UIToPlugin =
  | { type: 'build-request'; capture: Capture; simplify: boolean; iconMode: 'stroke' | 'fill'; useAutoLayout: boolean }
  | { type: 'select-node'; nodeId: string }
  | { type: 'cancel' };

export type PluginToUI =
  | { type: 'progress'; current: number; total: number; phase: string }
  | { type: 'build-complete'; result: BuildResult }
  | { type: 'build-error'; error: string };
