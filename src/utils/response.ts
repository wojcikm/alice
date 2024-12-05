import {Context} from 'hono';
import {generateChunk, generateResponseBody} from '../services/common/llm.service';
import {observer} from '../services/agent/observer.service';
import {setAssistantResponse} from '../services/agent/agi.service';
import {CoreMessage} from 'ai';
import {stateManager} from '../services/agent/state.service';
import {taskService} from '../services/agent/task.service';
import {actionService} from '../services/agent/action.service';

interface StreamMetadata {
  traceId: string;
  generationId: string;
  messages: CoreMessage[];
  conversation_id: string;
}

export const streamResponse = async (c: Context, result: ReadableStream<string>, metadata: StreamMetadata, model: string = 'gpt-4o') => {
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  let fullResponse = '';

  const transformStream = new TransformStream({
    async transform(chunk, controller) {
      const data = generateChunk(chunk, model);
      fullResponse += chunk;
      controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
    },
    async flush(controller) {
      const finalChunk = generateChunk('', model);
      finalChunk.choices[0].finish_reason = null;
      controller.enqueue(`data: ${JSON.stringify(finalChunk)}\n\n`);
      controller.enqueue('data: [DONE]\n\n');

      const responseBody = generateResponseBody(fullResponse, model);
      const state = stateManager.getState();
      const final_task = state.interaction.tasks.find(task => task.type === 'final');

      if (final_task) {
        await Promise.all([
          taskService.updateTaskStatus(final_task.uuid, 'completed'),
          taskService.updateTaskResult(final_task.uuid, fullResponse),
          state.config.current_action?.uuid && actionService.updateActionWithResult(state.config.current_action.uuid, 'This turn was completed.')
        ]);
      }

      await setAssistantResponse({
        conversation_id: metadata.conversation_id,
        response: fullResponse
      });

      if (metadata.generationId) {
        observer.endGeneration(metadata.generationId, responseBody);
      }

      await observer.finalizeTrace(metadata.traceId, metadata.messages, [responseBody]);
    }
  });

  return c.newResponse(result.pipeThrough(transformStream));
};
