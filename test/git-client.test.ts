import { describe, expect, it, vi } from "vitest";
import {
	ErrorCommittingChanges,
	ErrorConfiguringGit,
	ErrorCreatingPushingTags,
	ErrorPushingChanges,
	getGitClient,
} from "../src/git-client";
import type { ReleaseResult } from "../src/version-bumper";
import { createMockLogger } from "./fixures";

describe("GitClient", () => {
	const defaultWhich = { owner: "test-owner", repo: "test-repo" };

	describe("configure", () => {
		it("should configure git user.name and user.email", async () => {
			const execSpy = vi.fn().mockResolvedValue(0);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.configure("Test User", "test@example.com");

			expect(result).toBeNull();
			expect(execSpy).toHaveBeenCalledTimes(2);
			expect(execSpy).toHaveBeenNthCalledWith(1, "git", [
				"config",
				"user.name",
				"Test User",
			]);
			expect(execSpy).toHaveBeenNthCalledWith(2, "git", [
				"config",
				"user.email",
				"test@example.com",
			]);
		});

		it("should return ErrorConfiguringGit when user.name config fails", async () => {
			const execSpy = vi.fn().mockResolvedValueOnce(1);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.configure("Test User", "test@example.com");

			expect(result).toBeInstanceOf(ErrorConfiguringGit);
			expect((result as Error).message).toContain("user.name");
		});

		it("should return ErrorConfiguringGit when user.email config fails", async () => {
			const execSpy = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.configure("Test User", "test@example.com");

			expect(result).toBeInstanceOf(ErrorConfiguringGit);
			expect((result as Error).message).toContain("user.email");
		});
	});

	describe("commit", () => {
		const releases: ReleaseResult[] = [
			{
				workflow: "workflow-a",
				previousVersion: "1.0.0",
				newVersion: "1.0.1",
				tag: "workflow-a/v1.0.1",
				majorTag: "workflow-a/v1",
			},
		];

		it("should stage file and commit with correct message", async () => {
			const execSpy = vi.fn().mockResolvedValue(0);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.commit(
				"workflow-versions.json",
				releases,
				"chore({components}): release",
			);

			expect(result).toBeNull();
			expect(execSpy).toHaveBeenCalledTimes(2);
			expect(execSpy).toHaveBeenNthCalledWith(1, "git", [
				"add",
				"workflow-versions.json",
			]);
			expect(execSpy).toHaveBeenNthCalledWith(
				2,
				"git",
				expect.arrayContaining(["commit", "-m"]),
			);
		});

		it("should include release details in commit message", async () => {
			const execSpy = vi.fn().mockResolvedValue(0);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			await client.commit(
				"workflow-versions.json",
				releases,
				"chore({components}): release",
			);

			const commitCall = execSpy.mock.calls[1];
			const commitMessage = commitCall?.[1]?.[2] as string;
			expect(commitMessage).toContain("chore(workflow-a): release");
			expect(commitMessage).toContain("workflow-a: 1.0.0 → 1.0.1");
		});

		it("should return ErrorCommittingChanges when git add fails", async () => {
			const execSpy = vi.fn().mockResolvedValueOnce(1);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.commit(
				"workflow-versions.json",
				releases,
				"chore({components}): release",
			);

			expect(result).toBeInstanceOf(ErrorCommittingChanges);
			expect((result as Error).message).toContain("stage");
		});

		it("should return ErrorCommittingChanges when git commit fails", async () => {
			const execSpy = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.commit(
				"workflow-versions.json",
				releases,
				"chore({components}): release",
			);

			expect(result).toBeInstanceOf(ErrorCommittingChanges);
			expect((result as Error).message).toContain("commit");
		});
	});

	describe("push", () => {
		it("should push to remote with correct URL", async () => {
			const execSpy = vi.fn().mockResolvedValue(0);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: { owner: "my-org", repo: "my-repo" },
			});

			const result = await client.push("fake-token");

			expect(result).toBeNull();
			expect(execSpy).toHaveBeenCalledTimes(1);
			expect(execSpy).toHaveBeenCalledWith("git", [
				"push",
				"https://x-access-token:fake-token@github.com/my-org/my-repo.git",
				"HEAD",
			]);
		});

		it("should return ErrorPushingChanges when push fails", async () => {
			const execSpy = vi.fn().mockResolvedValueOnce(1);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.push("fake-token");

			expect(result).toBeInstanceOf(ErrorPushingChanges);
		});
	});

	describe("createAndPushTags", () => {
		const releases: ReleaseResult[] = [
			{
				workflow: "workflow-a",
				previousVersion: "1.0.0",
				newVersion: "1.0.1",
				tag: "workflow-a/v1.0.1",
				majorTag: "workflow-a/v1",
			},
		];

		it("should create and push version tag and major tag", async () => {
			const execSpy = vi.fn().mockResolvedValue(0);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: { owner: "my-org", repo: "my-repo" },
			});

			const result = await client.createAndPushTags("fake-token", releases);

			expect(result).toBeNull();
			expect(execSpy).toHaveBeenCalledTimes(4);
			expect(execSpy).toHaveBeenNthCalledWith(1, "git", [
				"tag",
				"workflow-a/v1.0.1",
			]);
			expect(execSpy).toHaveBeenNthCalledWith(2, "git", [
				"push",
				"https://x-access-token:fake-token@github.com/my-org/my-repo.git",
				"workflow-a/v1.0.1",
			]);
			expect(execSpy).toHaveBeenNthCalledWith(3, "git", [
				"tag",
				"-f",
				"workflow-a/v1",
			]);
			expect(execSpy).toHaveBeenNthCalledWith(4, "git", [
				"push",
				"https://x-access-token:fake-token@github.com/my-org/my-repo.git",
				"-f",
				"workflow-a/v1",
			]);
		});

		it("should handle multiple releases", async () => {
			const execSpy = vi.fn().mockResolvedValue(0);
			const multipleReleases: ReleaseResult[] = [
				{
					workflow: "workflow-a",
					previousVersion: "1.0.0",
					newVersion: "1.0.1",
					tag: "workflow-a/v1.0.1",
					majorTag: "workflow-a/v1",
				},
				{
					workflow: "workflow-b",
					previousVersion: "2.0.0",
					newVersion: "2.1.0",
					tag: "workflow-b/v2.1.0",
					majorTag: "workflow-b/v2",
				},
			];

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.createAndPushTags(
				"fake-token",
				multipleReleases,
			);

			expect(result).toBeNull();
			// 4 calls per release (tag, push tag, tag -f major, push -f major)
			expect(execSpy).toHaveBeenCalledTimes(8);
		});

		it("should return ErrorCreatingPushingTags when creating tag fails", async () => {
			const execSpy = vi.fn().mockResolvedValueOnce(1);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.createAndPushTags("fake-token", releases);

			expect(result).toBeInstanceOf(ErrorCreatingPushingTags);
			expect((result as Error).message).toContain("workflow-a/v1.0.1");
		});

		it("should return ErrorCreatingPushingTags when pushing tag fails", async () => {
			const execSpy = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.createAndPushTags("fake-token", releases);

			expect(result).toBeInstanceOf(ErrorCreatingPushingTags);
			expect((result as Error).message).toContain("push tag");
		});

		it("should return ErrorCreatingPushingTags when creating major tag fails", async () => {
			const execSpy = vi
				.fn()
				.mockResolvedValueOnce(0)
				.mockResolvedValueOnce(0)
				.mockResolvedValueOnce(1);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.createAndPushTags("fake-token", releases);

			expect(result).toBeInstanceOf(ErrorCreatingPushingTags);
			expect((result as Error).message).toContain("major tag");
		});

		it("should return ErrorCreatingPushingTags when pushing major tag fails", async () => {
			const execSpy = vi
				.fn()
				.mockResolvedValueOnce(0)
				.mockResolvedValueOnce(0)
				.mockResolvedValueOnce(0)
				.mockResolvedValueOnce(1);

			const client = getGitClient({
				exec: { exec: execSpy },
				logger: createMockLogger(),
				which: defaultWhich,
			});

			const result = await client.createAndPushTags("fake-token", releases);

			expect(result).toBeInstanceOf(ErrorCreatingPushingTags);
			expect((result as Error).message).toContain("push major tag");
		});
	});
});
