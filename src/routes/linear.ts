import { Hono } from 'hono';
import { AppEnv } from '../types/hono';
import { linearService } from '../services/tools/linear.service';

const linear = new Hono<AppEnv>()
  .get('/projects', async c => {
    try {
      const projects = await linearService.fetchProjects();
      return c.json({ 
        success: true, 
        data: projects.map(project => ({
          uuid: project.id,
          name: project.name,
          description: project.description,
          state: project.state
        }))
      });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  })
  .get('/states', async c => {
    try {
      const states = await linearService.fetchTeamStates();
      return c.json({ 
        success: true, 
        data: states.map(state => ({
          uuid: state.id,
          name: state.name,
          type: state.type,
          color: state.color
        }))
      });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

export default linear; 