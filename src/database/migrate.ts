import {migrate} from 'drizzle-orm/bun-sqlite/migrator';
import db from './db';

// This will automatically run needed migrations on the database
migrate(db, {migrationsFolder: './src/database/migrations'});

console.log('Migrations complete');
