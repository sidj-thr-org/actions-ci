'use strict'

// All pending-approvals domain logic.
//
// Secrets (GITHUB_TOKEN, GITHUB_APP_ID, GITHUB_PRIVATE_KEY) are read from
// process.env inside this file — they are never passed as function parameters.
// This prevents secrets from appearing in call stacks or being accidentally
// logged by a caller.

const ROLE_DISPLAY = {
  maintainer: 'Management',
  teamLead: 'Team Lead',
  other: 'Member'
}

const MIN_CODEOWNER_APPROVALS = 1

function buildOctokit (github) {
  const token = process.env.GITHUB_TOKEN
  return github.getOctokit(token)
}

async function buildAppOctokit (github, createAppAuth, owner, repo) {
  const appId = parseInt(process.env.GITHUB_APP_ID, 10)
  const privateKey = process.env.GITHUB_PRIVATE_KEY

  const auth = createAppAuth({ appId, privateKey })

  const { token: jwtToken } = await auth({ type: 'app' })
  const appOctokit = github.getOctokit(jwtToken)

  const { data: installation } = await appOctokit.rest.apps.getRepoInstallation({ owner, repo })
  const { token: installToken } = await auth({ type: 'installation', installationId: installation.id })

  return github.getOctokit(installToken)
}

function getLatestApprovals (reviews) {
  const byUser = Object.create(null)
  for (const review of reviews) {
    const username = review.user && review.user.login
    if (!username) continue
    if (!byUser[username] || review.submitted_at > byUser[username].submitted_at) {
      byUser[username] = review
    }
  }
  return Object.values(byUser)
}

function checkApproved (counts, minTotal) {
  const maintainer = counts.maintainer || 0
  const teamLead = counts.teamLead || 0
  const other = counts.other || 0
  const codeowner = maintainer + teamLead
  const total = codeowner + other
  return codeowner >= MIN_CODEOWNER_APPROVALS && total >= minTotal
}

function getPendingMessage (counts, minTotal) {
  const maintainer = counts.maintainer || 0
  const teamLead = counts.teamLead || 0
  const other = counts.other || 0
  const codeowner = maintainer + teamLead
  const total = codeowner + other

  const missingCodeowner = Math.max(0, MIN_CODEOWNER_APPROVALS - codeowner)
  const missingTotal = Math.max(0, minTotal - total)
  const extraNeeded = Math.max(0, missingTotal - missingCodeowner)

  const parts = []
  if (missingCodeowner > 0) parts.push(missingCodeowner + ' Management or Team Lead')
  if (extraNeeded > 0) parts.push(extraNeeded + ' more from Management, Team Lead, or Member')
  return parts.join(', and ')
}

function buildApprovalComment (approved, counts, pendingMessage) {
  const approvalSummary = Object.entries(counts)
    .map(([role, count]) => (ROLE_DISPLAY[role] || role) + ': ' + count)
    .join(', ')

  const lines = [
    '## Review Status',
    '**Current Status: ' + (approved ? '✅ APPROVED' : '❌ PENDING') + '**',
    'Approvals so far: ' + approvalSummary
  ]

  if (!approved) lines.push('\nPending reviews: Needs ' + pendingMessage + '.')

  return lines.join('\n')
}

async function fetchReviews (octokit, owner, repo, prNumber) {
  const { data } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber
  })
  return data
}

async function buildApprovalCounts (appOctokit, owner, repo, reviews, teams) {
  const latestApprovals = getLatestApprovals(reviews)
  const approvers = latestApprovals
    .filter(r => r.state === 'APPROVED')
    .map(r => r.user.login)

  if (approvers.length === 0) {
    return { maintainer: 0, teamLead: 0, other: 0 }
  }

  const [maintainerMembers, teamLeadMembers] = await Promise.all([
    getTeamMembers(appOctokit, owner, teams.maintainer),
    getTeamMembers(appOctokit, owner, teams.teamLead)
  ])

  const counts = { maintainer: 0, teamLead: 0, other: 0 }
  for (const login of approvers) {
    if (maintainerMembers.has(login)) {
      counts.maintainer++
    } else if (teamLeadMembers.has(login)) {
      counts.teamLead++
    } else {
      counts.other++
    }
  }

  return counts
}

async function getTeamMembers (octokit, org, teamSlug) {
  const members = await octokit.paginate(octokit.rest.teams.listMembersInOrg, {
    org,
    team_slug: teamSlug,
    per_page: 100
  })
  return new Set(members.map(m => m.login))
}

async function upsertPrComment (octokit, owner, repo, prNumber, body) {
  const MARKER = '## Review Status'

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100
  })

  const existing = comments.find(c => c.body && c.body.includes(MARKER))

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body
    })
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body
    })
  }
}

module.exports = {
  buildOctokit,
  buildAppOctokit,
  getLatestApprovals,
  checkApproved,
  getPendingMessage,
  buildApprovalComment,
  fetchReviews,
  buildApprovalCounts,
  getTeamMembers,
  upsertPrComment,
  MIN_CODEOWNER_APPROVALS,
  ROLE_DISPLAY
}
