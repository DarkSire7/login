const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Connect to SQLite database
const db = new sqlite3.Database('./mydatabase.db', (err) => {
    if (err) {
        console.error('Database opening error:', err);
    } else {
        console.log('Connected to SQLite database.');
    }
});

// Create 'transactions' table if it doesn’t exist
db.run(`CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT,
  phone TEXT,
  amount REAL,
  date TEXT,
  time TEXT
)`);

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve order form page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Handle order form submission
app.post('/order', (req, res) => {
    const { item, phone, amount } = req.body;

    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();

    db.run(
        `INSERT INTO transactions (item, phone, amount, date, time) VALUES (?, ?, ?, ?, ?)`,
        [item, phone, amount, date, time],
        function (err) {
            if (err) {
                console.error(err);
                res.send('Error saving transaction.');
            } else {
                res.send(`Order placed successfully! <a href="/">Place another</a>`);
            }
        }
    );
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
