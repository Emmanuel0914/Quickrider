const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname))); 

const dbFile = 'database.json';
const riderFile = 'riders.json';
const vendorFile = 'vendors.json';

// Ensure DB files exist
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify([], null, 2));
if (!fs.existsSync(riderFile)) fs.writeFileSync(riderFile, JSON.stringify([], null, 2));
if (!fs.existsSync(vendorFile)) fs.writeFileSync(vendorFile, JSON.stringify([], null, 2));

// --- CORE ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/vendor', (req, res) => res.sendFile(path.join(__dirname, 'vendor.html')));
app.get('/rider', (req, res) => res.sendFile(path.join(__dirname, 'rider.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// --- AUTHENTICATION ---
app.post('/vendor-auth', (req, res) => {
    const { username, password } = req.body;
    let vendors = JSON.parse(fs.readFileSync(vendorFile));
    let vendor = vendors.find(v => v.username === username);
    if (vendor) {
        if (vendor.password === password) res.status(200).json({ message: "Login successful" });
        else res.status(401).json({ message: "Invalid credentials" });
    } else {
        vendors.push({ username, password });
        fs.writeFileSync(vendorFile, JSON.stringify(vendors, null, 2));
        res.status(200).json({ message: "Account created" });
    }
});

app.post('/rider-auth', (req, res) => {
    const username = req.body.username.toLowerCase(); 
    const { password, name, plate, guarantor, selfie, bikePhoto } = req.body;
    let riders = JSON.parse(fs.readFileSync(riderFile));
    let rider = riders.find(r => r.username === username);
    
    if (rider) {
        if (rider.password === password) res.status(200).json({ message: "Login successful", profile: rider });
        else res.status(401).json({ message: "Invalid credentials" });
    } else {
        if (!name || !plate || !guarantor || !selfie || !bikePhoto) return res.status(400).json({ message: "All KYC fields required for new accounts." });
        rider = { username, password, name, plate, guarantor, selfie, bikePhoto, verified: false, totalRating: 0, trips: 0, avgRating: 0 };
        riders.push(rider);
        fs.writeFileSync(riderFile, JSON.stringify(riders, null, 2));
        res.status(200).json({ message: "Account created. Pending KYC.", profile: rider });
    }
});

app.get('/rider/status', (req, res) => {
    const username = req.query.username.toLowerCase();
    let riders = JSON.parse(fs.readFileSync(riderFile));
    let rider = riders.find(r => r.username === username);
    if (rider) res.json({ verified: rider.verified });
    else res.status(404).json({ message: "Not found" });
});

// --- ORDER / ESCROW LOGIC ---
app.post('/order', (req, res) => {
    // 🚨 NEW: Generate Secure 4-Digit Handover PIN
    const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
    const order = { ...req.body, id: Date.now().toString(), status: 'Pending Rider', rated: false, deletedByVendor: false, pin: generatedPin };
    
    let orders = JSON.parse(fs.readFileSync(dbFile));
    orders.push(order);
    fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
    res.status(200).json({ message: 'Order created', id: order.id });
});

app.get('/orders', (req, res) => {
    const orders = JSON.parse(fs.readFileSync(dbFile));
    res.status(200).json(orders);
});

app.post('/accept', (req, res) => {
    const { id, riderName, riderPlate, eta } = req.body;
    let orders = JSON.parse(fs.readFileSync(dbFile));
    let idx = orders.findIndex(o => o.id === id);
    if (idx !== -1) {
        orders[idx].status = 'Awaiting Escrow'; 
        orders[idx].riderName = riderName;
        orders[idx].riderPlate = riderPlate;
        orders[idx].eta = eta;
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        res.status(200).json({ message: 'Accepted' });
    }
});

app.post('/counter', (req, res) => {
    const { id, counterPrice, riderName, riderPlate } = req.body;
    let orders = JSON.parse(fs.readFileSync(dbFile));
    let idx = orders.findIndex(o => o.id === id);
    if (idx !== -1) {
        orders[idx].status = 'Counter-Offer';
        orders[idx].counterPrice = counterPrice;
        orders[idx].riderName = riderName;
        orders[idx].riderPlate = riderPlate;
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        res.status(200).json({ message: 'Counter sent' });
    }
});

app.post('/pay-and-lock', (req, res) => {
    const { id, finalPrice, paymentRef } = req.body;
    let orders = JSON.parse(fs.readFileSync(dbFile));
    let idx = orders.findIndex(o => o.id === id);
    if (idx !== -1) {
        orders[idx].status = 'En Route'; 
        orders[idx].price = finalPrice;
        orders[idx].paymentRef = paymentRef;
        orders[idx].startTime = Date.now();
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        res.status(200).json({ message: 'Locked' });
    }
});

app.post('/decline-counter', (req, res) => {
    const { id } = req.body;
    let orders = JSON.parse(fs.readFileSync(dbFile));
    let idx = orders.findIndex(o => o.id === id);
    if (idx !== -1) {
        orders[idx].status = 'Pending Rider';
        delete orders[idx].counterPrice;
        delete orders[idx].riderName;
        delete orders[idx].riderPlate;
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        res.status(200).json({ message: 'Declined' });
    }
});

app.post('/complete', (req, res) => {
    const { id, podImage, submittedPin } = req.body;
    let orders = JSON.parse(fs.readFileSync(dbFile));
    let idx = orders.findIndex(o => o.id === id);
    
    if (idx !== -1) {
        // 🚨 NEW: Server formally rejects completion if PIN is wrong
        if (orders[idx].pin !== submittedPin) {
            return res.status(400).json({ message: 'Incorrect Handover PIN.' });
        }
        
        orders[idx].status = 'Delivered';
        orders[idx].podImage = podImage; 
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        res.status(200).json({ message: 'Delivered' });
    }
});

app.post('/rate-order', (req, res) => {
    const { id, rating } = req.body;
    let orders = JSON.parse(fs.readFileSync(dbFile));
    let idx = orders.findIndex(o => o.id === id);
    if(idx !== -1) {
        orders[idx].rated = true;
        orders[idx].rating = rating;
        orders[idx].status = 'Archived'; 
        
        let riders = JSON.parse(fs.readFileSync(riderFile));
        let rIdx = riders.findIndex(r => r.plate === orders[idx].riderPlate);
        if(rIdx !== -1) {
            if(!riders[rIdx].totalRating) { riders[rIdx].totalRating = 0; riders[rIdx].trips = 0; }
            riders[rIdx].totalRating += rating;
            riders[rIdx].trips += 1;
            riders[rIdx].avgRating = (riders[rIdx].totalRating / riders[rIdx].trips).toFixed(1);
        }
        
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
        fs.writeFileSync(riderFile, JSON.stringify(riders, null, 2));
        res.status(200).json({ success: true });
    }
});

app.post('/cancel', (req, res) => {
    const { id } = req.body;
    let orders = JSON.parse(fs.readFileSync(dbFile));
    orders = orders.filter(o => o.id !== id);
    fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
    res.status(200).json({ message: 'Cancelled' });
});

app.post('/delete-history', (req, res) => {
    const { id } = req.body;
    let orders = JSON.parse(fs.readFileSync(dbFile));
    let idx = orders.findIndex(o => o.id === id);
    if (idx !== -1) {
        orders[idx].deletedByVendor = true;
        fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
    }
    res.status(200).json({ message: 'History hidden for vendor' });
});

// --- ADMIN / GOD MODE ---
app.post('/admin-auth', (req, res) => {
    if (req.body.password === "matrix-ceo") res.status(200).json({ message: "Access Granted" });
    else res.status(401).json({ message: "Access Denied" });
});

app.get('/admin-data', (req, res) => {
    const orders = JSON.parse(fs.readFileSync(dbFile));
    const vendors = JSON.parse(fs.readFileSync(vendorFile));
    const riders = JSON.parse(fs.readFileSync(riderFile));
    res.json({ orders, vendors, riders });
});

app.post('/admin-verify-rider', (req, res) => {
    const username = req.body.username.toLowerCase();
    let riders = JSON.parse(fs.readFileSync(riderFile));
    let rider = riders.find(r => r.username === username);
    if (rider) {
        rider.verified = true; 
        fs.writeFileSync(riderFile, JSON.stringify(riders, null, 2));
        res.status(200).json({ message: "Verified." });
    }
});

app.listen(PORT, () => console.log(`🚀 Matrix running on port ${PORT}`));