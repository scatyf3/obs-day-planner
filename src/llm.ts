import {requestUrl} from "obsidian";
import type {DayPlannerSettings} from "./settings";

interface ChatCompletionResponse {
	choices?: {message?: {content?: string}}[];
	error?: {message?: string};
}

/**
 * Call an OpenAI-compatible /chat/completions endpoint and return the assistant
 * message text. Throws with a human-readable message on misconfiguration or a
 * non-2xx response; callers surface it via Notice.
 */
export async function chatCompletion(
	settings: DayPlannerSettings,
	systemPrompt: string,
	userPrompt: string,
): Promise<string> {
	if (!settings.apiKey) {
		throw new Error("No API key set. Add one in the day planner settings.");
	}
	if (!settings.apiBaseUrl) {
		throw new Error("No API base URL set.");
	}

	const url = `${settings.apiBaseUrl.replace(/\/+$/, "")}/chat/completions`;

	let res;
	try {
		res = await requestUrl({
			url,
			method: "POST",
			headers: {
				"Authorization": `Bearer ${settings.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: settings.model,
				messages: [
					{role: "system", content: systemPrompt},
					{role: "user", content: userPrompt},
				],
			}),
			throw: false,
		});
	} catch (e) {
		throw new Error(`Network error reaching ${url}: ${(e as Error).message}`);
	}

	const json = res.json as ChatCompletionResponse | undefined;

	if (res.status < 200 || res.status >= 300) {
		const detail = json?.error?.message ?? res.text ?? "";
		throw new Error(`LLM request failed (HTTP ${res.status}). ${detail}`.trim());
	}

	const content = json?.choices?.[0]?.message?.content;
	if (typeof content !== "string" || content.length === 0) {
		throw new Error("LLM returned an empty response.");
	}
	return content.trim();
}
