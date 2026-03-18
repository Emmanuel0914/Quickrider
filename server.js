const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const dbFile = 'database.json';

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname))); 

// --- CORE ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/vendor', (req, res) => res.sendFile(path.join(__dirname, 'vendor.html')));
app.get('/rider', (req, res) => res.sendFile(path.join(__dirname, 'rider.html')));

// --- AUTHENTICATION ---
app.post('/vendor-auth', (req, res) => {
    const { username, password } = req.body;
    let vendors = fs.existsSync('vendors.json') ? JSON.parse(fs.readFileSync('vendors.json')) : [];
    let vendor = vendors.find(v => v.username === username);
    if (vendor) {
        if (vendor.password === password) res.status(200).json({ message: "Login successful" });
        else res.status(401).json({ message: "Invalid credentials" });
    } else {
        vendors.push({ username, password });
        fs.writeFileSync('vendors.json', JSON.stringify(vendors, null, 2));
        res.status(200).json({ message: "Account created" });
    }
});

app.post('/rider-auth', (req, res) => {
    const username = req.body.username.toLowerCase(); 
    const { password, name, plate, guarantor, selfie, bikePhoto } = req.body;
    let riders = fs.existsSync('riders.json') ? JSON.parse(fs.readFileSync('riders.json')) : [];
    let rider = riders.find(r => r.username === username);
    
    if (rider) {
        if (rider.password === password) res.status(200).json({ message: "Login successful", profile: rider });
        else res.status(401).json({ message: "Invalid credentials" });
    } else {
        if (!name || !plate || !guarantor || !selfie || !bikePhoto) return res.status(400).json({ message: "All KYC fields required." });
        rider = { username, password, name, plate, guarantor, selfie, bikePhoto, verified: false };
        riders.push(rider);
        fs.writeFileSync('riders.json', JSON.stringify(riders, null, 2));
        res.status(200).json({ message: "Account created. Pending KYC.", profile: rider });
    }
});

app.get('/rider/status', (req, res) => {
    const username = req.query.username.toLowerCase();
    let riders = fs.existsSync('riders.json') ? JSON.parse(fs.readFileSync('riders.json')) : [];
    let rider = riders.find(r => r.username === username);
    if (rider) res.json({ verified: rider.verified });
    else res.status(404).json({ message: "Not found" });
});

// --- NEW ESCROW LOGIC ---
app.post('/order', (req, res) => {
    const order = { ...req.body, id: Date.now().toString(), status: 'Pending Rider' };
    let orders = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile)) : [];
    orders.push(order);
    fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
    res.status(200).json({ message: 'Order created', id: order.id });
});

app.get('/orders', (req, res) => {
    const orders = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile)) : [];
    res.status(200).json(orders);
});

app.post('/accept', (req, res) => {
    const { id, riderName, riderPlate } = req.body;
    let orders = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile)) : [];
    let orderIndex = orders.findIndex(o => o.id === id);
    if (orderIndex !== -1) {
        orders[orderIndex].status = 'Awaiting Escrow'; // NEW: Waiting for vendor to pay
        orders[orderIndex].riderName = riderName;
        orders[orderIndex].riderPlate = riderPlate;
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        res.status(200).json({ message: 'Accepted' });
    }
});

app.post('/counter', (req, res) => {
    const { id, counterPrice, riderName, riderPlate } = req.body;
    let orders = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile)) : [];
    let orderIndex = orders.findIndex(o => o.id === id);
    if (orderIndex !== -1) {
        orders[orderIndex].status = 'Counter-Offer';
        orders[orderIndex].counterPrice = counterPrice;
        orders[orderIndex].riderName = riderName;
        orders[orderIndex].riderPlate = riderPlate;
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        res.status(200).json({ message: 'Counter sent' });
    }
});

app.post('/pay-and-lock', (req, res) => {
    const { id, finalPrice, paymentRef } = req.body;
    let orders = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile)) : [];
    let orderIndex = orders.findIndex(o => o.id === id);
    if (orderIndex !== -1) {
        orders[orderIndex].status = 'En Route'; // Money secured!
        orders[orderIndex].price = finalPrice;
        orders[orderIndex].paymentRef = paymentRef;
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        res.status(200).json({ message: 'Locked' });
    }
});

app.post('/decline-counter', (req, res) => {
    const { id } = req.body;
    let orders = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile)) : [];
    let orderIndex = orders.findIndex(o => o.id === id);
    if (orderIndex !== -1) {
        orders[orderIndex].status = 'Pending Rider';
        delete orders[orderIndex].counterPrice;
        delete orders[orderIndex].riderName;
        delete orders[orderIndex].riderPlate;
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        res.status(200).json({ message: 'Declined' });
    }
});

app.post('/complete', (req, res) => {
    const { id } = req.body;
    let orders = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile)) : [];
    let orderIndex = orders.findIndex(o => o.id === id);
    if (orderIndex !== -1) {
        orders[orderIndex].status = 'Delivered';
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        res.status(200).json({ message: 'Delivered' });
    }
});

app.post('/cancel', (req, res) => {
    const { id } = req.body;
    let orders = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile)) : [];
    orders = orders.filter(o => o.id !== id);
    fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
    res.status(200).json({ message: 'Cancelled' });
});

app.post('/delete-history', (req, res) => {
    const { id } = req.body;
    let orders = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile)) : [];
    orders = orders.filter(o => o.id !== id);
    fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
    res.status(200).json({ message: 'History deleted' });
});

// --- GOD MODE ---
app.post('/admin-auth', (req, res) => {
    if (req.body.password === "matrix-ceo") res.status(200).json({ message: "Access Granted" });
    else res.status(401).json({ message: "Access Denied" });
});

app.get('/admin-data', (req, res) => {
    const orders = fs.existsSync('database.json') ? JSON.parse(fs.readFileSync('database.json')) : [];
    const vendors = fs.existsSync('vendors.json') ? JSON.parse(fs.readFileSync('vendors.json')) : [];
    const riders = fs.existsSync('riders.json') ? JSON.parse(fs.readFileSync('riders.json')) : [];
    res.json({ orders, vendors, riders });
});

app.post('/admin-ban', (req, res) => {
    const { username, role } = req.body;
    const file = role === 'rider' ? 'riders.json' : 'vendors.json';
    if (fs.existsSync(file)) {
        let users = JSON.parse(fs.readFileSync(file));
        users = users.filter(u => u.username !== username);
        fs.writeFileSync(file, JSON.stringify(users, null, 2));
        res.status(200).json({ message: "User eradicated." });
    } else res.status(400).json({ message: "Database not found." });
});

app.post('/admin-delete-order', (req, res) => {
    const { id } = req.body;
    if (fs.existsSync('database.json')) {
        let orders = JSON.parse(fs.readFileSync('database.json'));
        orders = orders.filter(o => o.id !== id);
        fs.writeFileSync('database.json', JSON.stringify(orders, null, 2));
        res.status(200).json({ message: "Order wiped." });
    }
});

app.post('/admin-verify-rider', (req, res) => {
    const username = req.body.username.toLowerCase();
    if (fs.existsSync('riders.json')) {
        let riders = JSON.parse(fs.readFileSync('riders.json'));
        let rider = riders.find(r => r.username === username);
        if (rider) {
            rider.verified = true; 
            fs.writeFileSync('riders.json', JSON.stringify(riders, null, 2));
            res.status(200).json({ message: "Verified." });
        }
    }
});

app.listen(PORT, () => console.log(`🚀 Matrix running on port ${PORT}`));