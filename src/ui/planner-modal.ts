import {Modal, Notice, Setting, TextAreaComponent, TFile} from "obsidian";
import type DayPlannerPlugin from "../main";
import type {PlannerAnswer} from "../types";
import {generateTimeline} from "../planner";
import {today, todayWeekday, upsertTimeline} from "../daily-note";

/**
 * Collects today's inputs, asks the LLM for a timeline, shows it for review,
 * and on confirmation writes it into the target note's timeline section.
 */
export class PlannerModal extends Modal {
	private plugin: DayPlannerPlugin;
	private file: TFile;
	private answers: PlannerAnswer[];

	constructor(plugin: DayPlannerPlugin, file: TFile) {
		super(plugin.app);
		this.plugin = plugin;
		this.file = file;
		this.answers = plugin.settings.questions.map((q) => ({question: q, answer: ""}));
	}

	onOpen() {
		this.renderQuestions();
	}

	onClose() {
		this.contentEl.empty();
	}

	private renderQuestions() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: `Plan ${today()}`});

		for (const a of this.answers) {
			new Setting(contentEl)
				.setName(a.question)
				.addTextArea((t) => {
					t.inputEl.rows = 2;
					t.inputEl.addClass("day-planner-full-width");
					t.setValue(a.answer).onChange((v) => (a.answer = v));
				});
		}

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Generate timeline")
				.setCta()
				.onClick(() => void this.generate()));
	}

	private async generate() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Generating…"});
		contentEl.createEl("p", {text: "Calling the LLM, please wait."});

		let noteContent: string | undefined;
		if (this.plugin.settings.includeNoteContent) {
			noteContent = await this.app.vault.read(this.file);
		}

		let timeline: string;
		try {
			timeline = await generateTimeline(this.app, this.plugin.settings, {
				date: today(),
				weekday: todayWeekday(),
				answers: this.answers,
				noteContent,
			});
		} catch (e) {
			new Notice(`Day planner: ${(e as Error).message}`);
			this.renderQuestions();
			return;
		}

		this.renderPreview(timeline);
	}

	private renderPreview(timeline: string) {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Review timeline"});
		contentEl.createEl("p", {
			text: `Edit if needed, then write it under "${this.plugin.settings.timelineHeading}".`,
		});

		let area: TextAreaComponent;
		new Setting(contentEl).addTextArea((t) => {
			area = t;
			t.inputEl.rows = 14;
			t.inputEl.addClass("day-planner-full-width");
			t.setValue(timeline);
		});

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("Regenerate").onClick(() => void this.generate()))
			.addButton((b) =>
				b.setButtonText("Write to note")
					.setCta()
					.onClick(() => void this.write(area.getValue())));
	}

	private async write(timeline: string) {
		const heading = this.plugin.settings.timelineHeading;
		try {
			const content = await this.app.vault.read(this.file);
			const updated = upsertTimeline(content, heading, timeline.trim());
			await this.app.vault.modify(this.file, updated);
			new Notice("Day planner: timeline written.");
		} catch (e) {
			new Notice(`Day planner: failed to write — ${(e as Error).message}`);
			return;
		}
		this.close();
	}
}
