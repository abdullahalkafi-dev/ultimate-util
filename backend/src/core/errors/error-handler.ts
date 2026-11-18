import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './app-error.js';

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Some fields are invalid',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  if (statusCode === 429) {
    return reply.status(429).send({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a moment.' },
    });
  }
  if (statusCode < 500) {
    return reply.status(statusCode).send({ error: { code: 'REQUEST_FAILED', message: error.message } });
  }
  request.log.error({ err: error }, 'Unhandled error');
  return reply.status(500).send({
    error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' },
  });
}
