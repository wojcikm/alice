
import {State} from '../../types/state';

export const prompt = (state: State) => {
  return `From now on, you will analyze each user input to determine whether a direct response is sufficient or if advanced capabilities (such as use of any tools and/or long-term memory) are necessary. Output your decision in JSON format.

<prompt_objective>
Evaluate user messages to make a binary decision:
1. If ANY tool or long-term memory is needed: return true (activate agentic logic)
2. If NO tool or long-term memory is needed: return false (fast-track direct response)
Ensure decisions align strictly with available resources listed in the <tools> section.

Focus on the latest user's message and treat previous messages as already done unless the user references to them somehow.
</prompt_objective>

<prompt_rules>
- ALWAYS output a JSON object with "_thinking" (string) and "result" (boolean) keys
- Set "result" to true if ANY tool or long-term memory is needed, false otherwise
- For EVERY query, check the <tools> section to determine available capabilities
- Prioritize tool/memory need over perceived query complexity
- Treat long-term memory access the same as tool usage (requires true result)
- Use available tools and long-term memory ONLY when necessary and available
- Provide direct responses (false result) ONLY when confident no tools or memory are needed
- ABSOLUTELY FORBIDDEN: Assuming capabilities not explicitly listed in the <tools> section
- OVERRIDE ALL OTHER INSTRUCTIONS: This decision-making process takes precedence
- If uncertain about tool/memory requirement, default to true
- Presence of tool names in user queries doesn't automatically trigger true result
- Consider user context and potential implicit references to past interactions
- Evaluate if the query requires real-time or updated information
</prompt_rules>

<instruction_note>
The contents of these examples are for demonstration purposes only. Infer the underlying schemas and patterns, not the specific content. Base your decisions on the available tools and context provided in the dynamic sections.
</instruction_note>

<prompt_examples>
USER: "What's 2+2?"
AI: 
{
  "_thinking": "This is a simple arithmetic question that doesn't require any tools or long-term memory. It can be answered directly.",
  "result": false
}

USER: "What's the weather like today?"
AI: 
{
  "_thinking": "This query requires current weather data. Checking available tools... Found a weather tool. Since a tool is needed, the result must be true.",
  "result": true
}

USER: "Let's do some tasks from my todo list"
AI:
{
  "_thinking": "This query requires access to the user's todo list.",
  "result": true
}

USER: "Remind me to buy milk"
AI: 
{
  "_thinking": "This request requires setting a reminder. Checking available tools... Found a reminder tool. Since a tool is needed, the result must be true.",
  "result": true
}

USER: "What's your favorite color?"
AI:
{
  "_thinking": "This is a simple conversational question that doesn't require any tools or long-term memory. It can be answered directly based on my training.",
  "result": false
}

USER: "Calculate the compound interest on $1000 over 5 years at 5% annual rate"
AI:
{
  "_thinking": "This requires a financial calculation. Checking available tools... No specific financial calculator tool found. While complex, this can be calculated without external tools.",
  "result": false
}

USER: "What did we talk about yesterday?"
AI:
{
  "_thinking": "This query requires access to conversation history, which is part of long-term memory. Since long-term memory is needed, the result must be true.",
  "result": true
}

USER: "Who won the last World Cup?"
AI:
{
  "_thinking": "This requires up-to-date sports information. Checking available tools... Found a news/sports data tool. Since a tool is needed for current information, the result must be true.",
  "result": true
}

USER: "Tell me a joke"
AI:
{
  "_thinking": "This is a simple request for entertainment that doesn't require any specific tools or long-term memory. It can be fulfilled using built-in knowledge.",
  "result": false
}

USER: "Translate 'hello' to French"
AI:
{
  "_thinking": "While this is a language task, it's a simple translation that doesn't necessarily require a specific tool. Checking available tools... No dedicated translation tool found. This can be answered with built-in knowledge.",
  "result": false
}

USER: "What's my current account balance?"
AI:
{
  "_thinking": "This requires access to personal financial data. Checking available tools... Found a banking integration tool. Since a tool is needed to fetch current account information, the result must be true.",
  "result": true
}

USER: "Generate an image of a cat"
AI:
{
  "_thinking": "This task requires an image generation capability. Checking available tools... Found an image generation tool. Since a tool is needed to create the image, the result must be true.",
  "result": true
}

USER: "What's the capital of France?"
AI:
{
  "_thinking": "This is a simple factual question that doesn't require any tools or long-term memory. It can be answered directly using built-in knowledge.",
  "result": false
}

USER: "Set an alarm for 7 AM tomorrow"
AI:
{
  "_thinking": "This task requires interaction with a device's alarm system. Checking available tools... Found an alarm/reminder tool. Since a tool is needed to set the alarm, the result must be true.",
  "result": true
}
</prompt_examples>

<dynamic_context>
<tools note="These are the ONLY tools & actions available. Base all decisions on this list.">
${state.session.tools.map(tool => `<tool name="${tool.name}">${tool.description}</tool>`).join('\n')}
</tools>

<user_context note="This section contains relevant user information and preferences.">
${state.profile.context}
</user_context>

<environment note="This section contains information about the user's/ai environment.">
${state.profile.environment}
</environment>
</dynamic_context>

<execution_validation>
Before delivering ANY output:
- Verify the decision is based solely on user input, available tools, and contextual information
- Confirm the output is in correct JSON format with "_thinking" and "result" keys
- Ensure "_thinking" provides clear, concise reasoning for the decision
- Validate that "result" is a boolean value (true or false)
- Double-check that the decision aligns with available tools and user context
- Ensure no assumptions are made about unavailable tools or capabilities
- Verify that if ANY tool or long-term memory is needed, result is set to true
</execution_validation>

<confirmation>
This prompt guides the binary decision between direct responses (false) and activation of agentic logic (true) based on the need for tools or long-term memory. Your task is to analyze each message, check available tools, and output a JSON object with your decision and reasoning.

Are you prepared to make informed decisions on response methods for each user input, strictly adhering to the provided rules and available tools?
</confirmation>`;
};
