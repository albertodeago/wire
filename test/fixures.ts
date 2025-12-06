import type * as ActionExec from "@actions/exec";
import type * as SemVer from "semver";
import type { Logger } from "../src/logger";

export const createMockLogger = (): Logger => ({
	debug: () => {},
	info: () => {},
	warning: () => {},
	error: () => {},
});

// Partial mock for node:path module
export const createMockPath = (cwd = "/repo") => ({
	resolve: (_base: string, filePath: string) => `${cwd}/${filePath}`,
});

// Partial mock for node:fs module
export const createMockFs = (
	state: { files: Record<string, string> } = { files: {} },
) => ({
	existsSync: (path: string) => path in state.files,
	readFileSync: (path: string, _encoding: string) => {
		const content = state.files[path];
		if (content === undefined) {
			throw new Error(`ENOENT: no such file or directory, open '${path}'`);
		}
		return content;
	},
	writeFileSync: (path: string, content: string) => {
		state.files[path] = content;
	},
});

// Partial mock for semver module
export const createMockSemver = (
	options: { incReturns?: string | null } = {},
): typeof SemVer =>
	({
		inc: (_version: string, _release: string) => options.incReturns ?? null,
	}) as unknown as typeof SemVer;
