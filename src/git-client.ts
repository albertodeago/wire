import * as core from "@actions/core";
import * as ActionExec from "@actions/exec";
import type { Logger } from "./logger";
import type { ReleaseResult } from "./version-bumper";

export type GitClient = {
	configure: (
		userName: string,
		userEmail: string,
	) => Promise<null | ErrorConfiguringGit>;
	commit: (
		versionsFile: string,
		releases: ReleaseResult[],
		commitMessagePattern: string,
	) => Promise<null | ErrorCommittingChanges>;
	push: (token: string) => Promise<null | ErrorPushingChanges>;
	createAndPushTags: (
		token: string,
		releases: ReleaseResult[],
	) => Promise<null | ErrorCreatingPushingTags>;
};

type Deps = {
	exec?: typeof ActionExec;
	logger?: Logger;
	which: {
		owner: string;
		repo: string;
	};
};

export const getGitClient = ({
	exec = ActionExec,
	logger = core,
	which,
}: Deps): GitClient => {
	return {
		configure: async (userName: string, userEmail: string) => {
			logger.debug(
				`Configuring git with user.name=${userName} and user.email=${userEmail}`,
			);
			const exitStatusName = await exec.exec("git", [
				"config",
				"user.name",
				userName,
			]);
			if (exitStatusName !== 0) {
				logger.error(
					`Failed to configure git user.name with exit code ${exitStatusName}`,
				);
				return new ErrorConfiguringGit(
					`Failed to configure git user.name with exit code ${exitStatusName}`,
				);
			}
			const exitStatusEmail = await exec.exec("git", [
				"config",
				"user.email",
				userEmail,
			]);
			if (exitStatusEmail !== 0) {
				logger.error(
					`Failed to configure git user.email with exit code ${exitStatusEmail}`,
				);
				return new ErrorConfiguringGit(
					`Failed to configure git user.email with exit code ${exitStatusEmail}`,
				);
			}

			logger.debug(
				`Git configured with user.name=${userName} and user.email=${userEmail}`,
			);
			return null;
		},
		commit: async (
			versionsFile: string,
			releases: ReleaseResult[],
			commitMessagePattern: string,
		) => {
			const componentNames = releases.map((r) => r.workflow).join(",");
			const commitMessage = commitMessagePattern.replace(
				"{components}",
				componentNames,
			);

			const fullMessage = getCommitMessage(commitMessage, releases);
			logger.debug(
				`Staging and committing changes with message: ${fullMessage}`,
			);

			const exitStatusAdd = await exec.exec("git", ["add", versionsFile]);
			if (exitStatusAdd !== 0) {
				logger.error(
					`Failed to stage versions file with exit code ${exitStatusAdd}`,
				);
				return new ErrorCommittingChanges(
					`Failed to stage versions file with exit code ${exitStatusAdd}`,
				);
			}
			const exitStatusCommit = await exec.exec("git", [
				"commit",
				"-m",
				fullMessage,
			]);
			if (exitStatusCommit !== 0) {
				logger.error(
					`Failed to commit changes with exit code ${exitStatusCommit}`,
				);
				return new ErrorCommittingChanges(
					`Failed to commit changes with exit code ${exitStatusCommit}`,
				);
			}

			logger.debug(`Changes committed successfully`);
			return null;
		},
		push: async (token: string) => {
			const remoteUrl = `https://x-access-token:${token}@github.com/${which.owner}/${which.repo}.git`;
			logger.debug(`Pushing changes to remote: ${remoteUrl}`);
			const exitStatusPush = await exec.exec("git", [
				"push",
				remoteUrl,
				"HEAD",
			]);
			if (exitStatusPush !== 0) {
				logger.error(`Failed to push changes with exit code ${exitStatusPush}`);
				return new ErrorPushingChanges(
					`Failed to push changes with exit code ${exitStatusPush}`,
				);
			}

			return null;
		},
		createAndPushTags: async (token: string, releases: ReleaseResult[]) => {
			const remoteUrl = `https://x-access-token:${token}@github.com/${which.owner}/${which.repo}.git`;
			logger.debug(`Creating and pushing tags to remote: ${remoteUrl}`);

			for (const release of releases) {
				logger.debug(`Creating and pushing tag: ${release.tag}`);

				// Create exact version tag
				const exitStatusTag = await exec.exec("git", ["tag", release.tag]);
				if (exitStatusTag !== 0) {
					logger.error(
						`Failed to create tag ${release.tag} with exit code ${exitStatusTag}`,
					);
					return new ErrorCreatingPushingTags(
						`Failed to create tag ${release.tag} with exit code ${exitStatusTag}`,
					);
				}

				const exitStatusPushTag = await exec.exec("git", [
					"push",
					remoteUrl,
					release.tag,
				]);
				if (exitStatusPushTag !== 0) {
					logger.error(
						`Failed to push tag ${release.tag} with exit code ${exitStatusPushTag}`,
					);
					return new ErrorCreatingPushingTags(
						`Failed to push tag ${release.tag} with exit code ${exitStatusPushTag}`,
					);
				}
				logger.debug(`Tag ${release.tag} created and pushed successfully`);

				logger.debug(`Creating/updating major tag: ${release.majorTag}`);
				const exitStatusTagMajor = await exec.exec("git", [
					"tag",
					"-f",
					release.majorTag,
				]);
				if (exitStatusTagMajor !== 0) {
					logger.error(
						`Failed to create major tag ${release.majorTag} with exit code ${exitStatusTagMajor}`,
					);
					return new ErrorCreatingPushingTags(
						`Failed to create major tag ${release.majorTag} with exit code ${exitStatusTagMajor}`,
					);
				}
				const exitStatusPushTagMajor = await exec.exec("git", [
					"push",
					remoteUrl,
					"-f",
					release.majorTag,
				]);
				if (exitStatusPushTagMajor !== 0) {
					logger.error(
						`Failed to push major tag ${release.majorTag} with exit code ${exitStatusPushTagMajor}`,
					);
					return new ErrorCreatingPushingTags(
						`Failed to push major tag ${release.majorTag} with exit code ${exitStatusPushTagMajor}`,
					);
				}
				logger.debug(
					`Major tag ${release.majorTag} created and pushed successfully`,
				);
			}

			return null;
		},
	};
};

function getCommitMessage(commitMessage: string, releases: ReleaseResult[]) {
	return `${commitMessage}

Released versions:
${releases.map((r) => `- ${r.workflow}: ${r.previousVersion} → ${r.newVersion}`).join("\n")}`;
}

export class ErrorConfiguringGit extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "ErrorConfiguringGit";
	}
}
export class ErrorCommittingChanges extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "ErrorCommittingChanges";
	}
}
export class ErrorPushingChanges extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "ErrorPushingChanges";
	}
}
export class ErrorCreatingPushingTags extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "ErrorCreatingPushingTags";
	}
}
