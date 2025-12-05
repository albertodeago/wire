import { describe, expect, it } from "vitest";
import {
	getVersionsRepository,
	type WorkflowVersions,
} from "../src/versions-repository";
import { createMockFs, createMockLogger, createMockPath } from "./fixures";

describe("VersionsRepository", () => {
	describe("read", () => {
		it("should return workflow versions when file exists and is valid JSON", () => {
			const versions: WorkflowVersions = {
				"workflow-a": "1.0.0",
				"workflow-b": "2.3.1",
			};

			const fs = createMockFs({
				files: {
					"/repo/versions.json": JSON.stringify(versions),
				},
			});

			const repo = getVersionsRepository({
				logger: createMockLogger(),
				fs,
				path: createMockPath(),
			});

			const result = repo.read("versions.json");

			expect(result).toEqual(versions);
		});

		it("should return VersionsFileNotFound error when file does not exist", () => {
			const fs = createMockFs({ files: {} });

			const repo = getVersionsRepository({
				logger: createMockLogger(),
				fs,
				path: createMockPath(),
			});

			const result = repo.read("versions.json");

			expect(result).toBeInstanceOf(Error);
			expect((result as Error).name).toBe("VersionsFileNotFound");
			expect((result as Error).message).toContain("Versions file not found");
		});

		it("should return VersionsFileInvalid error when file contains invalid JSON", () => {
			const fs = createMockFs({
				files: {
					"/repo/versions.json": "{ invalid json }",
				},
			});

			const repo = getVersionsRepository({
				logger: createMockLogger(),
				fs,
				path: createMockPath(),
			});

			const result = repo.read("versions.json");

			expect(result).toBeInstanceOf(Error);
			expect((result as Error).name).toBe("VersionsFileInvalid");
			expect((result as Error).message).toContain(
				"Failed to parse versions file",
			);
		});

		it("should resolve file path relative to cwd", () => {
			const versions: WorkflowVersions = { "my-workflow": "1.0.0" };
			const fs = createMockFs({
				files: {
					"/custom/path/config/versions.json": JSON.stringify(versions),
				},
			});

			const repo = getVersionsRepository({
				logger: createMockLogger(),
				fs,
				path: createMockPath("/custom/path"),
			});

			const result = repo.read("config/versions.json");

			expect(result).toEqual(versions);
		});
	});

	describe("write", () => {
		it("should write versions to file as formatted JSON", () => {
			const state = { files: {} as Record<string, string> };
			const fs = createMockFs(state);

			const repo = getVersionsRepository({
				logger: createMockLogger(),
				fs,
				path: createMockPath(),
			});

			const versions: WorkflowVersions = {
				"workflow-a": "1.0.0",
				"workflow-b": "2.0.0",
			};

			const result = repo.write("versions.json", versions);

			expect(result).toBeNull();
			expect(state.files["/repo/versions.json"]).toBe(
				`${JSON.stringify(versions, null, 2)}\n`,
			);
		});

		it("should return null on successful write", () => {
			const fs = createMockFs();

			const repo = getVersionsRepository({
				logger: createMockLogger(),
				fs,
				path: createMockPath(),
			});

			const result = repo.write("versions.json", { "workflow-a": "1.0.0" });

			expect(result).toBeNull();
		});

		it("should return VersionsFileWriteError when write fails", () => {
			const fs = {
				existsSync: () => true,
				readFileSync: () => "{}",
				writeFileSync: () => {
					throw new Error("EACCES: permission denied");
				},
			};

			const repo = getVersionsRepository({
				logger: createMockLogger(),
				fs,
				path: createMockPath(),
			});

			const result = repo.write("versions.json", { "workflow-a": "1.0.0" });

			expect(result).toBeInstanceOf(Error);
			expect((result as Error).name).toBe("VersionsFileWriteError");
			expect((result as Error).message).toContain(
				"Failed to write versions file",
			);
		});

		it("should resolve file path relative to cwd", () => {
			const state = { files: {} as Record<string, string> };
			const fs = createMockFs(state);

			const repo = getVersionsRepository({
				logger: createMockLogger(),
				fs,
				path: createMockPath("/my/project"),
			});

			repo.write("config/versions.json", { "workflow-a": "1.0.0" });

			expect(state.files["/my/project/config/versions.json"]).toBeDefined();
		});
	});
});
