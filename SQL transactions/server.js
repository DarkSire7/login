const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

const db = new sqlite3.Database('./orders.db', (err) => {
    if (err) {
        console.error('DB error:', err);
    } else {
        console.log('Connected to orders database.');
    }
});

// Create orders table
db.run(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item TEXT,
    phone TEXT,
    amount REAL,
    date TEXT,
    time TEXT,
    status TEXT DEFAULT 'pending'
  )
`);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve order form page
app.get('/order', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Endpoint to handle placing an order
app.post('/place-order', (req, res) => {
    const { item, phone, amount } = req.body;
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();

    db.run(
        `INSERT INTO orders (item, phone, amount, date, time, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [item, phone, amount, date, time, 'pending'],
        (err) => {
            if (err) {
                console.error(err);
                res.send('Error placing order.');
            } else {
                res.send(`Order placed! <a href="/orders">View orders</a>`);
            }
        }
    );
});


// Mark order as prepared
app.post('/mark-prepared/:id', (req, res) => {
    const id = req.params.id;
    db.run(`UPDATE orders SET status = 'prepared' WHERE id = ?`, [id], (err) => {
        if (err) {
            console.error(err);
            res.status(500).send('Failed to update order.');
        } else {
            res.send('Order marked as prepared.');
        }
    });
});

// Mark order as picked up
app.post('/mark-pickedup/:id', (req, res) => {
    const id = req.params.id;
    db.run(`UPDATE orders SET status = 'pickedup' WHERE id = ?`, [id], (err) => {
        if (err) {
            console.error('Pickedup error:', err);
            res.status(500).send('Failed to update order.');
        } else {
            res.send('Order marked as picked up.');
        }
    });
});



// Fetch all orders
app.get('/api/orders', (req, res) => {
    db.all(`SELECT * FROM orders ORDER BY id DESC`, (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch orders' });
        } else {
            res.json(rows);
        }
    });
});


app.get('/', (req, res) => {
    res.redirect('/order');
});

// Serve orders display page
app.get('/orders', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});



app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
