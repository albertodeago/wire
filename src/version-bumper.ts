import * as core from "@actions/core";
import * as SemVer from "semver";
import type { Logger } from "./logger";
import type { WorkflowVersions } from "./versions-repository";

export type VersionBumper = {
	bump: (params: {
		versions: WorkflowVersions;
		workflows: string[];
		bumpType: BumpType;
		tagPattern: string;
	}) => ReleaseResult[] | WorkflowVersionNotFound | VersionBumpError;
};

export type ReleaseResult = {
	workflow: string;
	previousVersion: string;
	newVersion: string;
	tag: string;
	majorTag: string;
};

export type BumpType = "patch" | "minor" | "major";

type Deps = {
	logger?: Logger;
	semver?: typeof SemVer;
};

export const getVersionBumper = ({
	logger = core,
	semver = SemVer,
}: Deps = {}): VersionBumper => {
	return {
		bump: ({ versions, workflows, bumpType, tagPattern }) => {
			const releases: ReleaseResult[] = [];
			const updatedVersions = { ...versions }; // This will be the source of truth for updated versions

			for (const workflow of workflows) {
				logger.debug(`Preparing to bump version for workflow: ${workflow}`);
				const currentVersion = versions[workflow];
				if (!currentVersion) {
					logger.error(`Workflow version not found for: ${workflow}`);
					return new WorkflowVersionNotFound(
						`Workflow "${workflow}" not found in versions file`,
					);
				}

				const newVersion = semver.inc(currentVersion, bumpType);
				if (!newVersion) {
					logger.error(
						`Failed to bump version ${currentVersion} with type ${bumpType} for workflow ${workflow}`,
					);
					return new VersionBumpError(
						`Failed to bump version ${currentVersion} with type ${bumpType} for workflow ${workflow}`,
					);
				}

				const majorVersion = newVersion.split(".")[0];
				const tag = tagPattern
					.replace("{name}", workflow)
					.replace("{version}", newVersion);
				logger.debug(`Generated tagName for workflow ${workflow}: ${tag}`);

				// Derive majorTag from tagPattern by replacing {version} with just the major version
				const majorTag = tagPattern
					.replace("{name}", workflow)
					.replace("{version}", majorVersion ?? "0");
				logger.debug(
					`Generated majorTagName for workflow ${workflow}: ${majorTag}`,
				);

				updatedVersions[workflow] = newVersion;

				releases.push({
					workflow,
					previousVersion: currentVersion,
					newVersion,
					tag,
					majorTag,
				});

				logger.info(
					`Prepared to bump ${workflow}: ${currentVersion} → ${newVersion}`,
				);
			}

			return releases;
		},
	};
};

export class WorkflowVersionNotFound extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "WorkflowVersionNotFound";
	}
}
export class VersionBumpError extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "VersionBumpError";
	}
}
