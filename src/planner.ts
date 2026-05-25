import {App, TFile} from "obsidian";
import type {DayPlannerSettings} from "./settings";
import type {PlannerInput} from "./types";
import {chatCompletion} from "./llm";

const OUTPUT_REMINDER = `\n\n请只输出可直接贴进 Timeline 区块的内容,每行 \`- HH:MM 事项\`,不要包裹代码块。`;

/** Resolve the system prompt from the configured vault note. */
async function getRules(app: App, settings: DayPlannerSettings): Promise<string> {
	if (!settings.rulesNotePath) {
		throw new Error("No rules note configured. Set the rules note path in the plugin settings.");
	}
	const file = app.vault.getAbstractFileByPath(settings.rulesNotePath);
	if (file instanceof TFile) {
		return await app.vault.read(file);
	}
	throw new Error(`Rules note not found: ${settings.rulesNotePath}`);
}

function buildUserPrompt(input: PlannerInput): string {
	const parts: string[] = [`今天是 ${input.date}(${input.weekday})。`];

	const answered = input.answers.filter((a) => a.answer.trim().length > 0);
	if (answered.length > 0) {
		parts.push("\n今天的输入:");
		for (const a of answered) {
			parts.push(`- ${a.question}\n  ${a.answer.trim()}`);
		}
	}

	if (input.noteContent && input.noteContent.trim().length > 0) {
		parts.push(`\n当前 Daily 笔记内容(供参考,如有未完成 TODO 请考虑进去):\n${input.noteContent.trim()}`);
	}

	return parts.join("\n");
}

/** Build the prompt, call the LLM, and return the generated timeline text. */
export async function generateTimeline(
	app: App,
	settings: DayPlannerSettings,
	input: PlannerInput,
): Promise<string> {
	const rules = await getRules(app, settings);
	const userPrompt = buildUserPrompt(input);
	return await chatCompletion(settings, rules + OUTPUT_REMINDER, userPrompt);
}
