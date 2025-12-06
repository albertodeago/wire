import { describe, expect, it, vi } from "vitest";
import { run } from "../src/action";
import type { GitClient } from "../src/git-client";
import type { VersionBumper } from "../src/version-bumper";
import type { VersionsRepository } from "../src/versions-repository";
import { createMockLogger } from "./fixures";

describe("action - run", () => {
	const createMockGitClient = (): GitClient => ({
		configure: vi.fn().mockResolvedValue(null),
		commit: vi.fn().mockResolvedValue(null),
		push: vi.fn().mockResolvedValue(null),
		createAndPushTags: vi.fn().mockResolvedValue(null),
	});

	const createMockVersionsRepository = (
		versions: Record<string, string>,
	): VersionsRepository & {
		writtenData: { path: string; data: unknown }[];
	} => {
		const writtenData: { path: string; data: unknown }[] = [];
		return {
			read: vi.fn().mockReturnValue(versions),
			write: vi.fn((path, data) => {
				writtenData.push({ path, data });
				return null;
			}),
			writtenData,
		};
	};

	const createMockVersionBumper = (): VersionBumper => ({
		bump: vi.fn(({ workflows, versions, bumpType, tagPattern }) => {
			return workflows.map((workflow: string) => {
				const currentVersion = versions[workflow];
				const [major, minor, patch] = currentVersion.split(".").map(Number);
				let newVersion: string;
				if (bumpType === "major") {
					newVersion = `${major + 1}.0.0`;
				} else if (bumpType === "minor") {
					newVersion = `${major}.${minor + 1}.0`;
				} else {
					newVersion = `${major}.${minor}.${patch + 1}`;
				}
				const tag = tagPattern
					.replace("{name}", workflow)
					.replace("{version}", newVersion);
				const majorTag = tagPattern
					.replace("{name}", workflow)
					.replace("{version}", String(major + (bumpType === "major" ? 1 : 0)));
				return {
					workflow,
					previousVersion: currentVersion,
					newVersion,
					tag,
					majorTag,
				};
			});
		}),
	});

	const defaultInputs = {
		workflows: "all",
		bumpType: "patch",
		versionsFile: "workflow-versions.json",
		tagPattern: "{name}/v{version}",
		githubToken: "fake-token",
		gitUserName: "bot",
		gitUserEmail: "bot@example.com",
		commitMessagePattern: "chore({workflows}): release",
	};

	it("should release all workflows when 'all' is specified, update versions file, and return correct outputs", async () => {
		const versionsRepository = createMockVersionsRepository({
			"workflow-a": "1.0.0",
			"workflow-b": "2.1.0",
		});
		const versionBumper = createMockVersionBumper();
		const gitClient = createMockGitClient();
		const logger = createMockLogger();

		const outputs = await run(
			{ ...defaultInputs, workflows: "all" },
			{ versionsRepository, versionBumper, gitClient, logger },
		);

		if (outputs instanceof Error) {
			expect(outputs).not.toBeInstanceOf(Error);
			throw outputs;
		}

		expect(outputs.released).toEqual({
			"workflow-a": "1.0.1",
			"workflow-b": "2.1.1",
		});
		expect(outputs.tags).toEqual([
			"workflow-a/v1.0.1",
			"workflow-a/v1",
			"workflow-b/v2.1.1",
			"workflow-b/v2",
		]);

		// Check that versions file was written with updated versions
		expect(versionsRepository.writtenData).toHaveLength(1);
		expect(versionsRepository.writtenData[0]).toEqual({
			path: "workflow-versions.json",
			data: {
				"workflow-a": "1.0.1",
				"workflow-b": "2.1.1",
			},
		});

		// Check that git operations were called
		expect(gitClient.configure).toHaveBeenCalledWith("bot", "bot@example.com");
		expect(gitClient.commit).toHaveBeenCalled();
		expect(gitClient.push).toHaveBeenCalledWith("fake-token");
		expect(gitClient.createAndPushTags).toHaveBeenCalled();
	});

	it("should release only the provided workflows, update versions file, and return correct outputs", async () => {
		const versionsRepository = createMockVersionsRepository({
			"workflow-a": "1.0.0",
			"workflow-b": "2.1.0",
			"workflow-c": "3.0.0",
		});
		const versionBumper = createMockVersionBumper();
		const gitClient = createMockGitClient();
		const logger = createMockLogger();

		const outputs = await run(
			{
				...defaultInputs,
				workflows: "workflow-a, workflow-b",
				bumpType: "minor",
			},
			{ versionsRepository, versionBumper, gitClient, logger },
		);

		if (outputs instanceof Error) {
			expect(outputs).not.toBeInstanceOf(Error);
			throw outputs;
		}

		expect(outputs.released).toEqual({
			"workflow-a": "1.1.0",
			"workflow-b": "2.2.0",
		});
		expect(outputs.tags).toEqual([
			"workflow-a/v1.1.0",
			"workflow-a/v1",
			"workflow-b/v2.2.0",
			"workflow-b/v2",
		]);

		// Check that versions file was written with updated versions
		expect(versionsRepository.writtenData).toHaveLength(1);
		expect(versionsRepository.writtenData[0]).toEqual({
			path: "workflow-versions.json",
			data: {
				"workflow-a": "1.1.0",
				"workflow-b": "2.2.0",
				"workflow-c": "3.0.0",
			},
		});

		// Check that git operations were called
		expect(gitClient.configure).toHaveBeenCalledWith("bot", "bot@example.com");
		expect(gitClient.commit).toHaveBeenCalled();
		expect(gitClient.push).toHaveBeenCalledWith("fake-token");
		expect(gitClient.createAndPushTags).toHaveBeenCalled();
	});

	it("should set the errors as output if bump-type is invalid", async () => {
		const versionsRepository = createMockVersionsRepository({
			"workflow-a": "1.0.0",
		});
		const versionBumper = createMockVersionBumper();
		const gitClient = createMockGitClient();
		const logger = createMockLogger();

		const outputs = await run(
			{ ...defaultInputs, bumpType: "invalid-type" },
			{ versionsRepository, versionBumper, gitClient, logger },
		);

		expect(outputs).toBeInstanceOf(Error);
		if (outputs instanceof Error) {
			expect(outputs.message).toContain("Invalid bump type");
		}
	});

	it("should set the errors as output if no workflows are provided", async () => {
		const versionsRepository = createMockVersionsRepository({
			"workflow-a": "1.0.0",
		});
		const versionBumper = createMockVersionBumper();
		const gitClient = createMockGitClient();
		const logger = createMockLogger();

		const outputs = await run(
			{ ...defaultInputs, workflows: "" },
			{ versionsRepository, versionBumper, gitClient, logger },
		);

		expect(outputs).toBeInstanceOf(Error);
		if (outputs instanceof Error) {
			expect(outputs.message).toContain(
				"Invalid workflows requested. Input workflows: . Available workflows: workflow-a",
			);
		}
	});

	it("should set the errors as output if not found workflows are provided", async () => {
		const versionsRepository = createMockVersionsRepository({
			"workflow-a": "1.0.0",
		});
		const versionBumper = createMockVersionBumper();
		const gitClient = createMockGitClient();
		const logger = createMockLogger();

		const outputs = await run(
			{ ...defaultInputs, workflows: "wat" },
			{ versionsRepository, versionBumper, gitClient, logger },
		);

		expect(outputs).toBeInstanceOf(Error);
		if (outputs instanceof Error) {
			expect(outputs.message).toContain(
				"Invalid workflows requested. Input workflows: wat. Available workflows: workflow-a",
			);
		}
	});

	it("should set the errors as output if an invalid tag-pattern is provided", async () => {
		const versionsRepository = createMockVersionsRepository({
			"workflow-a": "1.0.0",
		});
		const versionBumper = createMockVersionBumper();
		const gitClient = createMockGitClient();
		const logger = createMockLogger();

		const outputs = await run(
			{ ...defaultInputs, tagPattern: "invalid-pattern" },
			{ versionsRepository, versionBumper, gitClient, logger },
		);

		expect(outputs).toBeInstanceOf(Error);
		if (outputs instanceof Error) {
			expect(outputs.message).toContain(
				"Invalid tag pattern: invalid-pattern. Must include {name} and {version} placeholders.",
			);
		}
	});

	it("should set the errors as output if an invalid commit-message is provided", async () => {
		const versionsRepository = createMockVersionsRepository({
			"workflow-a": "1.0.0",
		});
		const versionBumper = createMockVersionBumper();
		const gitClient = createMockGitClient();
		const logger = createMockLogger();

		const outputs = await run(
			{ ...defaultInputs, commitMessagePattern: "invalid-message" },
			{ versionsRepository, versionBumper, gitClient, logger },
		);

		expect(outputs).toBeInstanceOf(Error);
		if (outputs instanceof Error) {
			expect(outputs.message).toContain(
				"Invalid commit message pattern: invalid-message. Must include {workflows} placeholder.",
			);
		}
	});

	it("should set the errors as output if the workflow-versions file is empty", async () => {
		const versionsRepository = createMockVersionsRepository({});
		const versionBumper = createMockVersionBumper();
		const gitClient = createMockGitClient();
		const logger = createMockLogger();

		const outputs = await run(
			{ ...defaultInputs },
			{ versionsRepository, versionBumper, gitClient, logger },
		);

		expect(outputs).toBeInstanceOf(Error);
		if (outputs instanceof Error) {
			expect(outputs.message).toContain(
				"No workflows found in workflow-versions.json",
			);
		}
	});

	it("should set the errors as output if the workflow-versions file is invalid", async () => {
		const versionsRepository = createMockVersionsRepository(
			// @ts-expect-error Testing invalid return type
			new Error("You wot mate?"),
		);
		const versionBumper = createMockVersionBumper();
		const gitClient = createMockGitClient();
		const logger = createMockLogger();

		const outputs = await run(
			{ ...defaultInputs },
			{ versionsRepository, versionBumper, gitClient, logger },
		);

		expect(outputs).toBeInstanceOf(Error);
		if (outputs instanceof Error) {
			expect(outputs.message).toContain("You wot mate?");
		}
	});

	it("should set the errors as output if the version bump fails", async () => {
		const mockFailingVersionBumper: VersionBumper = {
			bump: vi.fn(() => {
				return new Error("Bump failed!");
			}),
		};
		const versionsRepository = createMockVersionsRepository({
			"workflow-a": "1.0.0",
		});
		const gitClient = createMockGitClient();
		const logger = createMockLogger();

		const outputs = await run(
			{ ...defaultInputs },
			{
				versionsRepository,
				versionBumper: mockFailingVersionBumper,
				gitClient,
				logger,
			},
		);

		expect(outputs).toBeInstanceOf(Error);
		if (outputs instanceof Error) {
			expect(outputs.message).toContain("Bump failed!");
		}
	});

	it("should set the errors as output if a Git operation fails", async () => {
		// @ts-expect-error Testing partial implementation
		const mockFailingGitClient: GitClient = {
			configure: vi.fn().mockResolvedValue(new Error("Git config failed!")),
		};
		const versionsRepository = createMockVersionsRepository({
			"workflow-a": "1.0.0",
		});
		const logger = createMockLogger();

		const outputs = await run(
			{ ...defaultInputs },
			{
				versionsRepository,
				versionBumper: createMockVersionBumper(),
				gitClient: mockFailingGitClient,
				logger,
			},
		);

		expect(outputs).toBeInstanceOf(Error);
		if (outputs instanceof Error) {
			expect(outputs.message).toContain("Git config failed!");
		}
	});
});
