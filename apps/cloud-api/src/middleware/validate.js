/**
 * @fileoverview Zod request validation middleware factory.
 * Validates req.body (and optionally req.query / req.params) against
 * a Zod schema. Returns 400 with field-level errors on failure.
 * @module cloud-api/middleware/validate
 */

'use strict';

const { ZodError } = require('zod');
const { Errors } = require('@glimpse/shared/errors');

/**
 * Create a validation middleware for the given Zod schema.
 * Validates req.body by default. Pass options to validate query or params.
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @param {object} [options]
 * @param {'body'|'query'|'params'} [options.source='body'] - Request property to validate
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.post('/signup', validate(signupSchema), authController.signup);
 * router.get('/items', validate(paginationSchema, { source: 'query' }), itemsController.list);
 */
function validate(schema, options = {}) {
  const source = options.source || 'body';

  return (req, res, next) => {
    try {
      const result = schema.parse(req[source]);
      /* Replace the raw input with the parsed & transformed result
         (e.g. trimmed strings, lowered emails, coerced numbers) */
      req[source] = result;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors = {};
        for (const issue of err.issues) {
          const path = issue.path.join('.') || '_root';
          if (!fieldErrors[path]) {
            fieldErrors[path] = [];
          }
          fieldErrors[path].push(issue.message);
        }

        const appError = Errors.VALIDATION_ERROR(
          'Request validation failed',
          fieldErrors
        );
        return next(appError);
      }
      next(err);
    }
  };
}

module.exports = validate;
