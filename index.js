const express = require('express');
const { Client } = require('pg');
const { DefaultAzureCredential } = require('@azure/identity');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const port = 3000;

// Middleware to parse JSON request bodies
app.use(express.json());

// PostgreSQL connection helper using Azure Default Credential
async function createDbClient() {
  // Instantiate the Azure Default Credential
  const credential = new DefaultAzureCredential();
  const resource = "https://ossrdbms-aad.database.windows.net";
  
  // Get the access token for PostgreSQL
  const tokenResponse = await credential.getToken(resource);
  if (!tokenResponse || !tokenResponse.token) {
    throw new Error('Failed to obtain Azure AD token');
  }

  // Create and return PostgreSQL client with Azure AD token as the password
  const client = new Client({
    host: process.env.AZURE_POSTGRESQL_HOST,
    database: process.env.AZURE_POSTGRESQL_DATABASE,
    user: process.env.AZURE_POSTGRESQL_USER,
    password: tokenResponse.token, // Azure AD token used as password
    port: process.env.AZURE_POSTGRESQL_PORT,
    ssl: true, // Set SSL options for production environments
  });

  return client;
}

// Initialize the database by creating the 'items' table if it doesn't exist
async function initializeDb() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT
    );
  `;
  
  try {
    const client = await createDbClient();
    await client.connect();
    await client.query(createTableQuery);
    await client.end();
    console.log('Table "items" is ready');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Call initializeDb when the server starts
initializeDb();

// CRUD Routes (Open for Postman without authentication)

// Create a new item
app.post('/items', async (req, res) => {
  const { name, description } = req.body;

  // Log the incoming request body for debugging
  console.log('Request Body:', req.body);

  // Validate the input
  if (!name || !description) {
    return res.status(400).json({ message: 'Both name and description are required' });
  }

  try {
    const client = await createDbClient();
    await client.connect();

    // Insert the new item into the database
    const result = await client.query(
      'INSERT INTO items (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );

    await client.end();
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ message: 'Error creating item' });
  }
});

// Get all items
app.get('/items', async (req, res) => {
  try {
    const client = await createDbClient();
    await client.connect();

    // Fetch all items from the database
    const result = await client.query('SELECT * FROM items');
    await client.end();
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Error fetching items' });
  }
});

// Update an item by ID
app.put('/items/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  // Validate the input
  if (!name || !description) {
    return res.status(400).json({ message: 'Both name and description are required' });
  }

  try {
    const client = await createDbClient();
    await client.connect();

    // Update the item in the database
    const result = await client.query(
      'UPDATE items SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name, description, id]
    );

    await client.end();
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Error updating item' });
  }
});

// Delete an item by ID
app.delete('/items/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const client = await createDbClient();
    await client.connect();

    // Delete the item from the database
    const result = await client.query('DELETE FROM items WHERE id = $1 RETURNING *', [id]);

    await client.end();
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Error deleting item' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
