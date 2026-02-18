import { Client } from 'pg';

async function createDatabase() {
    const client = new Client({
        connectionString: 'postgresql://postgres:123@localhost:5432/postgres',
    });

    try {
        await client.connect();

        // Check if database exists
        const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'orbia'");
        if (res.rowCount === 0) {
            console.log("Database 'orbia' not found. Creating...");
            await client.query('CREATE DATABASE orbia');
            console.log("Database 'orbia' created successfully.");
        } else {
            console.log("Database 'orbia' already exists.");
        }
    } catch (err) {
        console.error('Error creating database:', err);
    } finally {
        await client.end();
    }
}

createDatabase();
