 // Step 1: Import required modules
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');


// Step 2: Initialize Express app
const app = express();
const PORT = 3000;

// Step 3: Connect to SQLite database (creates file if it doesn't exist)
const db = new sqlite3.Database('./mydatabase.db', (err) => {
  if (err) {
    console.error('Database opening error:', err);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Step 4: Create 'users' table if it doesn’t exist
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
)`);

// Step 5: Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));

// Step 6: Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve signup page
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});


// Step 7: Route to serve login page (from public/login.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Step 8: Handle login POST requests
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
    if (err) {
      console.error(err);
      res.send('An error occurred.');
    } else if (!row) {
      res.send('Invalid credentials. <a href="/">Try again</a>');
    } else {
      // Compare entered password with stored hash
      bcrypt.compare(password, row.password, (err, result) => {
        if (result) {
          res.send(`Welcome, ${username}!`);
        } else {
          res.send('Invalid credentials. <a href="/">Try again</a>');
        }
      });
    }
  });
});


// Step 9: Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});


app.post('/signup', (req, res) => {
  const { username, password } = req.body;

  // Generate a salt and hash the password
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error(err);
      res.send('Error hashing password.');
      return;
    }

    // Insert new user with hashed password
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          res.send('Username already exists. <a href="/signup">Try again</a>');
        } else {
          console.error(err);
          res.send('An error occurred during signup.');
        }
      } else {
        res.send(`Account created successfully! <a href="/">Login now</a>`);
      }
    });
  });
});


