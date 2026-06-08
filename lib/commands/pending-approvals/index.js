'use strict'

const { command, flag, summary, footer } = require('paparam')
const { Command } = require('../../command')
const { validatePrNumber, validateRepo, validateTeamSlug, sanitizeError, exitWithError } = require('../../helpers')
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

// Lazy-loaded so tests can inject mocks before the live modules are needed.
// @actions/github is CJS; @octokit/auth-app >=5 is ESM-only and must be
// loaded via dynamic import() inside an async function.
function getGithub () { return require('@actions/github') }
async function getCreateAppAuth () {
  const { createAppAuth } = await import('@octokit/auth-app')
  return createAppAuth
}

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

  async _run (flags) {
    const prNumber = validatePrNumber(flags['pr-number'] || flags.prNumber)
    const { owner, repo } = validateRepo(
      flags.repo || process.env.GITHUB_REPOSITORY
    )

    const maintainersTeam = validateTeamSlug(
      flags['maintainers-team'] || flags.maintainersTeam, '--maintainers-team'
    )
    const teamLeadsTeam = validateTeamSlug(
      flags['team-leads-team'] || flags.teamLeadsTeam, '--team-leads-team'
    )
    const minApprovals = parseInt(flags['min-approvals'] || flags.minApprovals || '2', 10)
    if (isNaN(minApprovals) || minApprovals < 1) {
      throw new RangeError('--min-approvals must be a positive integer, got: ' + String(flags['min-approvals'] || flags.minApprovals))
    }

    const teams = {
      maintainer: maintainersTeam,
      teamLead: teamLeadsTeam
    }

    const github = getGithub()
    const createAppAuth = await getCreateAppAuth()
    const commentOctokit = buildOctokit(github)
    const appOctokit = await buildAppOctokit(github, createAppAuth, owner, repo)

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
