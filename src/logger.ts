import * as core from "@actions/core";

export type Logger = Pick<typeof core, "debug" | "info" | "error" | "warning">;

export const getLogger = (): Logger => {
	return core;
};
