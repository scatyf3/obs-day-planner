// Shared types for the day planner plugin.

/** One question + the user's answer collected in the planner modal. */
export interface PlannerAnswer {
	question: string;
	answer: string;
}

/** Everything we feed into the LLM to produce a timeline. */
export interface PlannerInput {
	/** Today's date, e.g. "2026-05-24". */
	date: string;
	/** Localized weekday, e.g. "Sunday" / "星期日". */
	weekday: string;
	/** Question/answer pairs from the modal. */
	answers: PlannerAnswer[];
	/** Current note content, included when settings.includeNoteContent is on. */
	noteContent?: string;
}

/** What the LLM produces: a timeline and a TODO list, each as note-ready markdown. */
export interface PlannerOutput {
	/** Timeline lines, e.g. "- HH:MM 事项". */
	timeline: string;
	/** TODO checklist lines, e.g. "- [ ] 事项". Empty when there's nothing to carry. */
	todos: string;
}
