import * as core from '@actions/core'
import * as github from '@actions/github'
import fs from "fs"

interface PRFile {
    filename: string;
    status: string;
    patch: string;
}

async function run() {
    // Get current PR
    const pr = github.context.payload.pull_request
    if (!pr) {
        core.setFailed('No pull request found.')
        return
    }

    // Get the differences in the current PR
    const client = github.getOctokit(core.getInput('GITHUB_TOKEN'))

    const prFiles = await client.paginate<PRFile>({
        method: "GET",
        url: `/repos/${github.context.repo.owner}/${github.context.repo.repo}/pulls/${pr.number}/files`,
        per_page: 250
    });

    
}

run()