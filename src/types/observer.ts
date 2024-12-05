import { Langfuse, LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';

export type LangfuseState = {
    langfuse: Langfuse;
    traces: Map<string, LangfuseTraceClient>;
    spans: Map<string, LangfuseSpanClient>;
    generations: Map<string, LangfuseGenerationClient>;
  };