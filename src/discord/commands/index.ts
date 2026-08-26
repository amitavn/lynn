import type { Command } from "../types.ts";
import { ping } from "./ping.ts";
import { remind } from "./remind.ts";

export const commands: readonly Command[] = [ping, remind];
