import {
    Agent,
    type AgentOptions,
    type AgentMessage,
    type StreamFn,
} from "@earendil-works/pi-agent-core";
import {
    createModels,
    InMemoryCredentialStore,
    type AssistantMessage,
    type Message,
    type Model,
    type Provider,
    type TextContent,
    type UserMessage,
} from "@earendil-works/pi-ai";
import { cloudflareWorkersAIProvider } from "@earendil-works/pi-ai/providers/cloudflare-workers-ai";
import * as Redacted from "effect/Redacted";

const PROVIDER = "cloudflare-workers-ai";
const SYSTEM_PROMPT = "You are Lynn, a concise Discord assistant.";
const DEEPSEEK_MODEL_ID = "@cf/deepseek-ai/deepseek-v4-flash-0731";

export interface LynnAgentOptions {
    modelId: string;
    apiKey: Redacted.Redacted<string>;
    accountId: string;
    history?: readonly AgentMessage[];
}

export interface PersistedMessage {
    role: "user" | "assistant";
    text: string;
    timestamp: number;
}

const deepSeekV4Flash = (
    base: Model<"openai-completions">,
): Model<"openai-completions"> => ({
    ...base,
    id: DEEPSEEK_MODEL_ID,
    name: "DeepSeek V4 Flash 0731",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 16_384,
});

const providerWithModel = (modelId: string): Provider => {
    const base = cloudflareWorkersAIProvider();
    const models = [...base.getModels()];
    const baseModel = models[0];
    if (!baseModel) {
        throw new Error("cloudflare-workers-ai provider has no base models");
    }

    if (modelId === DEEPSEEK_MODEL_ID) {
        const model = deepSeekV4Flash(baseModel);
        const existingIndex = models.findIndex((candidate) => candidate.id === modelId);
        if (existingIndex >= 0) {
            models[existingIndex] = model;
        } else {
            models.push(model);
        }
    } else if (!models.some((candidate) => candidate.id === modelId)) {
        throw new Error(`Unknown model: ${modelId}`);
    }

    return { ...base, getModels: () => models };
};

export const resolveModelId = (configured: string): string => {
    if (configured.startsWith("cloudflare-workers-ai/")) {
        return configured.slice("cloudflare-workers-ai/".length);
    }
    if (configured.startsWith("workers-ai/")) {
        return configured.slice("workers-ai/".length);
    }
    return configured;
};

export const createLynnAgent = async (
    options: LynnAgentOptions,
): Promise<Agent> => {
    const credentials = new InMemoryCredentialStore();
    await credentials.modify(PROVIDER, async () => ({
        type: "api_key",
        key: Redacted.value(options.apiKey),
        env: { CLOUDFLARE_ACCOUNT_ID: options.accountId },
    }));

    const models = createModels({ credentials });
    models.setProvider(providerWithModel(options.modelId));

    const model = models.getModel(PROVIDER, options.modelId);
    if (!model) {
        throw new Error(`Unknown model: ${options.modelId}`);
    }

    const streamFn: StreamFn = (candidate, context, streamOptions) =>
        models.streamSimple(candidate, context, streamOptions);

    const initialState: AgentOptions["initialState"] = {
        systemPrompt: SYSTEM_PROMPT,
        model,
        thinkingLevel: "off",
        tools: [],
    };
    if (options.history && options.history.length > 0) {
        initialState.messages = [...options.history];
    }

    return new Agent({
        initialState,
        streamFn,
        toolExecution: "sequential",
    });
};

export const lastAssistantText = (
    messages: readonly AgentMessage[],
): string => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message && message.role === "assistant") {
            return message.content
                .filter((block): block is TextContent => block.type === "text")
                .map((block) => block.text)
                .join("");
        }
    }
    return "";
};

export const persistMessages = (
    messages: readonly AgentMessage[],
): PersistedMessage[] => {
    const persisted: PersistedMessage[] = [];

    for (const message of messages) {
        if (message.role === "user") {
            const text = Array.isArray(message.content)
                ? message.content
                      .filter(
                          (block): block is TextContent =>
                              block.type === "text",
                      )
                      .map((block) => block.text)
                      .join("")
                : message.content;
            persisted.push({
                role: "user",
                text,
                timestamp: message.timestamp,
            });
            continue;
        }

        if (message.role === "assistant") {
            const text = message.content
                .filter((block): block is TextContent => block.type === "text")
                .map((block) => block.text)
                .join("");
            persisted.push({
                role: "assistant",
                text,
                timestamp: message.timestamp,
            });
        }
    }

    return persisted;
};

export const restoreMessages = (
    persisted: readonly PersistedMessage[],
    modelId: string,
): Message[] =>
    persisted.map((entry) => {
        if (entry.role === "user") {
            const user: UserMessage = {
                role: "user",
                content: entry.text,
                timestamp: entry.timestamp,
            };
            return user;
        }

        const assistant: AssistantMessage = {
            role: "assistant",
            content: [{ type: "text", text: entry.text }],
            api: "openai-completions",
            provider: PROVIDER,
            model: modelId,
            usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    total: 0,
                },
            },
            stopReason: "stop",
            timestamp: entry.timestamp,
        };
        return assistant;
    });