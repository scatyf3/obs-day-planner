import {requestUrl} from "obsidian";
import type {DayPlannerSettings} from "./settings";

interface OpenAIResponse {
	choices?: {message?: {content?: string}}[];
	error?: {message?: string};
}

interface AnthropicResponse {
	content?: {type?: string; text?: string}[];
	error?: {message?: string};
}

/** Default endpoint per provider, used when the user leaves Base URL empty. */
export const DEFAULT_BASE_URLS: Record<DayPlannerSettings["provider"], string> = {
	openai: "https://api.openai.com/v1",
	anthropic: "https://api.anthropic.com/v1",
};

/**
 * Call the configured LLM and return the assistant text. Branches by provider:
 * OpenAI-compatible /chat/completions or Anthropic /messages. Throws with a
 * human-readable message on misconfiguration or a non-2xx response; callers
 * surface it via Notice.
 */
export async function chatCompletion(
	settings: DayPlannerSettings,
	systemPrompt: string,
	userPrompt: string,
): Promise<string> {
	if (!settings.apiKey) {
		throw new Error("No API key set. Add one in the day planner settings.");
	}
	const baseUrl = (settings.apiBaseUrl || DEFAULT_BASE_URLS[settings.provider]).replace(/\/+$/, "");

	if (settings.provider === "anthropic") {
		return anthropicCompletion(settings, baseUrl, systemPrompt, userPrompt);
	}
	return openaiCompletion(settings, baseUrl, systemPrompt, userPrompt);
}

interface RawResponse {
	status: number;
	text: string;
}

/** POST JSON and return raw status + text, without parsing (parsing is deferred). */
async function post(url: string, headers: Record<string, string>, body: unknown): Promise<RawResponse> {
	try {
		const res = await requestUrl({
			url,
			method: "POST",
			headers,
			body: JSON.stringify(body),
			throw: false,
		});
		// Read text directly; avoid res.json, whose getter throws on empty/non-JSON bodies.
		return {status: res.status, text: res.text ?? ""};
	} catch (e) {
		throw new Error(`Network error reaching ${url}: ${(e as Error).message}`);
	}
}

/** Short, single-line snippet of a body for inclusion in error messages. */
function snippet(text: string): string {
	const s = text.replace(/\s+/g, " ").trim();
	return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

/**
 * Parse a successful response body as JSON, or throw a clear error that includes
 * the status and a snippet of what the server actually returned. Also surfaces
 * non-2xx responses (with the server's error message when present).
 */
function parseOrThrow<T extends {error?: {message?: string}}>(res: RawResponse): T {
	let json: T | undefined;
	if (res.text.length > 0) {
		try {
			json = JSON.parse(res.text) as T;
		} catch {
			json = undefined;
		}
	}

	if (res.status < 200 || res.status >= 300) {
		const detail = json?.error?.message ?? (snippet(res.text) || "no response body");
		throw new Error(`LLM request failed (HTTP ${res.status}). ${detail}`.trim());
	}

	if (json === undefined) {
		const detail = res.text.length === 0
			? "empty response body"
			: `non-JSON response: ${snippet(res.text)}`;
		throw new Error(`LLM returned an unexpected response (HTTP ${res.status}): ${detail}`);
	}

	return json;
}

async function openaiCompletion(
	settings: DayPlannerSettings,
	baseUrl: string,
	systemPrompt: string,
	userPrompt: string,
): Promise<string> {
	const res = await post(
		`${baseUrl}/chat/completions`,
		{
			"Authorization": `Bearer ${settings.apiKey}`,
			"Content-Type": "application/json",
		},
		{
			model: settings.model,
			max_tokens: settings.maxTokens,
			messages: [
				{role: "system", content: systemPrompt},
				{role: "user", content: userPrompt},
			],
		},
	);

	const json = parseOrThrow<OpenAIResponse>(res);
	const content = json.choices?.[0]?.message?.content;
	if (typeof content !== "string" || content.length === 0) {
		throw new Error("LLM returned an empty response.");
	}
	return content.trim();
}

async function anthropicCompletion(
	settings: DayPlannerSettings,
	baseUrl: string,
	systemPrompt: string,
	userPrompt: string,
): Promise<string> {
	const res = await post(
		`${baseUrl}/messages`,
		{
			"x-api-key": settings.apiKey,
			"anthropic-version": "2023-06-01",
			"Content-Type": "application/json",
		},
		{
			model: settings.model,
			max_tokens: settings.maxTokens,
			system: systemPrompt,
			messages: [{role: "user", content: userPrompt}],
		},
	);

	const json = parseOrThrow<AnthropicResponse>(res);
	const content = json.content?.find((b) => b.type === "text")?.text;
	if (typeof content !== "string" || content.length === 0) {
		throw new Error("LLM returned an empty response.");
	}
	return content.trim();
}
