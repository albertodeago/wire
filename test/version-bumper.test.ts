import { describe, expect, it } from "vitest";
import {
	getVersionBumper,
	type ReleaseResult,
	WorkflowVersionNotFound,
	VersionBumpError,
} from "../src/version-bumper";
import type { WorkflowVersions } from "../src/versions-repository";
import { createMockLogger, createMockSemver } from "./fixures";

describe("VersionBumper", () => {
	describe("bump", () => {
		it("should bump a single workflow version with patch", () => {
			const bumper = getVersionBumper({
				logger: createMockLogger(),
			});

			const versions: WorkflowVersions = {
				"workflow-a": "1.0.0",
				"workflow-b": "2.0.0",
			};

			const releases = bumper.bump({
				versions,
				workflows: ["workflow-a"],
				bumpType: "patch",
				tagPattern: "{name}/v{version}",
			});

			if (releases instanceof Error) {
				throw releases;
			}

			expect(releases).toHaveLength(1);
			expect(releases[0]).toEqual({
				workflow: "workflow-a",
				previousVersion: "1.0.0",
				newVersion: "1.0.1",
				tag: "workflow-a/v1.0.1",
				majorTag: "workflow-a/v1",
			});
		});

		it("should bump a single workflow version with minor", () => {
			const bumper = getVersionBumper({
				logger: createMockLogger(),
			});

			const versions: WorkflowVersions = {
				"workflow-a": "1.2.3",
			};

			const releases = bumper.bump({
				versions,
				workflows: ["workflow-a"],
				bumpType: "minor",
				tagPattern: "{name}/v{version}",
			});

			if (releases instanceof Error) {
				throw releases;
			}

			expect(releases[0]).toEqual({
				workflow: "workflow-a",
				previousVersion: "1.2.3",
				newVersion: "1.3.0",
				tag: "workflow-a/v1.3.0",
				majorTag: "workflow-a/v1",
			});
		});

		it("should bump a single workflow version with major", () => {
			const bumper = getVersionBumper({
				logger: createMockLogger(),
			});

			const versions: WorkflowVersions = {
				"workflow-a": "1.2.3",
			};

			const releases = bumper.bump({
				versions,
				workflows: ["workflow-a"],
				bumpType: "major",
				tagPattern: "{name}/v{version}",
			});

			if (releases instanceof Error) {
				throw releases;
			}
			expect(releases[0]).toEqual({
				workflow: "workflow-a",
				previousVersion: "1.2.3",
				newVersion: "2.0.0",
				tag: "workflow-a/v2.0.0",
				majorTag: "workflow-a/v2",
			});
		});

		it("should bump multiple workflows at once", () => {
			const bumper = getVersionBumper({
				logger: createMockLogger(),
			});

			const versions: WorkflowVersions = {
				"workflow-a": "1.0.0",
				"workflow-b": "2.5.0",
				"workflow-c": "0.1.0",
			};

			const releases = bumper.bump({
				versions,
				workflows: ["workflow-a", "workflow-c"],
				bumpType: "minor",
				tagPattern: "{name}/v{version}",
			});

			if (releases instanceof Error) {
				throw releases;
			}
			expect(releases).toHaveLength(2);
			expect(releases[0]).toEqual({
				workflow: "workflow-a",
				previousVersion: "1.0.0",
				newVersion: "1.1.0",
				tag: "workflow-a/v1.1.0",
				majorTag: "workflow-a/v1",
			});
			expect(releases[1]).toEqual({
				workflow: "workflow-c",
				previousVersion: "0.1.0",
				newVersion: "0.2.0",
				tag: "workflow-c/v0.2.0",
				majorTag: "workflow-c/v0",
			});
		});

		it("should generate correct tags using custom pattern", () => {
			const bumper = getVersionBumper({
				logger: createMockLogger(),
			});

			const versions: WorkflowVersions = {
				"my-workflow": "1.0.0",
			};

			const releases = bumper.bump({
				versions,
				workflows: ["my-workflow"],
				bumpType: "patch",
				tagPattern: "release-{name}-v{version}",
			});

			if (releases instanceof Error) {
				throw releases;
			}
			expect(releases[0]?.tag).toBe("release-my-workflow-v1.0.1");
			expect(releases[0]?.majorTag).toBe("release-my-workflow-v1");
		});

		it("should return WorkflowVersionNotFound when workflow does not exist", () => {
			const bumper = getVersionBumper({
				logger: createMockLogger(),
			});

			const versions: WorkflowVersions = {
				"workflow-a": "1.0.0",
			};

			const result = bumper.bump({
				versions,
				workflows: ["non-existent"],
				bumpType: "patch",
				tagPattern: "{name}/v{version}",
			});

			expect(result).toBeInstanceOf(WorkflowVersionNotFound);
			expect((result as Error).message).toContain("non-existent");
			expect((result as Error).message).toContain("not found");
		});

		it("should return VersionBumpError when semver.inc fails", () => {
			const mockSemver = createMockSemver({ incReturns: null });

			const bumper = getVersionBumper({
				logger: createMockLogger(),
				semver: mockSemver,
			});

			const versions: WorkflowVersions = {
				"workflow-a": "1.0.0",
			};

			const result = bumper.bump({
				versions,
				workflows: ["workflow-a"],
				bumpType: "patch",
				tagPattern: "{name}/v{version}",
			});

			expect(result).toBeInstanceOf(VersionBumpError);
			expect((result as Error).message).toContain("Failed to bump version");
		});

		it("should not mutate the original versions object", () => {
			const bumper = getVersionBumper({
				logger: createMockLogger(),
			});

			const versions: WorkflowVersions = {
				"workflow-a": "1.0.0",
			};
			const originalVersions = { ...versions };

			bumper.bump({
				versions,
				workflows: ["workflow-a"],
				bumpType: "patch",
				tagPattern: "{name}/v{version}",
			});

			expect(versions).toEqual(originalVersions);
		});

		it("should stop and return error on first workflow not found", () => {
			const bumper = getVersionBumper({
				logger: createMockLogger(),
			});

			const versions: WorkflowVersions = {
				"workflow-a": "1.0.0",
			};

			const result = bumper.bump({
				versions,
				workflows: ["workflow-a", "non-existent", "workflow-b"],
				bumpType: "patch",
				tagPattern: "{name}/v{version}",
			});

			expect(result).toBeInstanceOf(WorkflowVersionNotFound);
		});
	});
});
