const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs'); // We are back to the reliable local File System

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serves your HTML files directly

// 1. Helper function to read/write to your local database.json
function saveToDatabase(newOrder) {
    const dbFile = 'database.json';
    let orders = [];

    if (fs.existsSync(dbFile)) {
        const rawData = fs.readFileSync(dbFile);
        orders = JSON.parse(rawData);
    }

    // Assign our simple, C++ style timestamp ID
    newOrder.id = Date.now().toString(); 
    newOrder.timestamp = new Date().toISOString();
    newOrder.status = "Pending Rider";
    orders.push(newOrder);

    fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
}

// 2. Receive an order
app.post('/order', (req, res) => {
    saveToDatabase(req.body);
    console.log("🔔 NEW LOCAL ORDER RECEIVED!");
    res.status(200).json({ message: "Order saved locally! Dispatching..." });
});

// 3. Send orders to the Rider Dashboard
app.get('/orders', (req, res) => {
    const dbFile = 'database.json';
    if (fs.existsSync(dbFile)) {
        const rawData = fs.readFileSync(dbFile);
        res.status(200).json(JSON.parse(rawData));
    } else {
        res.status(200).json([]);
    }
});

// 4. Accept a job (Upgraded with Trust Engine)
app.post('/accept', (req, res) => {
    const { id, riderName, riderPlate } = req.body;
    const dbFile = 'database.json';

    if (fs.existsSync(dbFile)) {
        let orders = JSON.parse(fs.readFileSync(dbFile));
        let orderIndex = orders.findIndex(order => order.id === id);
        
        if (orderIndex !== -1) {
            orders[orderIndex].status = "Accepted - Rider En Route";
            // Inject the Rider's identity into the database
            orders[orderIndex].riderName = riderName;
            orders[orderIndex].riderPlate = riderPlate;
            
            fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
            res.status(200).json({ message: "Job locked to you!" });
        } else {
            res.status(404).json({ message: "Job not found." });
        }
    }
});

// 5. Complete a job (Mark as Delivered)
app.post('/complete', (req, res) => {
    const jobId = req.body.id;
    const dbFile = 'database.json';

    if (fs.existsSync(dbFile)) {
        let orders = JSON.parse(fs.readFileSync(dbFile));
        let orderIndex = orders.findIndex(order => order.id === jobId);
        
        if (orderIndex !== -1) {
            // Update the state to Delivered
            orders[orderIndex].status = "Delivered";
            fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
            
            console.log(`📦 LOCAL JOB ${jobId} DELIVERED!`);
            res.status(200).json({ message: "Payload delivered and archived!" });
        } else {
            res.status(404).json({ message: "Job not found." });
        }
    }
});

// 6. Cancel/Abort a job (Vendor Side)
app.post('/cancel', (req, res) => {
    const jobId = req.body.id;
    const dbFile = 'database.json';

    if (fs.existsSync(dbFile)) {
        let orders = JSON.parse(fs.readFileSync(dbFile));
        let orderIndex = orders.findIndex(order => order.id === jobId);
        
        // ONLY allow cancellation if a rider hasn't accepted it yet
        if (orderIndex !== -1 && orders[orderIndex].status === "Pending Rider") {
            // Remove the order completely from the database
            orders.splice(orderIndex, 1); 
            fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
            
            console.log(`🚫 LOCAL JOB ${jobId} ABORTED BY VENDOR!`);
            res.status(200).json({ message: "Dispatch aborted successfully." });
        } else if (orderIndex !== -1) {
            res.status(400).json({ message: "Cannot cancel. Rider already en route!" });
        } else {
            res.status(404).json({ message: "Job not found." });
        }
    }
});

// 7. Rider Counters with a New Price (Upgraded with Trust Engine)
app.post('/counter', (req, res) => {
    const { id, counterPrice, riderName, riderPlate } = req.body;
    const dbFile = 'database.json';

    if (fs.existsSync(dbFile)) {
        let orders = JSON.parse(fs.readFileSync(dbFile));
        let index = orders.findIndex(o => o.id === id);
        
        if (index !== -1 && orders[index].status === "Pending Rider") {
            orders[index].status = "Counter-Offer";
            orders[index].counterPrice = counterPrice;
            // Inject the Rider's identity into the database
            orders[index].riderName = riderName;
            orders[index].riderPlate = riderPlate;
            
            fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
            res.status(200).json({ message: "Counter offer sent!" });
        }
    }
});

// 8. Vendor Accepts or Declines the Counter
app.post('/vendor-response', (req, res) => {
    const { id, accepted } = req.body;
    const dbFile = 'database.json';

    if (fs.existsSync(dbFile)) {
        let orders = JSON.parse(fs.readFileSync(dbFile));
        let index = orders.findIndex(o => o.id === id);
        
        if (index !== -1 && orders[index].status === "Counter-Offer") {
            if (accepted) {
                // Vendor agrees! Lock the job and update the official price.
                orders[index].status = "Accepted - Rider En Route";
                orders[index].price = orders[index].counterPrice; 
                delete orders[index].counterPrice;
            } else {
                // Vendor refuses. Send the job back to the open market.
                orders[index].status = "Pending Rider"; 
                delete orders[index].counterPrice;
            }
            fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
            res.status(200).json({ message: "Response processed!" });
        }
    }
});

// 9. Delete a Delivered Job from History
app.post('/delete-history', (req, res) => {
    const { id } = req.body;
    const dbFile = 'database.json';

    if (fs.existsSync(dbFile)) {
        let orders = JSON.parse(fs.readFileSync(dbFile));
        let index = orders.findIndex(o => o.id === id);
        
        // Safety check: Only allow deletion if the status is actually "Delivered"
        if (index !== -1 && orders[index].status === "Delivered") {
            orders.splice(index, 1); // Permanently erase from the database array
            fs.writeFileSync(dbFile, JSON.stringify(orders, null, 2));
            
            console.log(`🗑️ LOCAL JOB ${id} ERASED FROM HISTORY!`);
            res.status(200).json({ message: "Receipt destroyed." });
        } else {
            res.status(400).json({ message: "Could not delete record." });
        }
    }
});

// --- NEW: VENDOR AUTHENTICATION ---
app.post('/vendor-auth', (req, res) => {
    const { username, password } = req.body;
    const authFile = 'vendors.json'; // We will store users in a separate file
    
    let vendors = [];
    if (fs.existsSync(authFile)) {
        vendors = JSON.parse(fs.readFileSync(authFile));
    }

    // Check if the username already exists
    const existingVendor = vendors.find(v => v.username === username.toLowerCase());
    
    if (existingVendor) {
        // User exists, verify password
        if (existingVendor.password === password) {
            res.status(200).json({ message: "Login successful!" });
        } else {
            res.status(401).json({ message: "Incorrect password." });
        }
    } else {
        // User does not exist, auto-register them
        vendors.push({ username: username.toLowerCase(), password: password });
        fs.writeFileSync(authFile, JSON.stringify(vendors, null, 2));
        res.status(200).json({ message: "Account created successfully!" });
    }
});

// --- NEW: RIDER AUTHENTICATION ---
app.post('/rider-auth', (req, res) => {
    const { username, password, name, plate } = req.body;
    const authFile = 'riders.json'; // Riders get their own database file
    
    let riders = [];
    if (fs.existsSync(authFile)) {
        riders = JSON.parse(fs.readFileSync(authFile));
    }

    const existingRider = riders.find(r => r.username === username.toLowerCase());
    
    if (existingRider) {
        // User exists, verify password
        if (existingRider.password === password) {
            // Send back their saved profile details!
            res.status(200).json({ message: "Login successful!", profile: { name: existingRider.name, plate: existingRider.plate } });
        } else {
            res.status(401).json({ message: "Incorrect password." });
        }
    } else {
        // User does not exist. Ensure they provided Name and Plate for the Trust Engine.
        if (!name || !plate) {
            res.status(400).json({ message: "New accounts require Full Name and Plate Number." });
            return;
        }
        const newRider = { username: username.toLowerCase(), password: password, name: name, plate: plate.toUpperCase() };
        riders.push(newRider);
        fs.writeFileSync(authFile, JSON.stringify(riders, null, 2));
        res.status(200).json({ message: "Account created!", profile: { name: newRider.name, plate: newRider.plate } });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 QuickRider Matrix running on port ${PORT}`);
});