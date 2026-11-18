import type { ToolLoaders } from '../types';
import { cloudLoaders } from './cloud';
import { designLoaders } from './design';
import { developerLoaders } from './developer';
import { documentsLoaders } from './documents';
import { everydayLoaders } from './everyday';
import { mediaLoaders } from './media';

export const toolLoaders: ToolLoaders = {
  ...documentsLoaders,
  ...mediaLoaders,
  ...designLoaders,
  ...developerLoaders,
  ...everydayLoaders,
  ...cloudLoaders,
};
