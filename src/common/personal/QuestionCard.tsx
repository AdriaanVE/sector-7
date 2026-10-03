import * as React from 'react';
import { Alert, Box, Button, Chip, Textarea, Typography } from '@mui/joy';
import { useChatStore } from '~/common/stores/chat/store-chats';
import { answerQuestions, continueQuestions, questionAnswerKey, useQuestionOperations } from './questions';
import { runPersonaOnConversationHead } from '../../apps/chat/editors/chat-persona';

export function QuestionCard({ conversationId }: { conversationId: string }) {
  const chat = useChatStore(state => state.conversations.find(chat => chat.id === conversationId));
  const pending = chat?.pendingQuestions || [];
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState('');
  const operation = useQuestionOperations(state => state.active[conversationId]);
  const busy = !!operation;
  if (!pending.length) return null;
  const unanswered = pending.filter(question => !question.answered);
  const answerSaved = unanswered.length === 0;
  const continueChat = async () => {
    if (!chat || busy) return;
    setError('');
    try {
      if (!answerSaved && !await answerQuestions(conversationId, answers)) return;
      await continueQuestions(conversationId, () => runPersonaOnConversationHead(chat.chatConfig.llmId, conversationId, true));
    } catch (error) { setError(error instanceof Error ? error.message : 'Answer could not be saved.'); }
  };
  return <Box sx={{ mx: 'auto', p: 2, mb: 2, maxWidth: 800, border: '1px solid', borderColor: 'primary.outlinedBorder', borderRadius: 'lg', bgcolor: 'background.surface', display: 'grid', gap: 1 }}>
    <Typography level='title-lg'>{operation === 'saving' ? 'Saving answer' : answerSaved ? 'Answer saved' : 'Claude needs your answer'}</Typography>
    {unanswered.flatMap(question => question.questions.map(item => <Box key={`${question.invocationId}-${item.id}`} sx={{ display: 'grid', gap: 1 }}>
      <Typography>{item.text}</Typography><Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{item.choices?.map(choice => <Chip key={choice} component='button' onClick={() => setAnswers(state => ({ ...state, [questionAnswerKey(question.invocationId, item.id)]: choice }))}>{choice}</Chip>)}</Box>
      <Textarea aria-label={item.text} value={answers[questionAnswerKey(question.invocationId, item.id)] || ''} onChange={event => setAnswers(state => ({ ...state, [questionAnswerKey(question.invocationId, item.id)]: event.target.value }))} />
    </Box>))}
    {error && <Alert color='danger'>{error}</Alert>}
    <Box sx={{ display: 'flex', gap: 1 }}><Button loading={busy} onClick={() => void continueChat()}>{answerSaved ? 'Continue' : 'Send answers'}</Button>
      <Button variant='plain' disabled={busy} onClick={() => { void answerQuestions(conversationId, {}, true).catch(error => setError(error.message)); }}>Dismiss</Button></Box>
  </Box>;
}
