'use strict'

// Generic, domain-agnostic utilities.
// No GitHub, no CI-domain logic.
// Any subcommand or future JS action can use these.

// Patterns for secrets that must never appear in output.
// Matches GitHub PATs (ghp_), app tokens (ghs_), and PEM private key blocks.
const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9_]{36,}/g,
  /ghs_[A-Za-z0-9_]{36,}/g,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g
]

/**
 * Replace known secret patterns in a string with [REDACTED].
 * Used on all strings before they are written to stdout/stderr.
 *
 * @param {string} str
 * @returns {string}
 */
function redact (str) {
  if (typeof str !== 'string') return str
  let result = str
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

/**
 * Return a safe, redacted error message string.
 * Never returns err.stack — stack traces can contain interpolated secrets.
 *
 * @param {Error|unknown} err
 * @returns {string}
 */
function sanitizeError (err) {
  if (err && typeof err.message === 'string') {
    return redact(err.message)
  }
  return redact(String(err))
}

/**
 * Write a message to stderr and exit with the given code.
 *
 * @param {string} message
 * @param {number} [code=1]
 */
function exitWithError (message, code) {
  process.stderr.write(redact(message) + '\n')
  process.exit(code === undefined ? 1 : code)
}

/**
 * Validate that a list of environment variable names are all set.
 * Throws with a formatted message listing the missing names only — never the values.
 *
 * Called automatically by Command.run() before dispatching to _run().
 * Do not call this manually in subcommands.
 *
 * @param {string[]} vars - env var names to check
 * @throws {Error} if any are missing
 */
function validateRequiredEnv (vars) {
  const missing = vars.filter(v => !process.env[v])
  if (missing.length > 0) {
    throw new Error(
      'Missing required environment variable' + (missing.length > 1 ? 's' : '') +
      ': ' + missing.join(', ')
    )
  }
}

/**
 * Validate and parse a PR number from a raw input value.
 * CodeQL taint-flow guard: converts the untrusted string to a typed number
 * before it reaches any API call sink.
 *
 * @param {string|number|undefined} raw
 * @returns {number}
 * @throws {RangeError} if the value is missing, not a number, or less than 1
 */
function validatePrNumber (raw) {
  if (raw === undefined || raw === null || raw === '') {
    throw new RangeError('--pr-number is required')
  }
  const n = parseInt(String(raw), 10)
  if (isNaN(n) || n < 1) {
    throw new RangeError('--pr-number must be a positive integer, got: ' + String(raw))
  }
  return n
}

/**
 * Validate an owner/repo string.
 * CodeQL taint-flow guard: ensures the string matches the expected format
 * before it is split and used in API calls.
 *
 * @param {string|undefined} raw - expected format: "owner/repo"
 * @returns {{ owner: string, repo: string }}
 * @throws {Error} if the value is missing or does not match the expected format
 */
function validateRepo (raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error(
      '--repo is required (or set $GITHUB_REPOSITORY). ' +
      'Expected format: owner/repo'
    )
  }
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(raw)) {
    throw new Error(
      'Invalid repo format: ' + JSON.stringify(raw) + '. Expected: owner/repo'
    )
  }
  const [owner, repo] = raw.split('/')
  return { owner, repo }
}

module.exports = {
  redact,
  sanitizeError,
  exitWithError,
  validateRequiredEnv,
  validatePrNumber,
  validateRepo
}
