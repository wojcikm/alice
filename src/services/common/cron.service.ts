import { eq, and, lte, isNull } from 'drizzle-orm';
import parser from 'cron-parser';
import { v4 as uuidv4 } from 'uuid';
import db from '../../database/db';
import { jobs } from '../../schema/jobs';
import type { Job, NewJob } from '../../schema/jobs';
import type { Task } from '../../schema/task';
import { taskService } from '../agent/task.service';
import { conversationService } from '../agent/conversation.service';

interface CreateJobParams {
  name: string;
  type: 'cron' | 'scheduled' | 'recurring';
  schedule: string;
  task_uuid: string;
  metadata?: Record<string, any>;
}

export const cronService = {
  private_interval: null as NodeJS.Timer | null,

  async initialize(check_interval = 60000) {
    if (this.private_interval) {
      clearInterval(this.private_interval);
    }
    
    console.log('Starting cron service with check interval:', check_interval);
    this.private_interval = setInterval(async () => {
      try {
        await this.checkJobs();
      } catch (error) {
        console.error('Error in checkJobs interval:', error);
      }
    }, check_interval);
    
    // Run immediately on start
    this.checkJobs().catch(error => console.error('Error in initial checkJobs:', error));
    console.log('Cron service initialized');
  },

  async createJob({ name, type, schedule, task_uuid, metadata }: CreateJobParams): Promise<Job> {
    let next_run: string;

    try {
      if (type === 'cron') {
        const interval = parser.parseExpression(schedule, {
          tz: 'Europe/Warsaw'
        });
        next_run = interval.next().toDate().toISOString();
      } else if (type === 'scheduled' || type === 'recurring') {
        next_run = new Date(schedule).toISOString();
      } else {
        throw new Error('Invalid job type');
      }

      const newJob: NewJob = {
        uuid: uuidv4(),
        name,
        type,
        schedule,
        task_uuid,
        next_run,
        metadata: metadata ? JSON.stringify(metadata) : null,
        status: 'pending'
      };

      const [job] = await db.insert(jobs).values(newJob).returning();
      return job;
    } catch (error) {
      console.error('Failed to create job:', error);
      throw error;
    }
  },

  async checkJobs() {
    // console.log('Checking for pending jobs...');
    try {
      // Convert current time to Poland timezone
      const currentTime = new Date().toLocaleString('en-US', { 
        timeZone: 'Europe/Warsaw',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6Z');

    //   console.log('Current time:', currentTime);

      const pending_jobs = await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.status, 'pending'),
            lte(jobs.next_run, currentTime)
          )
        );

    //   console.log('Pending jobs:', pending_jobs);

    //   console.log(`Found ${pending_jobs.length} pend÷śing jobs`);

      for (const job of pending_jobs) {
        console.log(`Processing job: ${job.uuid} (${job.name})`);
        await this.processJob(job);
      }
    } catch (error) {
      console.error('Error checking jobs:', error);
    }
  },

  async processJob(job: Job) {
    console.log(`Starting to process job ${job.uuid}`);
    try {
      await db
        .update(jobs)
        .set({ status: 'running' })
        .where(eq(jobs.uuid, job.uuid));
      console.log(`Job ${job.uuid} marked as running`);

      const conversation_uuid = uuidv4();
      const task = await taskService.createTasks(conversation_uuid, [{
        name: job.name,
        description: job.metadata?.description || '',
        status: 'pending',
        uuid: job.task_uuid
      }]);

      const execution_result = await this.executeJob(job);
      console.log(`Job ${job.uuid} executed with result:`, execution_result);

      let next_run: string | null = null;
      if (job.type === 'cron') {
        const interval = parser.parseExpression(job.schedule, {
          currentDate: new Date(),
          iterator: true,
          tz: 'Europe/Warsaw'
        });
        next_run = interval.next().value.toISOString();
        console.log(`Next run for job ${job.uuid} scheduled at:`, next_run);
      } else if (job.type === 'recurring') {
        next_run = new Date(job.schedule).toISOString();
      }

      await db
        .update(jobs)
        .set({
          status: next_run ? 'pending' : 'completed',
          last_run: new Date().toISOString(),
          next_run,
          result: JSON.stringify(execution_result),
          updated_at: new Date().toISOString()
        })
        .where(eq(jobs.uuid, job.uuid));
      console.log(`Job ${job.uuid} completed and updated`);

    } catch (error: any) {
      console.error(`Error processing job ${job.uuid}:`, error);
      await db
        .update(jobs)
        .set({
          status: 'failed',
          result: JSON.stringify({
            error: error.message,
            timestamp: new Date().toISOString()
          }),
          updated_at: new Date().toISOString()
        })
        .where(eq(jobs.uuid, job.uuid));
    }
  },

  async executeJob(job: Job) {
    console.log(`Executing job ${job.uuid}`);
    try {
      const conversation_uuid = uuidv4();
      const metadata = typeof job.metadata === 'string' 
        ? JSON.parse(job.metadata)
        : job.metadata;

      // Create conversation first
      await conversationService.create({
        uuid: conversation_uuid,
        user_id: 'system', // Since this is a system-initiated task
        name: `Scheduled Task: ${job.name}`
      });

      // Create task with proper data structure
      const task_data = [{
        name: job.name,
        description: metadata?.description || '',
        status: 'pending' as const,
        uuid: null
      }];

      console.log('Creating task with data:', {
        conversation_uuid,
        task_data
      });

      const tasks = await taskService.createTasks(conversation_uuid, task_data);

      console.log('Created tasks:', tasks);

      if (!tasks.length || !tasks[0]) {
        throw new Error('Failed to create task');
      }

      // Query /api/agi/chat with conversation_uuid and metadata description
      const description = metadata?.description || job.name;
      await queryAgiChat(conversation_uuid, description);

      return {
        status: 'success',
        execution_time: new Date().toISOString(),
        job_id: job.uuid,
        task_id: tasks[0].uuid
      };
    } catch (error) {
      console.error(`Error executing job ${job.uuid}:`, error);
      throw error;
    }
  },

  async cancelJob(job_uuid: string): Promise<void> {
    try {
      await db
        .update(jobs)
        .set({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .where(eq(jobs.uuid, job_uuid));
    } catch (error) {
      console.error('Error cancelling job:', error);
      throw error;
    }
  },

  async getJob(job_uuid: string): Promise<Job | null> {
    try {
      const [job] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.uuid, job_uuid));
      return job || null;
    } catch (error) {
      console.error('Error getting job:', error);
      throw error;
    }
  },

  async cleanup() {
    if (this.private_interval) {
      clearInterval(this.private_interval);
      this.private_interval = null;
    }
  }
};

async function queryAgiChat(conversation_uuid: string, description: string) {
  try {
    const base_url = process.env.APP_URL || 'http://localhost:3000';
    const api_key = process.env.API_KEY;

    if (!api_key) {
      throw new Error('API_KEY environment variable is not set');
    }

    const response = await fetch(`${base_url}/api/agi/chat`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + api_key
      },
      body: JSON.stringify({
        conversation_id: conversation_uuid,
        messages: [{ role: 'user', content: `The system has asked you to do the following task due to the schedule: ${description}. \n\n Ensure that the plan of tasks and actions is valid so you can perform it.` }]
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to query AGI chat: ${response.status}`);
    }

    console.log('AGI chat queried successfully');
  } catch (error) {
    console.error('Error querying AGI chat:', error);
    throw error;
  }
}
