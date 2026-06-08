'use strict'

const { validateRequiredEnv } = require('./helpers')

/**
 * Base class for all actions-ci subcommands.
 *
 * Subclasses must implement:
 *   toCommand() — builds and returns the paparam command() instance
 *   _run(flags) — contains the actual domain logic
 *
 * Subclasses MUST NOT override run() — it is a template method that
 * automatically validates all declared secrets before calling _run().
 * This is a structural guarantee: secret validation cannot be skipped.
 *
 * To add a new subcommand:
 *   1. Create lib/commands/<name>/index.js — extend Command
 *   2. Create lib/commands/<name>/helpers.js — domain logic
 *   3. Call newCmd.toCommand() as a positional arg in main.js command()
 *   4. Write flat test files: test/unit/<name>-index.test.js, test/unit/<name>-helpers.test.js
 */
class Command {
  /**
   * @param {object} opts
   * @param {string} opts.name - subcommand name (used in error messages)
   * @param {string} opts.description - one-line description shown in --help
   * @param {Array<{envVar: string, description: string}>} [opts.secrets] - env vars required at runtime
   */
  constructor ({ name, description, secrets = [] }) {
    this.name = name
    this.description = description
    this.secrets = secrets
  }

  /**
   * Build and return the paparam command() instance for this subcommand.
   * Called by main.js as a positional argument to the root command().
   *
   * Subclasses must implement this method.
   * The implementation should:
   *   - call command(this.name, summary(this.description), flag(...), ..., handler)
   *   - append footer(this._secretsFooter()) to show env vars in --help
   *   - call this.run(cmd.flags) inside the async handler
   *
   * @returns {object} paparam command instance
   */
  toCommand () {
    throw new Error(this.name + ': toCommand() must be implemented')
  }

  /**
   * Template method — DO NOT override in subclasses.
   * Validates all declared secrets are present in process.env,
   * then delegates to _run(flags).
   *
   * @param {object} flags - parsed paparam flags object
   */
  async run (flags) {
    validateRequiredEnv(this.secrets.map(s => s.envVar))
    return this._run(flags)
  }

  /**
   * Domain logic for this subcommand.
   * Called after all secrets have been validated.
   * Subclasses must implement this method.
   *
   * @param {object} flags - parsed paparam flags object
   */
  async _run (flags) { // eslint-disable-line no-unused-vars
    throw new Error(this.name + ': _run() must be implemented')
  }

  /**
   * Build the footer text listing required environment variables.
   * Used by toCommand() implementations to append to paparam's footer().
   *
   * @returns {string}
   */
  _secretsFooter () {
    if (this.secrets.length === 0) return ''
    const maxLen = Math.max(...this.secrets.map(s => s.envVar.length))
    const lines = this.secrets.map(s => {
      const pad = ' '.repeat(maxLen - s.envVar.length + 2)
      return '  ' + s.envVar + pad + s.description
    })
    return 'Environment (required):\n' + lines.join('\n')
  }
}

module.exports = { Command }
