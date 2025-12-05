import nodeFs from "node:fs";
import nodePath from "node:path";
import * as core from "@actions/core";
import type { Logger } from "./logger";

export type WorkflowVersions = {
	[workflow: string]: string;
};

export type VersionsRepository = {
	read: (
		filePath: string,
	) => WorkflowVersions | VersionsFileNotFound | VersionsFileInvalid;
	write: (
		filePath: string,
		versions: WorkflowVersions,
	) => null | VersionsFileWriteError;
};

type Inputs = {
	logger?: Logger;
	fs?: Pick<typeof nodeFs, "existsSync" | "readFileSync" | "writeFileSync">;
	path?: Pick<typeof nodePath, "resolve">;
};

export const getVersionsRepository = ({
	logger = core,
	fs = nodeFs,
	path = nodePath,
}: Inputs = {}): VersionsRepository => {
	return {
		read: (filePath: string) => {
			const fullPath = path.resolve(process.cwd(), filePath);
			logger.info(`Reading versions file at: ${fullPath}`);

			if (!fs.existsSync(fullPath)) {
				return new VersionsFileNotFound(`Versions file not found: ${filePath}`);
			}

			const content = fs.readFileSync(fullPath, "utf8");
			let versions: WorkflowVersions;
			try {
				versions = JSON.parse(content);
				logger.info("Successfully parsed versions file");
			} catch (error) {
				return new VersionsFileInvalid(
					`Failed to parse versions file: ${filePath}`,
					error instanceof Error ? error : undefined,
				);
			}

			return versions;
		},
		write: (filePath: string, versions: WorkflowVersions): null | Error => {
			const fullPath = path.resolve(process.cwd(), filePath);
			logger.info(`Writing versions file at: ${fullPath}`);

			try {
				fs.writeFileSync(fullPath, `${JSON.stringify(versions, null, 2)}\n`);
				logger.info("Successfully wrote versions file");
				return null;
			} catch (error) {
				return new VersionsFileWriteError(
					`Failed to write versions file: ${filePath}`,
					error instanceof Error ? error : undefined,
				);
			}
		},
	};
};

class VersionsFileNotFound extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "VersionsFileNotFound";
	}
}
class VersionsFileInvalid extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "VersionsFileInvalid";
	}
}
class VersionsFileWriteError extends Error {
	constructor(message: string, cause?: Error) {
		super(message, { cause });
		this.name = "VersionsFileWriteError";
	}
}
