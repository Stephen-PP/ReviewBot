import * as core from '@actions/core'
import * as github from '@actions/github'

async function run() {
    // Get current PR
    const pr = github.context.payload.pull_request
    if (!pr) {
        core.setFailed('No pull request found.')
        return
    }

    console.log(core.getInput("github-token").length)

    // Get the differences in the current PR
    const client = github.getOctokit(core.getInput('github-token'))
    const diff = await client.rest.pulls.listFiles({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: pr.number
    })

    core.info(JSON.stringify(diff))
}

run()