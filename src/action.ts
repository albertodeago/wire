import type { GitClient } from "./git-client";
import type { Logger } from "./logger";
import type { BumpType, VersionBumper } from "./version-bumper";
import type {
	VersionsRepository,
	WorkflowVersions,
} from "./versions-repository";

function validateBumpType(bumpType: string): bumpType is BumpType {
	return ["patch", "minor", "major"].includes(bumpType);
}

function validateTagPattern(tagPattern: string): boolean {
	return tagPattern.includes("{name}") && tagPattern.includes("{version}");
}

function validateCommitMessagePattern(pattern: string): boolean {
	return pattern.includes("{workflows}");
}

export function validateWorkflows(
	toRelease: string[],
	available: string[],
): boolean {
	const invalid = toRelease.filter((c) => !available.includes(c));
	return invalid.length === 0;
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

class InvalidInputWorkflows extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "InvalidInputWorkflows";
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
export type Outputs = {
	released: WorkflowVersions;
	tags: string[];
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
): Promise<Outputs | Error> {
	const { versionsRepository, versionBumper, gitClient, logger } = deps;

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
			`Invalid commit message pattern: ${inputs.commitMessagePattern}. Must include {workflows} placeholder.`,
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

	// Determine which workflows to release, "all" means all available ones
	let workflowsToRelease: string[];
	if (inputs.workflows.toLowerCase().trim() === "all") {
		workflowsToRelease = availableWorkflows;
		logger.debug("Releasing all workflows");
	} else {
		workflowsToRelease = inputs.workflows.split(",").map((w) => w.trim());
		// Check that all asked workflows are within available ones
		if (!validateWorkflows(workflowsToRelease, availableWorkflows)) {
			const msg = `Invalid workflows requested. Input workflows: ${inputs.workflows}. Available workflows: ${availableWorkflows.join(", ")}`;
			logger.error(msg);
			return new InvalidInputWorkflows(msg);
		}
	}

	logger.debug(`Workflows to release: ${workflowsToRelease.join(", ")}`);

	// Prepare the list of workflows to release and related Tags
	const releases = versionBumper.bump({
		bumpType: inputs.bumpType,
		tagPattern: inputs.tagPattern,
		workflows: workflowsToRelease,
		versions,
	});
	if (releases instanceof Error) {
		return releases;
	}

	// Build updated versions from releases
	const updatedVersions = { ...versions };
	for (const release of releases) {
		updatedVersions[release.workflow] = release.newVersion;
	}

	// Update versions file with the new ones
	versionsRepository.write(inputs.versionsFile, updatedVersions);

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

	logger.debug(
		"All git operations completed successfully, now setting action outputs",
	);

	// Build outputs
	const released: WorkflowVersions = {};
	const tags: string[] = [];

	for (const release of releases) {
		released[release.workflow] = release.newVersion;
		tags.push(release.tag);
		tags.push(release.majorTag);
	}

	return { released, tags };
}
