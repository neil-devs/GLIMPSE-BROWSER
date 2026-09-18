/**
 * @fileoverview Barrel export for @glimpse/shared.
 * Re-exports everything from constants, ipc-types, validators, and errors
 * so consumers can do: const { SEARCH_ENGINES, AppError } = require('@glimpse/shared');
 * @module @glimpse/shared
 */

'use strict';

const constants = require('./constants');
const ipcTypes = require('./ipc-types');
const validators = require('./validators');
const errors = require('./errors');

module.exports = {
  ...constants,
  ...ipcTypes,
  ...validators,
  ...errors,
};
