import {Resend} from 'resend';
import {z} from 'zod';
import {LangfuseSpanClient} from 'langfuse';
import {marked} from 'marked';
import {DocumentMetadata} from '../../types/document';
import {documentService} from '../agent/document.service';
import type {DocumentType} from '../agent/document.service';
import { stateManager } from '../agent/state.service';
import {documents} from '../../schema/document';
import {eq} from 'drizzle-orm';
import db from '../../database/db';

const envSchema = z.object({
  RESEND_API_KEY: z.string(),
  FROM_EMAIL: z.string().email(),
  USER_EMAIL: z.string().email()
});

interface Attachment {
  filename: string;
  content: Buffer;
}

interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
}

const resendService = {
  createClient: (): Resend => {
    const env = envSchema.parse(process.env);
    return new Resend(env.RESEND_API_KEY);
  },

  sendEmail: async (payload: EmailPayload, span?: LangfuseSpanClient): Promise<string> => {
    try {
      const client = resendService.createClient();
      const html = payload.text ? await marked(payload.text) : payload.html;

      const {data} = await client.emails.send({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text ?? 'no-content',
        html,
        attachments: payload.attachments
      });

      span?.event({
        name: 'email_sent',
        input: {
          to: payload.to,
          subject: payload.subject
        }
      });

      return data?.id ?? '';
    } catch (error) {
      span?.event({
        name: 'email_error',
        input: {
          to: payload.to,
          subject: payload.subject
        },
        output: {error: error instanceof Error ? error.message : 'Unknown error'},
        level: 'ERROR'
      });
      throw error;
    }
  },

  handleEmailSend: async (payload: EmailPayload, conversation_uuid: string, span?: LangfuseSpanClient): Promise<DocumentType> => {
    try {
      await resendService.sendEmail(payload, span);

      return documentService.createDocument({
        conversation_uuid,
        source_uuid: conversation_uuid,
        text: `Email has been sent successfully\nSubject: ${payload.subject}\nTo: ${payload.to}`,
        metadata_override: {
          type: 'text',
          content_type: 'full',
          tokens: 0,
          source: 'resend',
          name: 'SendEmailSuccess',
          description: `Successfully sent email with subject: "${payload.subject}"`
        }
      });
    } catch (error) {
      return documentService.createDocument({
        conversation_uuid,
        source_uuid: conversation_uuid,
        text: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata_override: {
          type: 'text',
          source: 'resend',
          name: 'SendEmailError',
          description: 'Failed to send email'
        }
      });
    }
  },

  prepareAttachments: async (attachment_uuids: string[]): Promise<Attachment[]> => {
    const attachments: Attachment[] = [];

    for (const uuid of attachment_uuids) {
      try {
        const document = await documentService.getDocumentByUuid(uuid);

        if (!document) {
          continue;
        }

        const { text, metadata } = document;
        const filename = metadata.name ?? `${uuid}.txt`;

        attachments.push({
          filename,
          content: Buffer.from(text)
        });
      } catch (error) {
        console.error(`Failed to process attachment ${uuid}:`, error);
      }
    }

    return attachments;
  },

  execute: async (action: string, payload: any, span?: LangfuseSpanClient): Promise<DocumentType> => {
    if (action !== 'send_email') {
      throw new Error(`Unknown action: ${action}`);
    }

    const state = stateManager.getState();

    try {
      const env = envSchema.parse(process.env);
      const attachments = payload.attachments 
        ? await resendService.prepareAttachments(payload.attachments)
        : undefined;

      const email_payload: EmailPayload = {
        from: env.FROM_EMAIL,
        to: payload.to ?? env.USER_EMAIL,
        subject: payload.subject,
        text: payload.text,
        attachments
      };

      span?.event({
        name: 'tool_resend',
        input: {
          action,
          to: email_payload.to,
          subject: email_payload.subject,
          attachment_count: attachments?.length
        }
      });

      return resendService.handleEmailSend(email_payload, state.config.conversation_uuid ?? 'unknown', span);
    } catch (error) {
      return documentService.createDocument({
        conversation_uuid: state.config.conversation_uuid ?? 'unknown',
        source_uuid: state.config.conversation_uuid ?? 'unknown',
        text: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata_override: {
          type: 'text',
          source: 'resend',
          name: 'SendEmailError',
          description: 'Failed to send email'
        }
      });
    }
  }
};

export {resendService};
