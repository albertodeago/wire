import * as core from "@actions/core";
import * as github from "@actions/github";
import { run } from "./action";
import { getGitClient } from "./git-client";
import { getVersionBumper } from "./version-bumper";
import { getVersionsRepository } from "./versions-repository";

async function main(): Promise<void> {
	try {
		const workflows = core.getInput("workflows");
		const bumpType = core.getInput("bump-type");
		const versionsFile =
			core.getInput("versions-file") || "workflow-versions.json";
		const tagPattern = core.getInput("tag-pattern");
		const githubToken = core.getInput("github-token");
		const gitUserName = core.getInput("git-user-name");
		const gitUserEmail = core.getInput("git-user-email");
		const commitMessagePattern = core.getInput("commit-message-pattern");

		const versionsRepository = getVersionsRepository();
		const versionBumper = getVersionBumper();
		const gitClient = getGitClient({
			which: github.context.repo,
		});

		const outputs = await run(
			{
				workflows,
				bumpType,
				versionsFile,
				tagPattern,
				githubToken,
				gitUserName,
				gitUserEmail,
				commitMessagePattern,
			},
			{
				versionsRepository,
				versionBumper,
				gitClient,
				logger: core,
			},
		);

		if (outputs instanceof Error) {
			core.setFailed(outputs.message);
			return;
		}

		// Set outputs for downstream steps
		core.setOutput("released", JSON.stringify(outputs.released));
		core.setOutput("tags", JSON.stringify(outputs.tags));

		// Add to job summary
		const releasedList = Object.entries(outputs.released)
			.map(([name, version]) => `- **${name}**: ${version}`)
			.join("\n");

		await core.summary
			.addHeading("🚀 WIRE Release Summary")
			.addRaw(
				`Released ${Object.keys(outputs.released).length} component(s):\n\n`,
			)
			.addRaw(releasedList)
			.addBreak()
			.addRaw(`\n**Tags created:** ${outputs.tags.join(", ")}`)
			.write();

		core.info("[WIRE] completed successfully");
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed("An unexpected error occurred");
		}
	}
}

main();
