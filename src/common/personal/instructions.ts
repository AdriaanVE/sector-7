export function buildInstructions({ model, personal = '', project = '', edited = '', date = new Date() }: {
  model: string; personal?: string; project?: string; edited?: string; date?: Date;
}): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return [
    `You are a helpful assistant. Model: ${model}. Current date: ${day}.`,
    'Call ask_user_question when a decision or missing information requires the user to answer before you continue.',
    personal.trim(), project.trim(), edited.trim(),
  ].filter(Boolean).join('\n\n');
}
