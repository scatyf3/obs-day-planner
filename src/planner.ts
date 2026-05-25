import {App, TFile} from "obsidian";
import type {DayPlannerSettings} from "./settings";
import type {PlannerInput, PlannerOutput} from "./types";
import {chatCompletion} from "./llm";

/** Line that separates the timeline block from the TODO block in the LLM reply. */
const TODO_SEPARATOR = "===TODO===";

const OUTPUT_REMINDER = `\n\n请按下面两段输出,都不要包裹代码块:
第一段 Timeline:每行 \`- HH:MM 事项\`,按时间顺序排列。
然后单独一行写 \`${TODO_SEPARATOR}\`。
第二段 TODO:每行 \`- [ ] 事项\`,只汇总用户明确提到的重要事项,以及当前笔记里尚未完成的 TODO;不要自行新增任务,也不要把作息骨架里的常规事项当成 TODO。若没有可写的 TODO,这一段留空即可。`;

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

/** Split the LLM reply into the timeline block and the TODO block. */
function splitOutput(reply: string): PlannerOutput {
	const idx = reply.indexOf(TODO_SEPARATOR);
	if (idx === -1) {
		return {timeline: reply.trim(), todos: ""};
	}
	return {
		timeline: reply.slice(0, idx).trim(),
		todos: reply.slice(idx + TODO_SEPARATOR.length).trim(),
	};
}

/** Build the prompt, call the LLM, and return the generated timeline and TODOs. */
export async function generatePlan(
	app: App,
	settings: DayPlannerSettings,
	input: PlannerInput,
): Promise<PlannerOutput> {
	const rules = await getRules(app, settings);
	const userPrompt = buildUserPrompt(input);
	const reply = await chatCompletion(settings, rules + OUTPUT_REMINDER, userPrompt);
	return splitOutput(reply);
}
