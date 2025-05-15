const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const { Vonage } = require('@vonage/server-sdk');

const app = express();
const PORT = 3000;

// ✅ Vonage config (working)
const vonage = new Vonage({
  apiKey: '1fa5205f',
  apiSecret: 'yjRaTmkVfdFVDS2I'
});

const db = new sqlite3.Database('./orders.db', (err) => {
  if (err) {
    console.error('DB error:', err);
  } else {
    console.log('Connected to orders database.');
  }
});

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
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve order form page
app.get('/order', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Place an order
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

// ✅ Mark order as prepared and send SMS
app.post('/mark-prepared/:id', async (req, res) => {
  const id = req.params.id;

  db.get(`SELECT phone, item FROM orders WHERE id = ?`, [id], async (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to retrieve order.');
    }
    if (!row) {
      return res.status(404).send('Order not found.');
    }

    const { phone, item } = row;

    db.run(`UPDATE orders SET status = 'prepared' WHERE id = ?`, [id], async (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Failed to update status.');
      }

      const from = "SwiftBites";
      const text = `Your order for "${item}" is prepared and ready for pickup!`;

      try {
        const response = await vonage.sms.send({ to: phone, from, text });
        console.log("SMS sent:", response);
        res.send('Order marked as prepared and SMS sent.');
      } catch (error) {
        console.error("Vonage SMS error:", error);
        res.status(500).send('Order updated but failed to send SMS.');
      }
    });
  });
});

// Mark as picked up
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

// Home route
app.get('/', (req, res) => {
  res.redirect('/order');
});

// Orders UI
app.get('/orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
