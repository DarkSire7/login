const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const { Vonage } = require('@vonage/server-sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require('crypto');
const Razorpay = require('razorpay'); // Add Razorpay SDK

const app = express();
const PORT = 3000;

// ✅ Vonage config (working)
const vonage = new Vonage({
  apiKey: '1fa5205f',
  apiSecret: 'yjRaTmkVfdFVDS2I'
});

// Initialize Razorpay with your API keys
const razorpay = new Razorpay({
  key_id: 'rzp_test_VCIn0ydmyceB7m',
  key_secret: 'adWjNivAm8hikywgCepwNsrC'
});

// Initialize Google Gemini API with the correct key
const GEMINI_API_KEY = "AIzaSyB_x5tgrCFdfe-YXFzuFMl5XaeblvbJ9tI";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// Models are listed at: https://ai.google.dev/models/gemini

const db = new sqlite3.Database('./orders.db', (err) => {
  if (err) {
    console.error('DB error:', err);
  } else {
    console.log('Connected to orders database.');
  }
});

// Add token field to the orders table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item TEXT,
    phone TEXT,
    amount REAL,
    date TEXT,
    time TEXT,
    status TEXT DEFAULT 'pending',
    token TEXT,
    payment_id TEXT,
    payment_status TEXT DEFAULT 'pending'
  )
`, (err) => {
  if (err) {
    console.error('Error creating table:', err);
  } else {
    // Check if required columns exist, if not add them
    db.all("PRAGMA table_info(orders)", (err, rows) => {
      if (err) {
        console.error("Error checking database schema:", err);
        return;
      }

      console.log("Database schema rows:", rows);

      // Check if columns exist and add them if they don't
      const requiredColumns = [
        { name: 'token', type: 'TEXT' },
        { name: 'payment_id', type: 'TEXT' },
        { name: 'payment_status', type: 'TEXT DEFAULT "pending"' }
      ];

      requiredColumns.forEach(column => {
        if (!rows.some(row => row.name === column.name)) {
          db.run(`ALTER TABLE orders ADD COLUMN ${column.name} ${column.type}`, (err) => {
            if (err) {
              console.error(`Error adding ${column.name} column:`, err);
            } else {
              console.log(`Added ${column.name} column to orders table`);
            }
          });
        } else {
          console.log(`${column.name} column already exists in orders table`);
        }
      });
    });
  }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Generate a unique token for each order
function generateToken() {
  // Generate a 5-character alphanumeric token
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Serve order form page
app.get('/order', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Place an order and initiate payment
app.post('/place-order', (req, res) => {
  const { item, phone, amount } = req.body;
  const token = generateToken();

  const razorpayOptions = {
    amount: Math.round(amount * 100),
    currency: "INR",
    receipt: `temp_${token}`,
    notes: { item, phone, token }
  };

  razorpay.orders.create(razorpayOptions, (err, razorpayOrder) => {
    if (err) {
      console.error("Razorpay order creation error:", err);
      return res.status(500).json({ error: 'Failed to initiate payment' });
    }

    res.json({
    success: true,
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    token: token,
    key: razorpay.key_id,
    item: item,
    phone: phone
  });

  });
});


// Payment verification and completion
app.post('/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, item, phone, amount, token } = req.body;

  // Generate signature string exactly as Razorpay expects
  const generatedSignature = crypto
    .createHmac('sha256', razorpay.key_secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (generatedSignature === razorpay_signature) {
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();

    // Check if an order with this token exists
    db.get(`SELECT * FROM orders WHERE token = ?`, [token], (err, row) => {
      if (err) {
        console.error("Error fetching order:", err);
        return res.status(500).json({ error: 'Failed to verify order' });
      }

      if (row) {
        // If order already exists, update it
        db.run(
          `UPDATE orders SET payment_status = ?, status = ?, payment_id = ?, date = ?, time = ? WHERE token = ?`,
          ['completed', 'completed', razorpay_payment_id, date, time, token],
          function (err) {
            if (err) {
              console.error("Error updating order after payment:", err);
              return res.status(500).json({ error: 'Failed to update order' });
            }

            // Send confirmation SMS
            const from = "SwiftBites";
            const text = `Your order for "${item}" has been placed and payment received! Your order token is: ${token}. We'll notify you when it's ready.`;

            vonage.sms.send({ to: phone, from, text })
              .then(() => console.log("Confirmation SMS sent"))
              .catch(error => console.error("Vonage SMS error:", error));

            res.json({
              success: true,
              token: token,
              message: "Payment verified and order confirmed!",
              orderId: row.id
            });
          }
        );
      } else {
        // No existing order, insert new
        db.run(
          `INSERT INTO orders (item, phone, amount, date, time, status, token, payment_status, payment_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item, phone, amount, date, time, 'pending', token, 'completed', razorpay_payment_id],
          function (err) {
            if (err) {
              console.error("Error inserting order after payment:", err);
              return res.status(500).json({ error: 'Failed to save order' });
            }

            // Send confirmation SMS
            const from = "SwiftBites";
            const text = `Your order for "${item}" has been placed and payment received! Your order token is: ${token}. We'll notify you when it's ready.`;

            vonage.sms.send({ to: phone, from, text })
              .then(() => console.log("Confirmation SMS sent"))
              .catch(error => console.error("Vonage SMS error:", error));

            res.json({
              success: true,
              token: token,
              message: "Payment verified and order confirmed!",
              orderId: this.lastID
            });
          }
        );
      }
    });
  } else {
    // Signature mismatch
    res.status(400).json({ success: false, error: 'Payment verification failed' });
  }
});




// ✅ Mark order as prepared and send SMS
app.post('/mark-prepared/:id', async (req, res) => {
  const id = req.params.id;

  db.get(`SELECT phone, item, token FROM orders WHERE id = ?`, [id], async (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to retrieve order.');
    }
    if (!row) {
      return res.status(404).send('Order not found.');
    }

    const { phone, item, token } = row;

    db.run(`UPDATE orders SET status = 'prepared' WHERE id = ?`, [id], async (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Failed to update status.');
      }

      const from = "SwiftBites";
      const text = `Your order #${token} for "${item}" is prepared and ready for pickup! Please show this message when collecting your order.`;

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

// AI Insights API
app.get('/api/order-insights', async (req, res) => {
  db.all(`SELECT * FROM orders ORDER BY id DESC`, async (err, orders) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch orders' });
      return;
    }

    // Check if orders array is empty
    if (orders.length === 0) {
      return res.json({
        insights: "No orders found. Place some orders to generate insights."
      });
    }

    try {
      // Generate insights locally instead of using API
      const insights = generateLocalInsights(orders);
      res.json({ insights });
    } catch (error) {
      console.error('Error generating insights:', error);
      // If local generation fails, return basic stats
      const basicInsights = generateBasicStats(orders);
      res.json({ insights: basicInsights });
    }
  });
});

// Function to generate insights locally without API
function generateLocalInsights(orders) {
  // Calculate total revenue
  const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.amount), 0).toFixed(2);

  // Count items and find top sellers
  const itemCounts = {};
  orders.forEach(order => {
    itemCounts[order.item] = (itemCounts[order.item] || 0) + 1;
  });

  // Sort items by frequency
  const sortedItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([item, count]) => ({ item, count }));

  // Get top 3 items (or less if fewer exist)
  const topItems = sortedItems.slice(0, Math.min(3, sortedItems.length));

  // Calculate average order value
  const averageOrderValue = (totalRevenue / orders.length).toFixed(2);

  // Count orders by status
  const ordersByStatus = {
    pending: orders.filter(o => o.status === 'pending').length,
    prepared: orders.filter(o => o.status === 'prepared').length,
    pickedup: orders.filter(o => o.status === 'pickedup').length
  };

  // Count orders by payment status
  const ordersByPayment = {
    pending: orders.filter(o => o.payment_status === 'pending').length,
    completed: orders.filter(o => o.payment_status === 'completed').length
  };

  // Build insights string
  let insights = `# Business Insights Report\n\n`;

  insights += `## Order Summary\n`;
  insights += `- Total Orders: ${orders.length}\n`;
  insights += `- Total Revenue: $${totalRevenue}\n`;
  insights += `- Average Order Value: $${averageOrderValue}\n\n`;

  insights += `## Top Selling Items\n`;
  topItems.forEach((item, index) => {
    insights += `${index + 1}. ${item.item} (${item.count} orders)\n`;
  });
  insights += `\n`;

  insights += `## Order Status Breakdown\n`;
  insights += `- Pending: ${ordersByStatus.pending}\n`;
  insights += `- Prepared: ${ordersByStatus.prepared}\n`;
  insights += `- Picked Up: ${ordersByStatus.pickedup}\n\n`;
  
  insights += `## Payment Status Breakdown\n`;
  insights += `- Payment Pending: ${ordersByPayment.pending}\n`;
  insights += `- Payment Completed: ${ordersByPayment.completed}\n\n`;

  insights += `## Recommendations\n`;

  // Add recommendations based on the data
  if (topItems.length > 0) {
    insights += `- Consider promoting your top seller "${topItems[0].item}" more prominently\n`;
  }

  if (ordersByStatus.pending > ordersByStatus.prepared * 2) {
    insights += `- The kitchen might need more staff as there are many pending orders\n`;
  }

  if (averageOrderValue < 15) {
    insights += `- Try offering combo deals to increase average order value\n`;
  } else {
    insights += `- Your average order value is good, consider loyalty rewards for repeat customers\n`;
  }
  
  if (ordersByPayment.pending > ordersByPayment.completed * 0.5) {
    insights += `- Review your payment process, many customers are abandoning payment\n`;
  }

  return insights;
}

// Fallback function to generate basic stats if even local insights generation fails
function generateBasicStats(orders) {
  const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.amount), 0).toFixed(2);
  const completedPayments = orders.filter(o => o.payment_status === 'completed').length;
  return `Total Orders: ${orders.length}\nTotal Revenue: $${totalRevenue}\nCompleted Payments: ${completedPayments}`;
}

// Home route
app.get('/', (req, res) => {
  res.redirect('/order');
});

// Orders UI
app.get('/orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});

// Insights UI
app.get('/insights', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'insights.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});