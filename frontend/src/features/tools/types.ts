import type { ComponentType } from 'react';

/** Every tool folder default-exports a React component with no props. */
export type ToolLoader = () => Promise<{ default: ComponentType }>;
export type ToolLoaders = Record<string, ToolLoader>;
