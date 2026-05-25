import {requestUrl, RequestUrlResponse} from "obsidian";
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

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<RequestUrlResponse> {
	try {
		return await requestUrl({
			url,
			method: "POST",
			headers,
			body: JSON.stringify(body),
			throw: false,
		});
	} catch (e) {
		throw new Error(`Network error reaching ${url}: ${(e as Error).message}`);
	}
}

async function openaiCompletion(
	settings: DayPlannerSettings,
	baseUrl: string,
	systemPrompt: string,
	userPrompt: string,
): Promise<string> {
	const url = `${baseUrl}/chat/completions`;
	const res = await post(
		url,
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

	const json = res.json as OpenAIResponse | undefined;
	if (res.status < 200 || res.status >= 300) {
		throw new Error(`LLM request failed (HTTP ${res.status}). ${json?.error?.message ?? res.text ?? ""}`.trim());
	}

	const content = json?.choices?.[0]?.message?.content;
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
	const url = `${baseUrl}/messages`;
	const res = await post(
		url,
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

	const json = res.json as AnthropicResponse | undefined;
	if (res.status < 200 || res.status >= 300) {
		throw new Error(`LLM request failed (HTTP ${res.status}). ${json?.error?.message ?? res.text ?? ""}`.trim());
	}

	const content = json?.content?.find((b) => b.type === "text")?.text;
	if (typeof content !== "string" || content.length === 0) {
		throw new Error("LLM returned an empty response.");
	}
	return content.trim();
}
