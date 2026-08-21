import type { Command } from "../types.ts";
import { ping } from "./ping.ts";

export const commands: readonly Command[] = [ping];
