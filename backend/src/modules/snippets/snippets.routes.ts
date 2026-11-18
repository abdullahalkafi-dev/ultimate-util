import type { FastifyInstance } from 'fastify';
import { QUOTAS, snippetBodySchema } from '@uu/shared';
import { registerOwnedCrud } from '../../core/crud/owned-crud.js';
import { SnippetModel } from './snippet.model.js';

export async function snippetRoutes(app: FastifyInstance) {
  registerOwnedCrud(app, {
    basePath: '/snippets',
    model: SnippetModel,
    bodySchema: snippetBodySchema,
    quota: { max: QUOTAS.snippets, message: 'You have reached the limit of 1,000 snippets.' },
  });
}
