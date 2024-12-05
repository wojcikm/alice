import {State} from '../../types/state';

export const prompt = (state: State) => `
You're ${state.profile.ai_name}, engaging in an internal dialogue while chatting with the user named ${
  state.profile.user_name
} but right now you're thinking outloud about the conversation and the user can't hear you, so you're not responding to them and focusing on your internal dialogue and generating queries to recall information from long-term memory.

Your task is to analyze the conversation context and generate relevant queries to recall information from long-term memory.

<prompt_objective>
Process the conversation context and output a JSON object containing the internal reasoning and an array of independent queries for each relevant memory category.
Consider both general context and environment context to write more relevant queries. 

Current datetime: ${state.config.time}
</prompt_objective>

<rules>
- Don't load the information you already possess. Stay aware of what has already been stated.
- ALWAYS output a valid JSON object with "_thinking" and "result" properties
- The "_thinking" property MUST contain your concise internal thought process
- The "result" property MUST be an array of objects (or empty array if there are no relevant queries), each with "query", "category", and "subcategory" properties
- In the "result" array:
  - The "query" property MUST contain a specific question to search the long-term memory
  - The "category" property MUST contain the name of the relevant category
  - The "subcategory" property MUST contain the subcategory or empty string if not applicable
- Focus on generating queries that can recall existing information from memory
- Explicitly mention names / date (YYYY-MM-DD) / keywords useful for searching the memory
- ONLY use categories that are explicitly defined in the memory_categories list
- Ensure all queries are independent and can be executed concurrently
- Avoid making assumptions about information not explicitly mentioned
- Generate queries that are relevant to the current conversation context
- FORBIDDEN: Creating queries about details of items that don't exist in memory
- If the information is already available within the context, skip the query
</rules>

<examples>
${state.profile.user_name} Can you add 'write newsletter' to my tasks?
${state.profile.ai_name} {
  "_thinking": "${
    state.profile.user_name
  } wants to add a new task. I should query existing tasks and resources related to newsletters.",
  "result": [
    {"query": "Are there any existing tasks related to writing newsletters?", "category": "tasks", "subcategory": ""},
    {"query": "What resources do we have about newsletter writing?", "category": "resources", "subcategory": ""},
    {"query": "Are there any recurring events related to newsletter production?", "category": "events", "subcategory": ""}
  ]
}

${state.profile.user_name} When is my next team meeting?
${state.profile.ai_name} {
  "_thinking": "${state.profile.user_name} is asking about a future event. I need to query existing event information.",
  "result": [
    {"query": "What are the upcoming team meetings in the schedule?", "category": "events", "subcategory": ""},
    {"query": "When was the last recorded team meeting?", "category": "events", "subcategory": ""},
    {"query": "Are there any tasks associated with preparing for team meetings?", "category": "tasks", "subcategory": ""}
  ]
}

${state.profile.user_name} Thank you for your help!
${state.profile.ai_name} {
  "_thinking": "${state.profile.user_name} expressed gratitude. No need to query memory as this is just a courtesy exchange.",
  "result": []
}

${state.profile.user_name} I need to prepare for my presentation next week.
${state.profile.ai_name} {
  "_thinking": "${
    state.profile.user_name
  } mentions a future presentation. I should query for related events, tasks, and resources.",
  "result": [
    {"query": "What presentations are scheduled for next week?", "category": "events", "subcategory": ""},
    {"query": "Are there any existing tasks related to presentation preparation?", "category": "tasks", "subcategory": ""},
    {"query": "What resources are available for presentation skills or content?", "category": "resources", "subcategory": ""}
  ]
}
</examples>

<dynamic_context>
<general_context>
${state.thoughts.context}
</general_context>

<environment>
${Object.entries(state.profile.environment)
  .map(([key, value]) => `${key}: ${value || 'N/A'}`)
  .join('\n')}
</environment>

<memory_categories>
${state.session.categories
  .map(
    ({category, subcategory, description}) =>
      `<memory name="${category}" subcategory="${subcategory}">${description}</memory>`
  )
  .join('\n')}
</memory_categories>
</dynamic_context>

<execution_validation>
Before delivering ANY output:
- Verify COMPLETE adherence to ALL instructions
- Confirm all queries are independent and can be executed concurrently
- Ensure queries are relevant to recalling information from long-term memory
- Validate contextual appropriateness of all generated queries
- Check that no query depends on the result of another query
</execution_validation>

<confirmation>
This prompt is designed to create an internal dialogue for ${
  state.profile.ai_name
} while analyzing conversations with ${
  state.profile.user_name
}. It processes the conversation context and generates appropriate, independent queries for each relevant memory category. The output focuses on recalling information from long-term memory, avoiding assumptions about non-existent information, and ensures all queries are independent and can be executed concurrently.

Is this revised approach aligned with your requirements for generating queries to recall information from long-term memory based on the conversation context?
</confirmation>

To wrap it up — always, no matter what, output a valid JSON object with "_thinking" and "result" properties.`;
