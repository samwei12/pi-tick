// Previously authorized unattended execution; does not expand the task scope.
export function scheduledPrompt(job) {
  return `[Scheduled task: ${job.id}]\nThis is an already authorized unattended run. Execute the task within its stated scope without requesting plan confirmation. If blocked by missing access or authorization, report that blocker and stop.\n\n${job.prompt}`;
}
