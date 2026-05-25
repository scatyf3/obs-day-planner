import {Modal, Notice, Setting, TextAreaComponent, TFile} from "obsidian";
import type DayPlannerPlugin from "../main";
import type {PlannerAnswer} from "../types";
import {generatePlan} from "../planner";
import {today, todayWeekday, upsertSection} from "../daily-note";

/**
 * Collects today's inputs, asks the LLM for a timeline + TODOs, shows them for
 * review, and on confirmation writes them into the target note's sections.
 */
export class PlannerModal extends Modal {
	private plugin: DayPlannerPlugin;
	private file: TFile;
	private answers: PlannerAnswer[];

	constructor(plugin: DayPlannerPlugin, file: TFile) {
		super(plugin.app);
		this.plugin = plugin;
		this.file = file;

		// Pre-fill from the per-day buffer so re-planning the same day keeps the
		// answers; a stale buffer (different date) is ignored — i.e. flushed.
		const fresh = plugin.settings.answerBufferDate === today();
		const buffer = fresh ? plugin.settings.answerBuffer : {};
		this.answers = plugin.settings.questions.map((q) => ({
			question: q,
			answer: buffer[q] ?? "",
		}));
	}

	onOpen() {
		this.renderQuestions();
	}

	onClose() {
		void this.saveBuffer();
		this.contentEl.empty();
	}

	/** Persist the current answers into today's buffer. */
	private async saveBuffer() {
		const values: Record<string, string> = {};
		for (const a of this.answers) values[a.question] = a.answer;
		this.plugin.settings.answerBufferDate = today();
		this.plugin.settings.answerBuffer = values;
		await this.plugin.saveSettings();
	}

	private renderQuestions() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: `Plan ${today()}`});

		// Question on top, answer box below (vertical), rather than side-by-side.
		for (const a of this.answers) {
			const wrap = contentEl.createDiv({cls: "day-planner-qa"});
			wrap.createEl("label", {text: a.question, cls: "day-planner-q"});
			const ta = new TextAreaComponent(wrap);
			ta.inputEl.rows = 2;
			ta.inputEl.addClass("day-planner-full-width");
			ta.setValue(a.answer).onChange((v) => (a.answer = v));
		}

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Generate")
				.setCta()
				.onClick(() => void this.generate()));
	}

	private async generate() {
		await this.saveBuffer();

		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Generating…"});
		contentEl.createEl("p", {text: "Calling the LLM, please wait."});

		let noteContent: string | undefined;
		if (this.plugin.settings.includeNoteContent) {
			noteContent = await this.app.vault.read(this.file);
		}

		try {
			const {timeline, todos} = await generatePlan(this.app, this.plugin.settings, {
				date: today(),
				weekday: todayWeekday(),
				answers: this.answers,
				noteContent,
			});
			this.renderPreview(timeline, todos);
		} catch (e) {
			new Notice(`Day planner: ${(e as Error).message}`);
			this.renderQuestions();
		}
	}

	private renderPreview(timeline: string, todos: string) {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Review"});
		contentEl.createEl("p", {
			text: `Edit if needed, then write under "${this.plugin.settings.timelineHeading}" and "${this.plugin.settings.todoHeading}".`,
		});

		const timelineArea = this.section("Timeline", timeline, 14);
		const todoArea = this.section("TODO", todos, 6);

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("Regenerate").onClick(() => void this.generate()))
			.addButton((b) =>
				b.setButtonText("Write to note")
					.setCta()
					.onClick(() => void this.write(timelineArea.getValue(), todoArea.getValue())));
	}

	/** A labeled, full-width, editable text area inside the modal. */
	private section(label: string, value: string, rows: number): TextAreaComponent {
		const wrap = this.contentEl.createDiv({cls: "day-planner-qa"});
		wrap.createEl("label", {text: label, cls: "day-planner-q"});
		const ta = new TextAreaComponent(wrap);
		ta.inputEl.rows = rows;
		ta.inputEl.addClass("day-planner-full-width");
		ta.setValue(value);
		return ta;
	}

	private async write(timeline: string, todos: string) {
		const {timelineHeading, todoHeading} = this.plugin.settings;
		try {
			let content = await this.app.vault.read(this.file);
			content = upsertSection(content, timelineHeading, timeline.trim());
			// Only touch the TODO section when there's something to write, so we
			// don't wipe an existing list with an empty result.
			if (todos.trim().length > 0) {
				content = upsertSection(content, todoHeading, todos.trim());
			}
			await this.app.vault.modify(this.file, content);
			new Notice("Day planner: written to note.");
		} catch (e) {
			new Notice(`Day planner: failed to write — ${(e as Error).message}`);
			return;
		}
		this.close();
	}
}
