import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import type { GitClient } from "./git-client";
import type { Logger } from "./logger";
import {
	type BumpType,
	VersionBumpError,
	type VersionBumper,
} from "./version-bumper";
import type {
	VersionsRepository,
	WorkflowVersions,
} from "./versions-repository";

// ============================================================================
// Types
// ============================================================================

export interface ActionInputs {
	workflows: string[];
	bumpType: BumpType;
	versionsFile: string;
	tagPattern: string;
	majorTagPattern: string;
	token: string;
	gitUserName: string;
	gitUserEmail: string;
	commitMessagePattern: string;
}

export interface ActionOutputs {
	released: WorkflowVersions;
	tags: string[];
}

// ============================================================================
// Input Parsing & Validation
// ============================================================================

export function getInputs(availableComponents: string[]): ActionInputs {
	const componentsInput = core.getInput("components", { required: true });
	const bumpType = core.getInput("bump", { required: true });

	if (!["patch", "minor", "major"].includes(bumpType)) {
		throw new Error(
			`Invalid bump type: ${bumpType}. Must be patch, minor, or major.`,
		);
	}

	const components = parseComponentsInput(componentsInput, availableComponents);
	validateComponents(components, availableComponents);

	return {
		components,
		bumpType: bumpType as BumpType,
		versionsFile: core.getInput("versions-file") || "versions.json",
		tagPattern: core.getInput("tag-pattern") || "{name}/v{version}",
		majorTagPattern: core.getInput("major-tag-pattern") ?? "{name}/v{major}",
		token: core.getInput("github-token", { required: true }),
		gitUserName: core.getInput("git-user-name") || "github-actions[bot]",
		gitUserEmail:
			core.getInput("git-user-email") ||
			"github-actions[bot]@users.noreply.github.com",
		commitMessagePattern:
			core.getInput("commit-message-pattern") ||
			"chore({components}): release new versions",
	};
}

export function parseComponentsInput(
	input: string,
	available: string[],
): string[] {
	const trimmed = input.trim().toLowerCase();

	if (trimmed === "all") {
		core.info(`Releasing all components: ${available.join(", ")}`);
		return [...available];
	}

	const components = input
		.split(",")
		.map((c) => c.trim())
		.filter((c) => c.length > 0);

	const unique = [...new Set(components)];

	if (unique.length === 0) {
		throw new Error("No components specified");
	}

	return unique;
}

export function validateComponents(
	toRelease: string[],
	available: string[],
): void {
	const invalid = toRelease.filter((c) => !available.includes(c));

	if (invalid.length > 0) {
		throw new Error(
			`Unknown component(s): ${invalid.join(", ")}. Available: ${available.join(", ")}`,
		);
	}
}

// ============================================================================
// Main Execution
// ============================================================================

function validateBumpType(bumpType: string): bumpType is BumpType {
	return ["patch", "minor", "major"].includes(bumpType);
}

function validateTagPattern(tagPattern: string): boolean {
	return tagPattern.includes("{name}") && tagPattern.includes("{version}");
}

function validateCommitMessagePattern(pattern: string): boolean {
	return pattern.includes("{components}");
}

class NoAvailableWorkflowsFound extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "NoAvailableWorkflowsFound";
	}
}
class InvalidBumpType extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "InvalidBumpType";
	}
}
class InvalidTagPattern extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "InvalidTagPattern";
	}
}
class InvalidCommitMessagePattern extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "InvalidCommitMessagePattern";
	}
}

type Inputs = {
	workflows: string;
	bumpType: string;
	versionsFile: string;
	tagPattern: string;
	githubToken: string;
	gitUserName: string;
	gitUserEmail: string;
	commitMessagePattern: string;
};

type Dependencies = {
	versionsRepository: VersionsRepository;
	versionBumper: VersionBumper;
	gitClient: GitClient;
	logger: Logger;
};

export async function run(
	inputs: Inputs,
	deps: Dependencies,
): Promise<ActionOutputs | Error> {
	const { versionsRepository, versionBumper, gitClient, logger } = deps;
	/* Validate all inputs */

	if (!validateBumpType(inputs.bumpType)) {
		logger.error(`Invalid bump type provided: ${inputs.bumpType}`);
		return new InvalidBumpType(
			`Invalid bump type: ${inputs.bumpType}. Must be one of "patch", "minor", or "major".`,
		);
	}

	if (!validateTagPattern(inputs.tagPattern)) {
		logger.error(`Invalid tag pattern provided: ${inputs.tagPattern}`);
		return new InvalidTagPattern(
			`Invalid tag pattern: ${inputs.tagPattern}. Must include {name} and {version} placeholders.`,
		);
	}

	if (!validateCommitMessagePattern(inputs.commitMessagePattern)) {
		logger.error(
			`Invalid commit message pattern provided: ${inputs.commitMessagePattern}`,
		);
		return new InvalidCommitMessagePattern(
			`Invalid commit message pattern: ${inputs.commitMessagePattern}. Must include {components} placeholder.`,
		);
	}

	// Get the list of workflows with their current versions
	const versions = versionsRepository.read(inputs.versionsFile);
	if (versions instanceof Error) {
		return versions;
	}

	const availableWorkflows = Object.keys(versions);
	if (availableWorkflows.length === 0) {
		logger.error(`No workflows found in versions file: ${inputs.versionsFile}`);
		return new NoAvailableWorkflowsFound(
			`No workflows found in ${inputs.versionsFile}`,
		);
	}

	logger.debug(`Available workflows: ${availableWorkflows.join(", ")}`);

	// Prepare the list of workflows to release and related Tags
	const releases = versionBumper.bump({
		bumpType: inputs.bumpType,
		tagPattern: inputs.tagPattern,
		workflows: availableWorkflows,
		versions,
	});
	if (releases instanceof Error) {
		return releases;
	}

	// Update versions file with the new ones
	versionsRepository.write(inputs.versionsFile, versions);

	// Git operations
	const configureResult = await gitClient.configure(
		inputs.gitUserName,
		inputs.gitUserEmail,
	);
	if (configureResult instanceof Error) {
		return configureResult;
	}
	const commitResult = await gitClient.commit(
		inputs.versionsFile,
		releases,
		inputs.commitMessagePattern,
	);
	if (commitResult instanceof Error) {
		return commitResult;
	}
	const pushResult = await gitClient.push(inputs.githubToken);
	if (pushResult instanceof Error) {
		return pushResult;
	}
	const tagResult = await gitClient.createAndPushTags(
		inputs.githubToken,
		releases,
	);
	if (tagResult instanceof Error) {
		return tagResult;
	}

	// Build outputs
	// const released: ComponentVersions = {};
	// const tags: string[] = [];

	// for (const release of releases) {
	// 	released[release.component] = release.newVersion;
	// 	tags.push(release.tag);
	// 	if (release.majorTag) {
	// 		tags.push(release.majorTag);
	// 	}
	// }

	// core.info(`\n✅ Successfully released ${releases.length} component(s)`);
	const released = {};
	const tags: string[] = [];

	return { released, tags };
}
