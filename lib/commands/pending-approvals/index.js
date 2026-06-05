'use strict'

const { command, flag, summary, footer } = require('paparam')
const { Command } = require('../../command')
const { validatePrNumber, validateRepo, sanitizeError, exitWithError } = require('../../helpers')
const {
  buildOctokit,
  buildAppOctokit,
  fetchReviews,
  buildApprovalCounts,
  checkApproved,
  getPendingMessage,
  buildApprovalComment,
  upsertPrComment
} = require('./helpers')

// Lazy-loaded so tests can mock them without the packages being installed.
// At runtime these are the real @actions/github and @octokit/auth-app modules.
function getGithub () { return require('@actions/github') }
function getCreateAppAuth () { return require('@octokit/auth-app').createAppAuth }

class PendingApprovals extends Command {
  constructor () {
    super({
      name: 'pending-approvals',
      description: 'Check PR approval status and post a review-status comment',
      secrets: [
        { envVar: 'GITHUB_TOKEN', description: 'GitHub token for comment posting' },
        { envVar: 'GITHUB_APP_ID', description: 'App ID for team membership resolution' },
        { envVar: 'GITHUB_PRIVATE_KEY', description: 'App private key for team membership resolution' }
      ]
    })
  }

  toCommand () {
    const cmd = command(
      'pending-approvals',
      summary(this.description),
      flag('--pr-number <number>', 'PR number to check (required)'),
      flag('--repo [owner/repo]', 'owner/repo — falls back to $GITHUB_REPOSITORY'),
      flag('--maintainers-team <slug>', 'GitHub team slug for maintainers/management (required)'),
      flag('--team-leads-team <slug>', 'GitHub team slug for team leads (required)'),
      flag('--min-approvals <n>', 'Minimum total approvals required (default: 2)'),
      footer(this._secretsFooter()),
      async () => {
        try {
          await this.run(cmd.flags)
        } catch (err) {
          exitWithError(sanitizeError(err))
        }
      }
    )
    return cmd
  }

  // Override _run(), NOT run() — base class validates secrets before calling here.
  async _run (flags) {
    // Validate and parse inputs — CodeQL taint-flow guards
    const prNumber = validatePrNumber(flags['pr-number'] || flags.prNumber)
    const { owner, repo } = validateRepo(
      flags.repo || process.env.GITHUB_REPOSITORY
    )

    if (!flags['maintainers-team'] && !flags.maintainersTeam) {
      throw new Error('--maintainers-team is required')
    }
    if (!flags['team-leads-team'] && !flags.teamLeadsTeam) {
      throw new Error('--team-leads-team is required')
    }

    const maintainersTeam = flags['maintainers-team'] || flags.maintainersTeam
    const teamLeadsTeam = flags['team-leads-team'] || flags.teamLeadsTeam
    const minApprovals = parseInt(flags['min-approvals'] || flags.minApprovals || '2', 10)

    const teams = {
      maintainer: maintainersTeam,
      teamLead: teamLeadsTeam
    }

    // Build Octokit clients — secrets stay inside these functions
    const github = getGithub()
    const createAppAuth = getCreateAppAuth()
    const commentOctokit = buildOctokit(github)
    const appOctokit = await buildAppOctokit(github, createAppAuth, owner, repo)

    // Fetch and evaluate approvals
    const reviews = await fetchReviews(commentOctokit, owner, repo, prNumber)
    const counts = await buildApprovalCounts(appOctokit, owner, repo, reviews, teams)

    const approved = checkApproved(counts, minApprovals)
    const pendingMessage = approved ? '' : getPendingMessage(counts, minApprovals)
    const commentBody = buildApprovalComment(approved, counts, pendingMessage)

    await upsertPrComment(commentOctokit, owner, repo, prNumber, commentBody)

    if (!approved) {
      process.stderr.write('PR #' + prNumber + ' is pending approval: ' + pendingMessage + '\n')
      process.exit(1)
    }
  }
}

module.exports = new PendingApprovals()
