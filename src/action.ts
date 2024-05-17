import * as core from '@actions/core'
import * as github from '@actions/github'
import { ChatSession, GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
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

    const maxLength = parseInt(core.getInput('MAX_LENGTH')) || 10000;
    const prLength = prFiles.reduce((acc, file) => acc + file.patch.length, 0);
    if(prLength >= maxLength){
        await client.rest.issues.createComment({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: pr.number,
            body: `The total length of changes is greater than the configured ${maxLength} character count. AI review will not be completed for this PR.`
        })
        return
    }

    const files: PRFile[] = prFiles.map((file) => {
        return {
            filename: file.filename,
            status: file.status,
            patch: file.patch
        }
    });

    await runAI(files);
}

async function runAI(files: PRFile[]) {
    const ai = new GoogleGenerativeAI(core.getInput("GEMINI_KEY"));

    const model = ai.getGenerativeModel({
        model: core.getInput("GEMINI_MODEL"),
        systemInstruction: `
        Your job is to review pull requests. You will receive a JSON array containing file name, status of the change, and the git patch of the change. Follow the below instructions:
- You must output your findings in a JSON array. The array will consist of the following objects:
{
"issue": <ISSUE>
"file": <FILE NAME>,
"object_name": <NAME OF FUNCTION OR OBJECT>,
"firstLine": <NUMBER OF THE FIRST LINE OF CODE OF THE ISSUE>,
"lastLine": <NUMBER OF THE LAST LINE OF CODE OF THE ISSUE>
}
- You must review every patch as if it is individual. 
- You will never mention unused code, functions, files, structures, or variables.
- You will never suggest refactoring or making visual changes.
- You will never mention positive changes. 
- You will never make positive comments.
- You will never mention only a files changes, such as a file is added or deleted.
- You will be succinct and direct in your response. The less words the better, but a human reviewer should understand why you flagged an issue as an issue.
- You will never mention code or functions in your issue. Only state the issue and why it is an issue.
- You will respond with an empty JSON object if you found no issues.

Pull Request Information:
Title: "Call moving"
Description: ""

JSON Array:
        `
    });

    const chat = model.startChat({
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: parseInt(core.getInput("MAX_OUTPUT_TOKENS")) || 8192,
        },
        safetySettings: [{
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE
        }]
    });

    let parsedResult;

    for(let i = 0; i < parseInt(core.getInput("MAX_ATTEMPTS")) || 1; i++){
        try{
            const result = await chat.sendMessage(JSON.stringify(files));
            parsedResult = JSON.parse(result.response.text());
        }catch(err){
            // We just catch JSON parse errors (or model errors)
        }
    }

    if(parsedResult == null){
        // Model generation failed to render a valid response
    }

    // Model responded - let's fix up our markdown reply
    
}

run()